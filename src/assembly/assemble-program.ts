import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { Fixup } from '../model/fixup.js';
import type { DataValue, SourceItem } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { SourceSpan } from '../source/source-span.js';
import type { EmittedSourceSegment } from '../outputs/types.js';
import {
  diagnostic,
  evaluateExpression,
  type EquateRecord,
  type LayoutRecord,
  validateLayouts,
} from './expression-evaluation.js';
import {
  emitAbs16Expression,
  emitInstruction,
  instructionSize,
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

export interface AssemblyResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: SymbolTable;
  readonly origin: number;
  readonly initializedAddresses: readonly number[];
  readonly reservedAddresses: readonly number[];
  readonly sourceSegments: readonly EmittedSourceSegment[];
  readonly bytes: Uint8Array;
}

export function assembleProgram(items: readonly SourceItem[]): AssemblyResult {
  const diagnostics: Diagnostic[] = [];
  const addressState = buildAddressState(items, diagnostics);
  const { labels, equates, layouts, origin } = addressState;
  if (diagnostics.length > 0) {
    return {
      diagnostics,
      symbols: {},
      origin,
      initializedAddresses: [],
      reservedAddresses: [],
      sourceSegments: [],
      bytes: new Uint8Array(),
    };
  }

  const symbols = resolveSymbols(labels, equates, layouts, diagnostics);
  if (diagnostics.length > 0) {
    return {
      diagnostics,
      symbols,
      origin,
      initializedAddresses: [],
      reservedAddresses: [],
      sourceSegments: [],
      bytes: new Uint8Array(),
    };
  }

  const image = new Map<number, number>();
  const initializedAddresses = new Set<number>();
  const reservedAddresses = new Set<number>();
  const sourceSegments: EmittedSourceSegment[] = [];
  const placement = createPlacementState();
  let ended = false;
  let binFrom: number | undefined;
  let binTo: number | undefined;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (ended && item.kind !== 'binfrom' && item.kind !== 'binto') {
      continue;
    }

    switch (item.kind) {
      case 'org': {
        placement.activePlacement = placementForOrg(items, itemIndex);
        const value = evaluateExpression(item.expression, labels, equates, item.span, diagnostics, {
          currentLocation: placementAddress(placement),
          layouts,
        });
        if (value !== undefined) {
          applyOrg(placement, value);
        }
        break;
      }
      case 'equ':
      case 'label':
      case 'enum':
      case 'type':
        break;
      case 'db':
        {
          const segmentStart = activePlacementAddress(placement);
          for (const value of item.values) {
            if (value.kind === 'string-fragment') {
              for (const char of value.value) {
                const emitAddress = activePlacementAddress(placement);
                writeImageByte(image, initializedAddresses, emitAddress, char.codePointAt(0) ?? 0);
                advancePlacement(placement, 1);
              }
            } else {
              const emitAddress = activePlacementAddress(placement);
              const evaluated = evaluateExpression(value, labels, equates, item.span, diagnostics, {
                currentLocation: emitAddress,
                layouts,
              });
              if (evaluated !== undefined) {
                writeImageByte(image, initializedAddresses, emitAddress, evaluated);
                advancePlacement(placement, 1);
              }
            }
          }
          void segmentStart;
        }
        break;
      case 'dw':
        {
          const segmentStart = activePlacementAddress(placement);
          for (const expression of item.values) {
            const emitAddress = activePlacementAddress(placement);
            const bytes: number[] = [];
            const fixups: Fixup[] = [];
            if (
              emitAbs16Expression(
                expression,
                item.span,
                emitAddress,
                labels,
                equates,
                diagnostics,
                bytes,
                fixups,
                layouts,
              )
            ) {
              patchFixups(fixups, symbols, bytes, diagnostics);
              writeImageBytes(image, initializedAddresses, emitAddress, bytes);
              advancePlacement(placement, 2);
            }
          }
          void segmentStart;
        }
        break;
      case 'ds': {
        const emitAddress = activePlacementAddress(placement);
        const size = evaluateExpression(item.size, labels, equates, item.span, diagnostics, {
          currentLocation: emitAddress,
          layouts,
        });
        if (size !== undefined) {
          const fill =
            item.fill === undefined
              ? undefined
              : evaluateExpression(item.fill, labels, equates, item.span, diagnostics, {
                  currentLocation: emitAddress,
                  layouts,
                });
          if (item.fill === undefined || fill !== undefined) {
            if (fill !== undefined) {
              for (let index = 0; index < size; index += 1) {
                writeImageByte(image, initializedAddresses, emitAddress + index, fill);
              }
            } else {
              for (let index = 0; index < size; index += 1) {
                reservedAddresses.add(emitAddress + index);
              }
            }
            advancePlacement(placement, size);
          }
        }
        break;
      }
      case 'align': {
        const emitAddress = activePlacementAddress(placement);
        const alignment = evaluateExpression(
          item.alignment,
          labels,
          equates,
          item.span,
          diagnostics,
          {
            currentLocation: emitAddress,
            layouts,
          },
        );
        if (alignment !== undefined) {
          if (alignment <= 0) {
            diagnostics.push(diagnostic(item.span, `.align value must be positive: ${alignment}.`));
          } else {
            const padding = alignmentPadding(emitAddress, alignment);
            for (let index = 0; index < padding; index += 1) {
              writeImageByte(image, initializedAddresses, emitAddress + index, 0);
            }
            advancePlacement(placement, padding);
            addSourceSegment(
              sourceSegments,
              item.span,
              emitAddress,
              emitAddress + padding,
              'directive',
            );
          }
        }
        break;
      }
      case 'end':
        ended = true;
        break;
      case 'binfrom': {
        const value = evaluateExpression(item.expression, labels, equates, item.span, diagnostics, {
          currentLocation: placementAddress(placement),
          layouts,
        });
        if (value !== undefined) {
          binFrom = value;
        }
        break;
      }
      case 'binto': {
        const value = evaluateExpression(item.expression, labels, equates, item.span, diagnostics, {
          currentLocation: placementAddress(placement),
          layouts,
        });
        if (value !== undefined) {
          binTo = value;
        }
        break;
      }
      case 'string-data':
        {
          const segmentStart = activePlacementAddress(placement);
          for (const value of stringDirectiveBytes(item.directive, item.value)) {
            const stringEmitAddress = activePlacementAddress(placement);
            writeImageByte(image, initializedAddresses, stringEmitAddress, value);
            advancePlacement(placement, 1);
          }
          void segmentStart;
        }
        break;
      case 'instruction': {
        const bases = computeResolvedBases(placement);
        const codeAddress = absoluteCodeAddress(placement, bases);
        const bytes: number[] = [];
        const fixups: Fixup[] = [];
        const size = emitInstruction(
          item.instruction,
          item.span,
          codeAddress,
          labels,
          equates,
          diagnostics,
          bytes,
          fixups,
          layouts,
        );
        patchFixups(fixups, symbols, bytes, diagnostics);
        writeImageBytes(image, initializedAddresses, codeAddress, bytes);
        advanceCodePlacement(placement, size);
        addSourceSegment(
          sourceSegments,
          item.emittedSource?.span ?? item.span,
          codeAddress,
          codeAddress + size,
          item.emittedSource?.kind ?? 'code',
        );
        if (placement.activePlacement === 'data') {
          const dataAddress = absoluteDataAddress(placement, bases);
          writeImageBytes(image, initializedAddresses, dataAddress, bytes);
          advancePlacement(placement, size);
        }
        break;
      }
    }
  }

  const range = outputRange(initializedAddresses, reservedAddresses, origin, binFrom, binTo);
  const bytes = flattenImage(image, range.start, range.end);
  const initializedAddressList = [...initializedAddresses].sort((a, b) => a - b);
  const reservedAddressList = [...reservedAddresses].sort((a, b) => a - b);

  return {
    diagnostics,
    symbols,
    origin: range.start,
    initializedAddresses: initializedAddressList,
    reservedAddresses: reservedAddressList,
    sourceSegments: sourceSegments
      .map((segment) => clipSourceSegment(segment, range.start, range.end))
      .filter((segment): segment is EmittedSourceSegment => segment !== undefined)
      .sort((a, b) => a.start - b.start || a.end - b.end),
    bytes: diagnostics.length > 0 ? new Uint8Array() : bytes,
  };
}

