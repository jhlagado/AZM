import type { Diagnostic } from '../model/diagnostic.js';
import type { Fixup } from '../model/fixup.js';
import type { SourceItem } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { SourceSpan } from '../source/source-span.js';
import type { EmittedSourceSegment } from '../outputs/types.js';
import {
  diagnostic,
  evaluateExpression,
  lookupEquateRecord,
  type EquateRecord,
  type LayoutRecord,
} from '../semantics/expression-evaluation.js';
import type { DataValue } from '../model/source-item.js';
import {
  emitAbs16Expression,
  emitInstruction,
  patchFixups,
} from './fixup-emission.js';
import {
  absoluteCodeAddress,
  absoluteDataAddress,
  advanceCodePlacement,
  advancePlacement,
  applyOrg,
  computeResolvedBases,
  createPlacementState,
  placementAddress,
  placementForOrg,
  type PlacementState,
} from './placement.js';
import {
  alignmentPadding,
  stringDirectiveBytes,
  type AddressState,
} from './address-planning.js';

export interface EmittedProgram {
  readonly origin: number;
  readonly initializedAddresses: readonly number[];
  readonly reservedAddresses: readonly number[];
  readonly sourceSegments: readonly EmittedSourceSegment[];
  readonly bytes: Uint8Array;
}

interface EmitContext {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly layouts: Map<string, LayoutRecord>;
  readonly symbols: SymbolTable;
  readonly diagnostics: Diagnostic[];
  readonly image: Map<number, number>;
  readonly initializedAddresses: Set<number>;
  readonly reservedAddresses: Set<number>;
  readonly sourceSegments: EmittedSourceSegment[];
  readonly placement: PlacementState;
  binFrom: number | undefined;
  binTo: number | undefined;
}

type EmitItemHandler = (
  context: EmitContext,
  item: SourceItem,
  items: readonly SourceItem[],
  itemIndex: number,
) => boolean | void;

const EMIT_ITEM_HANDLERS: Record<SourceItem['kind'], EmitItemHandler> = {
  org: (context, item, items, itemIndex) =>
    emitOrg(context, items, itemIndex, item as Extract<SourceItem, { readonly kind: 'org' }>),
  comment: () => undefined,
  equ: () => undefined,
  label: () => undefined,
  enum: () => undefined,
  type: () => undefined,
  'type-alias': () => undefined,
  db: (context, item) => emitDb(context, item as Extract<SourceItem, { readonly kind: 'db' }>),
  dw: (context, item) => emitDw(context, item as Extract<SourceItem, { readonly kind: 'dw' }>),
  ds: (context, item) => emitDs(context, item as Extract<SourceItem, { readonly kind: 'ds' }>),
  align: (context, item) =>
    emitAlign(context, item as Extract<SourceItem, { readonly kind: 'align' }>),
  end: () => true,
  binfrom: (context, item) =>
    emitBinRangeControl(context, item as Extract<SourceItem, { readonly kind: 'binfrom' }>),
  binto: (context, item) =>
    emitBinRangeControl(context, item as Extract<SourceItem, { readonly kind: 'binto' }>),
  'string-data': (context, item) =>
    emitStringData(context, item as Extract<SourceItem, { readonly kind: 'string-data' }>),
  instruction: (context, item) =>
    emitProgramInstruction(context, item as Extract<SourceItem, { readonly kind: 'instruction' }>),
};

function toByte(value: number): number {
  return value & 0xff;
}

function writeImageByte(
  image: Map<number, number>,
  initializedAddresses: Set<number>,
  address: number,
  value: number,
): void {
  image.set(address, toByte(value));
  initializedAddresses.add(address);
}

function writeImageBytes(
  image: Map<number, number>,
  initializedAddresses: Set<number>,
  startAddress: number,
  bytes: readonly number[],
): void {
  for (let index = 0; index < bytes.length; index += 1) {
    writeImageByte(image, initializedAddresses, startAddress + index, bytes[index] ?? 0);
  }
}

function addSourceSegment(
  segments: EmittedSourceSegment[],
  span: SourceSpan,
  start: number,
  end: number,
  kind: EmittedSourceSegment['kind'],
): void {
  if (end <= start) return;
  segments.push({
    start,
    end,
    file: span.sourceName,
    line: span.line,
    column: span.column,
    kind,
    confidence: 'high',
  });
}

function clipSourceSegment(
  segment: EmittedSourceSegment,
  start: number,
  end: number,
): EmittedSourceSegment | undefined {
  const clippedStart = Math.max(segment.start, start);
  const clippedEnd = Math.min(segment.end, end);
  if (clippedEnd <= clippedStart) return undefined;
  return { ...segment, start: clippedStart, end: clippedEnd };
}

function outputRange(
  initializedAddresses: ReadonlySet<number>,
  reservedAddresses: ReadonlySet<number>,
  origin: number,
  binFrom: number | undefined,
  binTo: number | undefined,
): { readonly start: number; readonly end: number } {
  const initialized = [...initializedAddresses];
  const touched = [...initializedAddresses, ...reservedAddresses];
  const start = binFrom ?? (touched.length > 0 ? Math.min(...touched) : origin);
  const end = binTo === undefined ? defaultExclusiveEnd(initialized, start) : binTo + 1;
  return { start, end: Math.max(start, end) };
}

