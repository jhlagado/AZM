import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { DataValue, Instruction, SourceItem } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';
import type { Z80Operand } from '../z80/instruction.js';
import { diagnostic } from '../semantics/diagnostics.js';

interface LabelVisibility {
  readonly name: string;
  readonly definingSourceUnit: string | undefined;
  readonly definingSourceName: string;
  readonly public: boolean;
  readonly duplicateName: boolean;
}

interface SymbolConflictIndex {
  readonly exact: ReadonlyMap<string, number>;
  readonly declarationLower: ReadonlyMap<string, number>;
}

export function validateImportVisibility(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
): void {
  const symbols = collectSymbolVisibility(items);
  for (const item of items) {
    validateItemReferences(item, symbols, diagnostics);
  }
}

interface SymbolVisibility {
  readonly labels: ReadonlyMap<string, LabelVisibility>;
  readonly exactSymbols: ReadonlySet<string>;
}

function collectSymbolVisibility(items: readonly SourceItem[]): SymbolVisibility {
  const labels = new Map<string, LabelVisibility>();
  const exactSymbols = new Set<string>();
  const importedSourceUnits = importedUnitNames(items);
  const symbolConflicts = buildSymbolConflictIndex(items);
  for (const item of items) {
    for (const name of exactSymbolNames(item)) {
      exactSymbols.add(name);
    }
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind !== 'label') continue;
    labels.set(item.name, {
      name: item.name,
      definingSourceUnit: item.span.sourceUnit,
      definingSourceName: item.span.sourceName,
      public: isPublicLabel(item, importedSourceUnits),
      duplicateName: hasAddressPlanningNameConflict(item.name, symbolConflicts, items, index),
    });
  }
  return { labels, exactSymbols };
}

function buildSymbolConflictIndex(items: readonly SourceItem[]): SymbolConflictIndex {
  const exact = new Map<string, number>();
  const declarationLower = new Map<string, number>();
  for (const item of items) {
    for (const name of exactSymbolNames(item)) {
      exact.set(name, (exact.get(name) ?? 0) + 1);
    }
    const declarationName = caseInsensitiveDeclarationName(item);
    if (declarationName !== undefined) {
      const key = declarationName.toLowerCase();
      declarationLower.set(key, (declarationLower.get(key) ?? 0) + 1);
    }
  }
  return { exact, declarationLower };
}

function hasAddressPlanningNameConflict(
  labelName: string,
  conflicts: SymbolConflictIndex,
  items: readonly SourceItem[],
  labelIndex: number,
): boolean {
  return (
    (conflicts.exact.get(labelName) ?? 0) > 1 ||
    (conflicts.declarationLower.get(labelName.toLowerCase()) ?? 0) > 0 ||
    hasReportedEnumMemberConflict(labelName, items, labelIndex)
  );
}

function hasReportedEnumMemberConflict(
  labelName: string,
  items: readonly SourceItem[],
  labelIndex: number,
): boolean {
  const lowerName = labelName.toLowerCase();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind !== 'enum') continue;
    for (const memberName of qualifiedEnumMemberNames(item)) {
      if (memberName === labelName) return true;
      if (index > labelIndex && memberName.toLowerCase() === lowerName) return true;
    }
  }
  return false;
}

function exactSymbolNames(item: SourceItem): readonly string[] {
  switch (item.kind) {
    case 'label':
    case 'equ':
      return [item.name];
    case 'enum':
      return qualifiedEnumMemberNames(item);
    default:
      return [];
  }
}

function qualifiedEnumMemberNames(item: SourceItem): readonly string[] {
  return item.kind === 'enum' ? item.members.map((member) => `${item.name}.${member}`) : [];
}

function caseInsensitiveDeclarationName(item: SourceItem): string | undefined {
  switch (item.kind) {
    case 'enum':
    case 'type':
    case 'type-alias':
      return item.name;
    default:
      return undefined;
  }
}

function importedUnitNames(items: readonly SourceItem[]): ReadonlySet<string> {
  const units = new Set<string>();
  for (const item of items) {
    if (
      item.span.sourceUnitRelation === 'import' &&
      item.span.sourceUnit !== undefined
    ) {
      units.add(item.span.sourceUnit);
    }
  }
  return units;
}

function isPublicLabel(
  item: Extract<SourceItem, { readonly kind: 'label' }>,
  importedSourceUnits: ReadonlySet<string>,
): boolean {
  return (
    item.isEntry === true ||
    item.span.sourceUnit === undefined ||
    !importedSourceUnits.has(item.span.sourceUnit)
  );
}