function buildAddressState(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
): {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly layouts: Map<string, LayoutRecord>;
  readonly origin: number;
} {
  let state = buildAddressStateOnce(items, [], undefined, false);
  let previousSignature = '';

  for (let index = 0; index < Math.max(4, items.length + 1); index += 1) {
    state = buildAddressStateOnce(items, [], state, false);
    const signature = addressStateSignature(state);
    if (signature === previousSignature) {
      break;
    }
    previousSignature = signature;
  }

  return buildAddressStateOnce(items, diagnostics, state, true);
}

function buildAddressStateOnce(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
  previous:
    | {
        readonly labels: Record<string, number>;
        readonly equates: Map<string, EquateRecord>;
        readonly layouts: Map<string, LayoutRecord>;
      }
    | undefined,
  reportUnknown: boolean,
): {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly layouts: Map<string, LayoutRecord>;
  readonly origin: number;
} {
  const labels: Record<string, number> = {};
  const equates = new Map<string, EquateRecord>();
  const layouts = new Map<string, LayoutRecord>();
  const enumNames = new Set<string>();
  const enumNamesLower = new Set<string>();
  let origin = 0;
  let originSet = false;
  const placement = createPlacementState();
  let ended = false;

  const lookupLabels = previous?.labels ?? labels;
  const lookupEquates = previous?.equates ?? equates;
  const lookupLayouts = previous?.layouts ?? layouts;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (ended && item.kind !== 'binfrom' && item.kind !== 'binto') {
      continue;
    }

    switch (item.kind) {
      case 'org': {
        placement.activePlacement = placementForOrg(items, itemIndex);
        const value = evaluateExpression(
          item.expression,
          lookupLabels,
          lookupEquates,
          item.span,
          diagnostics,
          {
            currentLocation: placementAddress(placement),
            layouts: lookupLayouts,
            reportUnknown,
          },
        );
        if (value !== undefined) {
          if (!originSet) {
            origin = value;
            originSet = true;
          }
          applyOrg(placement, value);
        }
        break;
      }
      case 'type':
        defineLayout(
          layouts,
          labels,
          equates,
          enumNamesLower,
          item.name,
          item.layoutKind,
          item.fields,
          item.span,
          diagnostics,
        );
        break;
      case 'equ':
        defineEquate(
          equates,
          labels,
          layouts,
          enumNames,
          enumNamesLower,
          item.name,
          item.expression,
          item.span,
          placementAddress(placement),
          diagnostics,
        );
        break;
      case 'enum':
        defineEnumMembers(
          equates,
          labels,
          layouts,
          enumNames,
          enumNamesLower,
          item.name,
          item.members,
          item.span,
          diagnostics,
        );
        break;
      case 'label':
        defineLabel(
          labels,
          equates,
          layouts,
          enumNamesLower,
          item.name,
          placementAddress(placement),
          item.span,
          diagnostics,
        );
        break;
      case 'db':
        advancePlacement(
          placement,
          item.values.reduce((size, value) => size + dataValueSize(value), 0),
        );
        break;
      case 'dw':
        advancePlacement(placement, item.values.length * 2);
        break;
      case 'ds': {
        const size = evaluateExpression(
          item.size,
          lookupLabels,
          lookupEquates,
          item.span,
          diagnostics,
          {
            currentLocation: placementAddress(placement),
            layouts: lookupLayouts,
            reportUnknown,
          },
        );
        if (size !== undefined) {
          advancePlacement(placement, size);
        }
        break;
      }
      case 'align': {
        const alignment = evaluateExpression(
          item.alignment,
          lookupLabels,
          lookupEquates,
          item.span,
          diagnostics,
          {
            currentLocation: placementAddress(placement),
            layouts: lookupLayouts,
            reportUnknown,
          },
        );
        if (alignment !== undefined) {
          if (alignment <= 0) {
            if (reportUnknown) {
              diagnostics.push(
                diagnostic(item.span, `.align value must be positive: ${alignment}.`),
              );
            }
          } else {
            advancePlacement(placement, alignmentPadding(placementAddress(placement), alignment));
          }
        }
        break;
      }
      case 'end':
        ended = true;
        break;
      case 'binfrom':
      case 'binto':
        break;
      case 'string-data':
        advancePlacement(placement, stringDirectiveBytes(item.directive, item.value).length);
        break;
      case 'instruction': {
        const instructionBytes = instructionSize(item.instruction);
        advanceCodePlacement(placement, instructionBytes);
        if (placement.activePlacement === 'data') {
          advancePlacement(placement, instructionBytes);
        }
        break;
      }
    }
  }

  if (reportUnknown) {
    validateLayouts(layouts, diagnostics);
  }

  return { labels, equates, layouts, origin };
}

