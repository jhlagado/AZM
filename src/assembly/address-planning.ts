import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { DataValue, SourceItem } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { SourceSpan } from '../source/source-span.js';
import {
  diagnostic,
  evaluateExpression,
  lookupEquateRecord,
  type EquateRecord,
  type LayoutRecord,
  validateLayouts,
} from '../semantics/expression-evaluation.js';
import { instructionSize } from './fixup-emission.js';
import {
  advanceCodePlacement,
  advancePlacement,
  applyOrg,
  createPlacementState,
  placementAddress,
  placementForOrg,
} from './placement.js';

export interface AddressState {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly layouts: Map<string, LayoutRecord>;
  readonly origin: number;
}

export function buildAddressState(
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
          item.stringValue,
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
          item.values.reduce(
            (size, value) => size + dataValueSize(value, lookupEquates),
            0,
          ),
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

export function stringDirectiveBytes(
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

function dataValueSize(
  value: DataValue,
  equates: ReadonlyMap<string, EquateRecord>,
): number {
  if (value.kind === 'string-fragment') {
    return [...value.value].length;
  }
  if (value.kind === 'symbol') {
    const equate = lookupEquateRecord(equates, value.name);
    if (equate?.record.stringValue !== undefined) {
      return [...equate.record.stringValue].length;
    }
  }
  return 1;
}

export function alignmentPadding(address: number, alignment: number): number {
  const remainder = address % alignment;
  return remainder === 0 ? 0 : alignment - remainder;
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
  stringValue?: string,
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
  equates.set(name, {
    expression,
    span,
    currentLocation,
    ...(stringValue !== undefined ? { stringValue } : {}),
  });
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

export function resolveSymbols(
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
