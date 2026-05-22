import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { Fixup } from '../model/fixup.js';
import type { DataValue, SourceItem } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { SourceSpan } from '../source/source-span.js';
import { diagnostic, evaluateExpression, type EquateRecord } from './expression-evaluation.js';
import {
  emitAbs16Expression,
  emitInstruction,
  instructionSize,
  patchFixups,
} from './fixup-emission.js';

export interface AssemblyResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: SymbolTable;
  readonly origin: number;
  readonly bytes: Uint8Array;
}

export function assembleProgram(items: readonly SourceItem[]): AssemblyResult {
  const diagnostics: Diagnostic[] = [];
  const addressState = buildAddressState(items, diagnostics);
  const { labels, equates, origin } = addressState;

  const symbols = resolveSymbols(labels, equates, diagnostics);
  if (diagnostics.length > 0) {
    return { diagnostics, symbols, origin, bytes: new Uint8Array() };
  }

  const image = new Map<number, number>();
  const initializedAddresses = new Set<number>();
  const reservedAddresses = new Set<number>();
  let currentAddress = 0;
  let ended = false;
  let binFrom: number | undefined;
  let binTo: number | undefined;

  for (const item of items) {
    if (ended && item.kind !== 'binfrom' && item.kind !== 'binto') {
      continue;
    }

    switch (item.kind) {
      case 'org': {
        const value = evaluateExpression(item.expression, labels, equates, item.span, diagnostics, {
          currentLocation: currentAddress,
        });
        if (value !== undefined) {
          currentAddress = value;
        }
        break;
      }
      case 'equ':
      case 'label':
      case 'enum':
        break;
      case 'db':
        for (const value of item.values) {
          if (value.kind === 'string-fragment') {
            for (const char of value.value) {
              writeImageByte(image, initializedAddresses, currentAddress, char.codePointAt(0) ?? 0);
              currentAddress += 1;
            }
          } else {
            const evaluated = evaluateExpression(value, labels, equates, item.span, diagnostics, {
              currentLocation: currentAddress,
            });
            if (evaluated !== undefined) {
              writeImageByte(image, initializedAddresses, currentAddress, evaluated);
              currentAddress += 1;
            }
          }
        }
        break;
      case 'dw':
        for (const expression of item.values) {
          const bytes: number[] = [];
          const fixups: Fixup[] = [];
          if (
            emitAbs16Expression(
              expression,
              item.span,
              currentAddress,
              labels,
              equates,
              diagnostics,
              bytes,
              fixups,
            )
          ) {
            patchFixups(fixups, symbols, bytes, diagnostics);
            writeImageBytes(image, initializedAddresses, currentAddress, bytes);
            currentAddress += 2;
          }
        }
        break;
      case 'ds': {
        const size = evaluateExpression(item.size, labels, equates, item.span, diagnostics, {
          currentLocation: currentAddress,
        });
        if (size !== undefined) {
          const fill =
            item.fill === undefined
              ? undefined
              : evaluateExpression(item.fill, labels, equates, item.span, diagnostics, {
                  currentLocation: currentAddress,
                });
          if (item.fill === undefined || fill !== undefined) {
            if (fill !== undefined) {
              for (let index = 0; index < size; index += 1) {
                writeImageByte(image, initializedAddresses, currentAddress + index, fill);
              }
            } else {
              for (let index = 0; index < size; index += 1) {
                reservedAddresses.add(currentAddress + index);
              }
            }
            currentAddress += size;
          }
        }
        break;
      }
      case 'align': {
        const alignment = evaluateExpression(
          item.alignment,
          labels,
          equates,
          item.span,
          diagnostics,
          {
            currentLocation: currentAddress,
          },
        );
        if (alignment !== undefined) {
          if (alignment <= 0) {
            diagnostics.push(diagnostic(item.span, `.align value must be positive: ${alignment}.`));
          } else {
            const padding = alignmentPadding(currentAddress, alignment);
            for (let index = 0; index < padding; index += 1) {
              writeImageByte(image, initializedAddresses, currentAddress + index, 0);
            }
            currentAddress += padding;
          }
        }
        break;
      }
      case 'end':
        ended = true;
        break;
      case 'binfrom': {
        const value = evaluateExpression(item.expression, labels, equates, item.span, diagnostics, {
          currentLocation: currentAddress,
        });
        if (value !== undefined) {
          binFrom = value;
        }
        break;
      }
      case 'binto': {
        const value = evaluateExpression(item.expression, labels, equates, item.span, diagnostics, {
          currentLocation: currentAddress,
        });
        if (value !== undefined) {
          binTo = value;
        }
        break;
      }
      case 'string-data':
        for (const value of stringDirectiveBytes(item.directive, item.value)) {
          writeImageByte(image, initializedAddresses, currentAddress, value);
          currentAddress += 1;
        }
        break;
      case 'instruction': {
        const bytes: number[] = [];
        const fixups: Fixup[] = [];
        const size = emitInstruction(
          item.instruction,
          item.span,
          currentAddress,
          labels,
          equates,
          diagnostics,
          bytes,
          fixups,
        );
        patchFixups(fixups, symbols, bytes, diagnostics);
        writeImageBytes(image, initializedAddresses, currentAddress, bytes);
        currentAddress += size;
        break;
      }
    }
  }

  const range = outputRange(initializedAddresses, reservedAddresses, origin, binFrom, binTo);
  const bytes = flattenImage(image, range.start, range.end);

  return {
    diagnostics,
    symbols,
    origin: range.start,
    bytes: diagnostics.length > 0 ? new Uint8Array() : bytes,
  };
}