function stringDirectiveBytes(
  directive: 'cstr' | 'pstr' | 'istr',
  value: string,
): readonly number[] {
  const bytes = [...value].map((char) => char.codePointAt(0) ?? 0);
  switch (directive) {
    case 'cstr':
      return [...bytes.map(toByte), 0];
    case 'pstr':
      return [bytes.length & 0xff, ...bytes.map(toByte)];
    case 'istr':
      return bytes.map((byte, index) => toByte(byte | (index === bytes.length - 1 ? 0x80 : 0)));
  }
}

function toByte(value: number): number {
  return value & 0xff;
}

function dataValueSize(value: DataValue): number {
  return value.kind === 'string-fragment' ? [...value.value].length : 1;
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

function alignmentPadding(address: number, alignment: number): number {
  const remainder = address % alignment;
  return remainder === 0 ? 0 : alignment - remainder;
}

function activePlacementAddress(placement: PlacementState): number {
  const bases = computeResolvedBases(placement);
  return placement.activePlacement === 'data'
    ? absoluteDataAddress(placement, bases)
    : absoluteCodeAddress(placement, bases);
}

function addressStateSignature(state: {
  readonly labels: Record<string, number>;
  readonly equates: ReadonlyMap<string, EquateRecord>;
  readonly layouts: ReadonlyMap<string, LayoutRecord>;
  readonly origin: number;
}): string {
  return JSON.stringify({
    labels: state.labels,
    equates: [...state.equates].map(([name, record]) => [name, record.currentLocation]),
    layouts: [...state.layouts].map(([name, record]) => [name, record.kind, record.fields]),
    origin: state.origin,
  });
}

function defineLayout(
  layouts: Map<string, LayoutRecord>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  enumNamesLower: ReadonlySet<string>,
  name: string,
  layoutKind: LayoutRecord['kind'],
  fields: LayoutRecord['fields'],
  span: SourceSpan,
  diagnostics: Diagnostic[],
): void {
  const lowerName = name.toLowerCase();
  if (
    hasCaseInsensitiveMapKey(layouts, lowerName) ||
    hasCaseInsensitiveKey(labels, lowerName) ||
    hasCaseInsensitiveMapKey(equates, lowerName) ||
    enumNamesLower.has(lowerName)
  ) {
    diagnostics.push(diagnostic(span, `duplicate type name: ${name}`));
    return;
  }

  const fieldNames = new Set<string>();
  for (const field of fields) {
    const fieldLower = field.name.toLowerCase();
    if (fieldNames.has(fieldLower)) {
      diagnostics.push(diagnostic(span, `duplicate type field name: ${field.name}`));
      continue;
    }
    fieldNames.add(fieldLower);
  }

  layouts.set(name, { kind: layoutKind, fields, span });
}

function defineLabel(
  labels: Record<string, number>,
  equates: ReadonlyMap<string, EquateRecord>,
  layouts: ReadonlyMap<string, LayoutRecord>,
  enumNamesLower: ReadonlySet<string>,
  name: string,
  address: number,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): void {
  if (
    labels[name] !== undefined ||
    equates.has(name) ||
    hasCaseInsensitiveMapKey(layouts, name.toLowerCase()) ||
    enumNamesLower.has(name.toLowerCase())
  ) {
    diagnostics.push(diagnostic(span, `duplicate symbol: ${name}`));
    return;
  }
  labels[name] = address;
}

function defineEquate(
  equates: Map<string, EquateRecord>,
  labels: Readonly<Record<string, number>>,
  layouts: ReadonlyMap<string, LayoutRecord>,
  enumNames: ReadonlySet<string>,
  enumNamesLower: ReadonlySet<string>,
  name: string,
  expression: Expression,
  span: SourceSpan,
  currentLocation: number,
  diagnostics: Diagnostic[],
): void {
  if (
    labels[name] !== undefined ||
    equates.has(name) ||
    hasCaseInsensitiveMapKey(layouts, name.toLowerCase()) ||
    enumNames.has(name) ||
    enumNamesLower.has(name.toLowerCase())
  ) {
    diagnostics.push(diagnostic(span, `duplicate symbol: ${name}`));
    return;
  }
  equates.set(name, { expression, span, currentLocation });
}

function defineEnumMembers(
  equates: Map<string, EquateRecord>,
  labels: Readonly<Record<string, number>>,
  layouts: ReadonlyMap<string, LayoutRecord>,
  enumNames: Set<string>,
  enumNamesLower: Set<string>,
  enumName: string,
  members: readonly string[],
  span: SourceSpan,
  diagnostics: Diagnostic[],
): void {
  const enumNameLower = enumName.toLowerCase();
  if (
    hasCaseInsensitiveKey(labels, enumNameLower) ||
    hasCaseInsensitiveMapKey(equates, enumNameLower) ||
    hasCaseInsensitiveMapKey(layouts, enumNameLower) ||
    enumNamesLower.has(enumNameLower)
  ) {
    diagnostics.push(diagnostic(span, `duplicate enum name: ${enumName}`));
    return;
  }
  enumNames.add(enumName);
  enumNamesLower.add(enumNameLower);

  const memberNames = new Set<string>();
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index] ?? '';
    const memberLower = member.toLowerCase();
    if (memberNames.has(memberLower)) {
      diagnostics.push(diagnostic(span, `duplicate enum member name: ${member}`));
      continue;
    }
    memberNames.add(memberLower);

    const qualifiedName = `${enumName}.${member}`;
    if (
      hasCaseInsensitiveKey(labels, qualifiedName.toLowerCase()) ||
      hasCaseInsensitiveMapKey(equates, qualifiedName.toLowerCase())
    ) {
      diagnostics.push(diagnostic(span, `duplicate symbol: ${qualifiedName}`));
      continue;
    }
    equates.set(qualifiedName, {
      expression: { kind: 'number', value: index },
      span,
      currentLocation: 0,
      enumMember: true,
    });
  }
}

function hasCaseInsensitiveKey(
  record: Readonly<Record<string, number>>,
  lowerName: string,
): boolean {
  return Object.keys(record).some((key) => key.toLowerCase() === lowerName);
}

function hasCaseInsensitiveMapKey(map: ReadonlyMap<string, unknown>, lowerName: string): boolean {
  for (const key of map.keys()) {
    if (key.toLowerCase() === lowerName) {
      return true;
    }
  }
  return false;
}

function resolveSymbols(
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  layouts: ReadonlyMap<string, LayoutRecord>,
  diagnostics: Diagnostic[],
): SymbolTable {
  const symbols: Record<string, number> = { ...labels };
  for (const [name, record] of equates) {
    const value = evaluateExpression(record.expression, labels, equates, record.span, diagnostics, {
      currentLocation: record.currentLocation,
      visiting: new Set([name]),
      layouts,
      reportUnknown: false,
    });
    if (value !== undefined) {
      symbols[name] = value;
    }
  }
  return symbols;
}
