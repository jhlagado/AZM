import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression, TypeExpr } from '../model/expression.js';
import type { LayoutField } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { SourceSpan } from '../source/source-span.js';
import {
  diagnostic,
  evaluateExpression,
  type EquateRecord,
  type LayoutRecord,
} from '../semantics/expression-evaluation.js';

export function defineLayout(
  layouts: Map<string, LayoutRecord>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  enumNamesLower: ReadonlySet<string>,
  name: string,
  layoutKind: 'record' | 'union',
  fields: readonly LayoutField[],
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

export function defineTypeAlias(
  layouts: Map<string, LayoutRecord>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  enumNamesLower: ReadonlySet<string>,
  name: string,
  typeExpr: TypeExpr,
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

  layouts.set(name, { kind: 'alias', typeExpr, span });
}

export function defineLabel(
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

export function defineEquate(
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

export function defineEnumMembers(
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