function buildAddressState(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
): {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
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
    | { readonly labels: Record<string, number>; readonly equates: Map<string, EquateRecord> }
    | undefined,
  reportUnknown: boolean,
): {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly origin: number;
} {
  const labels: Record<string, number> = {};
  const equates = new Map<string, EquateRecord>();
  const enumNames = new Set<string>();
  const enumNamesLower = new Set<string>();
  let origin = 0;
  let originSet = false;
  let currentAddress = 0;
  let ended = false;

  const lookupLabels = previous?.labels ?? labels;
  const lookupEquates = previous?.equates ?? equates;

  for (const item of items) {
    if (ended && item.kind !== 'binfrom' && item.kind !== 'binto') {
      continue;
    }

    switch (item.kind) {
      case 'org': {
        const value = evaluateExpression(
          item.expression,
          lookupLabels,
          lookupEquates,
          item.span,
          diagnostics,
          {
            currentLocation: currentAddress,
            reportUnknown,
          },
        );
        if (value !== undefined) {
          if (!originSet) {
            origin = value;
            originSet = true;
          }
          currentAddress = value;
        }
        break;
      }
      case 'equ':
        defineEquate(
          equates,
          labels,
          enumNames,
          enumNamesLower,
          item.name,
          item.expression,
          item.span,
          currentAddress,
          diagnostics,
        );
        break;
      case 'enum':
        defineEnumMembers(
          equates,
          labels,
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
          enumNamesLower,
          item.name,
          currentAddress,
          item.span,
          diagnostics,
        );
        break;
      case 'db':
        currentAddress += item.values.reduce((size, value) => size + dataValueSize(value), 0);
        break;
      case 'dw':
        currentAddress += item.values.length * 2;
        break;
      case 'ds': {
        const size = evaluateExpression(
          item.size,
          lookupLabels,
          lookupEquates,
          item.span,
          diagnostics,
          {
            currentLocation: currentAddress,
            reportUnknown,
          },
        );
        if (size !== undefined) {
          currentAddress += size;
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
            currentLocation: currentAddress,
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
            currentAddress += alignmentPadding(currentAddress, alignment);
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
        currentAddress += stringDirectiveBytes(item.directive, item.value).length;
        break;
      case 'instruction':
        currentAddress += instructionSize(item.instruction);
        break;
    }
  }

  return { labels, equates, origin };
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

function addressStateSignature(state: {
  readonly labels: Record<string, number>;
  readonly equates: ReadonlyMap<string, EquateRecord>;
  readonly origin: number;
}): string {
  return JSON.stringify({
    labels: state.labels,
    equates: [...state.equates].map(([name, record]) => [name, record.currentLocation]),
    origin: state.origin,
  });
}

function defineLabel(
  labels: Record<string, number>,
  equates: ReadonlyMap<string, EquateRecord>,
  enumNamesLower: ReadonlySet<string>,
  name: string,
  address: number,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): void {
  if (labels[name] !== undefined || equates.has(name) || enumNamesLower.has(name.toLowerCase())) {
    diagnostics.push(diagnostic(span, `duplicate symbol: ${name}`));
    return;
  }
  labels[name] = address;
}

function defineEquate(
  equates: Map<string, EquateRecord>,
  labels: Readonly<Record<string, number>>,
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
  diagnostics: Diagnostic[],
): SymbolTable {
  const symbols: Record<string, number> = { ...labels };
  for (const [name, record] of equates) {
    const value = evaluateExpression(record.expression, labels, equates, record.span, diagnostics, {
      currentLocation: record.currentLocation,
      visiting: new Set([name]),
    });
    if (value !== undefined) {
      symbols[name] = value;
    }
  }
  return symbols;
}