function validateItemReferences(
  item: SourceItem,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  switch (item.kind) {
    case 'org':
      validateExpression(item.expression, item.span, symbols, diagnostics);
      return;
    case 'equ':
      validateExpression(item.expression, item.span, symbols, diagnostics);
      return;
    case 'db':
      for (const value of item.values) {
        validateDataValue(value, item.span, symbols, diagnostics);
      }
      return;
    case 'dw':
      for (const value of item.values) {
        validateExpression(value, item.span, symbols, diagnostics);
      }
      return;
    case 'ds':
      validateExpression(item.size, item.span, symbols, diagnostics);
      if (item.fill !== undefined) {
        validateExpression(item.fill, item.span, symbols, diagnostics);
      }
      return;
    case 'align':
      validateExpression(item.alignment, item.span, symbols, diagnostics);
      return;
    case 'binfrom':
    case 'binto':
      validateExpression(item.expression, item.span, symbols, diagnostics);
      return;
    case 'instruction':
      validateInstruction(item.instruction, item.span, symbols, diagnostics);
      return;
    case 'label':
    case 'comment':
    case 'end':
    case 'enum':
    case 'type':
    case 'type-alias':
    case 'string-data':
      return;
  }
}

function validateDataValue(
  value: DataValue,
  span: SourceSpan,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  if ('kind' in value && value.kind === 'string-fragment') return;
  validateExpression(value, span, symbols, diagnostics);
}

function validateInstruction(
  instruction: Instruction,
  span: SourceSpan,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  for (const expression of instructionExpressions(instruction)) {
    validateExpression(expression, span, symbols, diagnostics);
  }
}

function instructionExpressions(instruction: Instruction): readonly Expression[] {
  switch (instruction.mnemonic) {
    case 'ld-a-imm':
    case 'jp':
    case 'call':
    case 'jr':
    case 'djnz':
      return [instruction.expression];
    case 'jp-cc':
    case 'call-cc':
    case 'jr-cc':
      return [instruction.expression];
    case 'ld':
      return [...operandExpressions(instruction.target), ...operandExpressions(instruction.source)];
    case 'in':
      return instruction.port.kind === 'imm' ? [instruction.port.expression] : [];
    case 'out':
      return instruction.port.kind === 'imm' ? [instruction.port.expression] : [];
    case 'inc':
    case 'dec':
      return 'displacement' in instruction.operand ? [instruction.operand.displacement] : [];
    case 'bit':
    case 'res':
    case 'set':
    case 'rlc':
    case 'rrc':
    case 'rl':
    case 'rr':
    case 'sla':
    case 'sra':
    case 'sll':
    case 'sls':
    case 'srl':
      return 'displacement' in instruction.operand ? [instruction.operand.displacement] : [];
    case 'add':
      if ('source' in instruction && 'target' in instruction) {
        return [
          ...operandExpressions(instruction.target),
          ...operandExpressions(instruction.source),
        ];
      }
      return 'source' in instruction ? operandExpressions(instruction.source) : [];
    case 'adc':
    case 'sbc':
      return 'source' in instruction ? operandExpressions(instruction.source) : [];
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return operandExpressions(instruction.source);
    default:
      return [];
  }
}

function operandExpressions(operand: Z80Operand): readonly Expression[] {
  switch (operand.kind) {
    case 'mem-abs':
    case 'imm':
      return [operand.expression];
    case 'indexed':
      return [operand.displacement];
    default:
      return [];
  }
}

function validateExpression(
  expression: Expression,
  span: SourceSpan,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  switch (expression.kind) {
    case 'symbol':
      validateSymbolReference(expression.name, span, symbols, diagnostics);
      return;
    case 'byte-function':
    case 'unary':
      validateExpression(expression.expression, span, symbols, diagnostics);
      return;
    case 'binary':
      validateExpression(expression.left, span, symbols, diagnostics);
      validateExpression(expression.right, span, symbols, diagnostics);
      return;
    case 'layout-cast':
      validateExpression(expression.base, span, symbols, diagnostics);
      for (const part of expression.path) {
        if (part.kind === 'index') {
          validateExpression(part.expression, span, symbols, diagnostics);
        }
      }
      return;
    case 'number':
    case 'current-location':
    case 'sizeof':
    case 'offset':
      return;
    case 'type-size':
      if (expression.typeExpr.length === undefined) {
        validateSymbolReference(expression.typeExpr.name, span, symbols, diagnostics);
      }
      return;
  }
}

function validateSymbolReference(
  name: string,
  referenceSpan: SourceSpan,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  const label = lookupLabel(symbols, name);
  if (!label || label.duplicateName || label.public) return;
  if (referenceSpan.sourceUnit === label.definingSourceUnit) return;
  diagnostics.push(
    diagnostic(
      referenceSpan,
      `symbol "${name}" is private to ${label.definingSourceName}; export it with @${label.name} or keep the reference inside that file`,
    ),
  );
}

function lookupLabel(
  symbols: SymbolVisibility,
  name: string,
): LabelVisibility | undefined {
  const direct = symbols.labels.get(name);
  if (direct) return direct;
  if (symbols.exactSymbols.has(name)) return undefined;
  const lowerName = name.toLowerCase();
  for (const [key, label] of symbols.labels) {
    if (key.toLowerCase() === lowerName) return label;
  }
  return undefined;
}