function defaultExclusiveEnd(initializedAddresses: readonly number[], start: number): number {
  if (initializedAddresses.length === 0) {
    return start;
  }
  return Math.max(...initializedAddresses) + 1;
}

function flattenImage(image: ReadonlyMap<number, number>, start: number, end: number): Uint8Array {
  const bytes: number[] = [];
  for (let address = start; address < end; address += 1) {
    bytes.push(image.get(address) ?? 0);
  }
  return Uint8Array.from(bytes);
}

function activePlacementAddress(placement: PlacementState): number {
  const bases = computeResolvedBases(placement);
  return placement.activePlacement === 'data'
    ? absoluteDataAddress(placement, bases)
    : absoluteCodeAddress(placement, bases);
}

function emitDbValue(
  value: DataValue,
  emitAddress: number,
  itemSpan: { readonly sourceName: string; readonly line: number; readonly column: number },
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
  diagnostics: Diagnostic[],
  image: Map<number, number>,
  initializedAddresses: Set<number>,
  placement: PlacementState,
): void {
  if (value.kind === 'string-fragment') {
    for (const char of value.value) {
      const nextAddress = activePlacementAddress(placement);
      writeImageByte(image, initializedAddresses, nextAddress, char.codePointAt(0) ?? 0);
      advancePlacement(placement, 1);
    }
    return;
  }

  if (value.kind === 'symbol') {
    const equate = lookupEquateRecord(equates, value.name);
    if (equate?.record.stringValue !== undefined) {
      for (const char of equate.record.stringValue) {
        const nextAddress = activePlacementAddress(placement);
        writeImageByte(image, initializedAddresses, nextAddress, char.codePointAt(0) ?? 0);
        advancePlacement(placement, 1);
      }
      return;
    }
  }

  const nextAddress = activePlacementAddress(placement);
  const evaluated = evaluateExpression(value, labels, equates, itemSpan, diagnostics, {
    currentLocation: emitAddress,
    layouts,
  });
  if (evaluated !== undefined) {
    writeImageByte(image, initializedAddresses, nextAddress, evaluated);
    advancePlacement(placement, 1);
  }
}

export function emitProgramImage(
  items: readonly SourceItem[],
  addressState: AddressState,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): EmittedProgram {
  const context = createEmitContext(addressState, symbols, diagnostics);
  let ended = false;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (shouldSkipAfterEnd(ended, item)) {
      continue;
    }
    ended = EMIT_ITEM_HANDLERS[item.kind](context, item, items, itemIndex) === true || ended;
  }

  return emittedProgramFromContext(context, addressState.origin, diagnostics);
}

function shouldSkipAfterEnd(ended: boolean, item: SourceItem): boolean {
  return ended && item.kind !== 'binfrom' && item.kind !== 'binto';
}

function emittedProgramFromContext(
  context: EmitContext,
  defaultOrigin: number,
  diagnostics: readonly Diagnostic[],
): EmittedProgram {
  const range = outputRange(
    context.initializedAddresses,
    context.reservedAddresses,
    defaultOrigin,
    context.binFrom,
    context.binTo,
  );
  const bytes = flattenImage(context.image, range.start, range.end);

  return {
    origin: range.start,
    initializedAddresses: sortedAddresses(context.initializedAddresses),
    reservedAddresses: sortedAddresses(context.reservedAddresses),
    sourceSegments: clippedSourceSegments(context.sourceSegments, range.start, range.end),
    bytes: diagnostics.length > 0 ? new Uint8Array() : bytes,
  };
}

function sortedAddresses(addresses: ReadonlySet<number>): readonly number[] {
  return [...addresses].sort((a, b) => a - b);
}

