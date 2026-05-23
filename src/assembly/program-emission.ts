import type { Diagnostic } from '../model/diagnostic.js';
import type { Fixup } from '../model/fixup.js';
import type { SourceItem } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { SourceSpan } from '../source/source-span.js';
import type { EmittedSourceSegment } from '../outputs/types.js';
import {
  diagnostic,
  evaluateExpression,
} from '../semantics/expression-evaluation.js';
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

export function emitProgramImage(
  items: readonly SourceItem[],
  addressState: AddressState,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): EmittedProgram {
  const { labels, equates, layouts, origin } = addressState;
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