function clippedSourceSegments(
  sourceSegments: readonly EmittedSourceSegment[],
  start: number,
  end: number,
): readonly EmittedSourceSegment[] {
  return sourceSegments
    .map((segment) => clipSourceSegment(segment, start, end))
    .filter((segment): segment is EmittedSourceSegment => segment !== undefined)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function createEmitContext(
  addressState: AddressState,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): EmitContext {
  return {
    labels: addressState.labels,
    equates: addressState.equates,
    layouts: addressState.layouts,
    symbols,
    diagnostics,
    image: new Map<number, number>(),
    initializedAddresses: new Set<number>(),
    reservedAddresses: new Set<number>(),
    sourceSegments: [],
    placement: createPlacementState(),
    binFrom: undefined,
    binTo: undefined,
  };
}

function emitOrg(
  context: EmitContext,
  items: readonly SourceItem[],
  itemIndex: number,
  item: Extract<SourceItem, { readonly kind: 'org' }>,
): void {
  context.placement.activePlacement = placementForOrg(items, itemIndex);
  const value = evaluateEmitExpression(context, item.expression, item.span, placementAddress(context.placement));
  if (value !== undefined) {
    applyOrg(context.placement, value);
  }
}

function emitDb(context: EmitContext, item: Extract<SourceItem, { readonly kind: 'db' }>): void {
  for (const value of item.values) {
    emitDbValue(
      value,
      activePlacementAddress(context.placement),
      item.span,
      context.labels,
      context.equates,
      context.layouts,
      context.diagnostics,
      context.image,
      context.initializedAddresses,
      context.placement,
    );
  }
}

function emitDw(context: EmitContext, item: Extract<SourceItem, { readonly kind: 'dw' }>): void {
  for (const expression of item.values) {
    const emitAddress = activePlacementAddress(context.placement);
    const bytes: number[] = [];
    const fixups: Fixup[] = [];
    if (
      emitAbs16Expression(
        expression,
        item.span,
        emitAddress,
        context.labels,
        context.equates,
        context.diagnostics,
        bytes,
        fixups,
        context.layouts,
      )
    ) {
      patchFixups(fixups, context.symbols, bytes, context.diagnostics);
      writeImageBytes(context.image, context.initializedAddresses, emitAddress, bytes);
      advancePlacement(context.placement, 2);
    }
  }
}

function emitDs(context: EmitContext, item: Extract<SourceItem, { readonly kind: 'ds' }>): void {
  const emitAddress = activePlacementAddress(context.placement);
  const size = evaluateEmitExpression(context, item.size, item.span, emitAddress);
  if (size === undefined) {
    return;
  }
  const fill =
    item.fill === undefined
      ? undefined
      : evaluateEmitExpression(context, item.fill, item.span, emitAddress);
  if (item.fill !== undefined && fill === undefined) {
    return;
  }
  if (fill !== undefined) {
    for (let index = 0; index < size; index += 1) {
      writeImageByte(context.image, context.initializedAddresses, emitAddress + index, fill);
    }
  } else {
    for (let index = 0; index < size; index += 1) {
      context.reservedAddresses.add(emitAddress + index);
    }
  }
  advancePlacement(context.placement, size);
}

function emitAlign(context: EmitContext, item: Extract<SourceItem, { readonly kind: 'align' }>): void {
  const emitAddress = activePlacementAddress(context.placement);
  const alignment = evaluateEmitExpression(context, item.alignment, item.span, emitAddress);
  if (alignment === undefined) {
    return;
  }
  if (alignment <= 0) {
    context.diagnostics.push(diagnostic(item.span, `.align value must be positive: ${alignment}.`));
    return;
  }
  const padding = alignmentPadding(emitAddress, alignment);
  for (let index = 0; index < padding; index += 1) {
    writeImageByte(context.image, context.initializedAddresses, emitAddress + index, 0);
  }
  advancePlacement(context.placement, padding);
  addSourceSegment(context.sourceSegments, item.span, emitAddress, emitAddress + padding, 'directive');
}

function emitBinRangeControl(
  context: EmitContext,
  item: Extract<SourceItem, { readonly kind: 'binfrom' | 'binto' }>,
): void {
  const value = evaluateEmitExpression(context, item.expression, item.span, placementAddress(context.placement));
  if (value === undefined) {
    return;
  }
  if (item.kind === 'binfrom') {
    context.binFrom = value;
  } else {
    context.binTo = value;
  }
}

function emitStringData(
  context: EmitContext,
  item: Extract<SourceItem, { readonly kind: 'string-data' }>,
): void {
  for (const value of stringDirectiveBytes(item.directive, item.value)) {
    const stringEmitAddress = activePlacementAddress(context.placement);
    writeImageByte(context.image, context.initializedAddresses, stringEmitAddress, value);
    advancePlacement(context.placement, 1);
  }
}

function emitProgramInstruction(
  context: EmitContext,
  item: Extract<SourceItem, { readonly kind: 'instruction' }>,
): void {
  const bases = computeResolvedBases(context.placement);
  const codeAddress = absoluteCodeAddress(context.placement, bases);
  const bytes: number[] = [];
  const fixups: Fixup[] = [];
  const size = emitInstruction(
    item.instruction,
    item.span,
    codeAddress,
    context.labels,
    context.equates,
    context.diagnostics,
    bytes,
    fixups,
    context.layouts,
  );
  patchFixups(fixups, context.symbols, bytes, context.diagnostics);
  writeImageBytes(context.image, context.initializedAddresses, codeAddress, bytes);
  advanceCodePlacement(context.placement, size);
  addSourceSegment(
    context.sourceSegments,
    item.emittedSource?.span ?? item.span,
    codeAddress,
    codeAddress + size,
    item.emittedSource?.kind ?? 'code',
  );
  if (context.placement.activePlacement === 'data') {
    const dataAddress = absoluteDataAddress(context.placement, bases);
    writeImageBytes(context.image, context.initializedAddresses, dataAddress, bytes);
    advancePlacement(context.placement, size);
  }
}

function evaluateEmitExpression(
  context: EmitContext,
  expression: Parameters<typeof evaluateExpression>[0],
  span: Parameters<typeof evaluateExpression>[3],
  currentLocation: number,
): number | undefined {
  return evaluateExpression(expression, context.labels, context.equates, span, context.diagnostics, {
    currentLocation,
    layouts: context.layouts,
  });
}
