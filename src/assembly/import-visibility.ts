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
}

export function validateImportVisibility(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
): void {
  const labels = collectLabelVisibility(items);
  for (const item of items) {
    validateItemReferences(item, labels, diagnostics);
  }
}

function collectLabelVisibility(
  items: readonly SourceItem[],
): ReadonlyMap<string, LabelVisibility> {
  const labels = new Map<string, LabelVisibility>();
  const importedSourceUnits = importedUnitNames(items);
  for (const item of items) {
    if (item.kind !== 'label') continue;
    labels.set(item.name, {
      name: item.name,
      definingSourceUnit: item.span.sourceUnit,
      definingSourceName: item.span.sourceName,
      public: isPublicLabel(item, importedSourceUnits),
    });
  }
  return labels;
}

function importedUnitNames(items: readonly SourceItem[]): ReadonlySet<string> {
  const units = new Set<string>();
  for (const item of items) {
    if (item.span.sourceRelation === 'import' && item.span.sourceUnit !== undefined) {
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
  labels: ReadonlyMap<string, LabelVisibility>,
  diagnostics: Diagnostic[],
): void {
  switch (item.kind) {
    case 'org':
      validateExpression(item.expression, item.span, labels, diagnostics);
      return;
    case 'equ':
      validateExpression(item.expression, item.span, labels, diagnostics);
      return;
    case 'db':
      for (const value of item.values) {
        validateDataValue(value, item.span, labels, diagnostics);
      }
      return;
    case 'dw':
      for (const value of item.values) {
        validateExpression(value, item.span, labels, diagnostics);
      }
      return;
    case 'ds':
      validateExpression(item.size, item.span, labels, diagnostics);
      if (item.fill !== undefined) {
        validateExpression(item.fill, item.span, labels, diagnostics);
      }
      return;
    case 'align':
      validateExpression(item.alignment, item.span, labels, diagnostics);
      return;
    case 'binfrom':
    case 'binto':
      validateExpression(item.expression, item.span, labels, diagnostics);
      return;
    case 'instruction':
      validateInstruction(item.instruction, item.span, labels, diagnostics);
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
  labels: ReadonlyMap<string, LabelVisibility>,
  diagnostics: Diagnostic[],
): void {
  if ('kind' in value && value.kind === 'string-fragment') return;
  validateExpression(value, span, labels, diagnostics);
}

function validateInstruction(
  instruction: Instruction,
  span: SourceSpan,
  labels: ReadonlyMap<string, LabelVisibility>,
  diagnostics: Diagnostic[],
): void {
  for (const expression of instructionExpressions(instruction)) {
    validateExpression(expression, span, labels, diagnostics);
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
  labels: ReadonlyMap<string, LabelVisibility>,
  diagnostics: Diagnostic[],
): void {
  switch (expression.kind) {
    case 'symbol':
      validateSymbolReference(expression.name, span, labels, diagnostics);
      return;
    case 'byte-function':
    case 'unary':
      validateExpression(expression.expression, span, labels, diagnostics);
      return;
    case 'binary':
      validateExpression(expression.left, span, labels, diagnostics);
      validateExpression(expression.right, span, labels, diagnostics);
      return;
    case 'layout-cast':
      validateExpression(expression.base, span, labels, diagnostics);
      for (const part of expression.path) {
        if (part.kind === 'index') {
          validateExpression(part.expression, span, labels, diagnostics);
        }
      }
      return;
    case 'number':
    case 'current-location':
    case 'type-size':
    case 'sizeof':
    case 'offset':
      return;
  }
}

function validateSymbolReference(
  name: string,
  referenceSpan: SourceSpan,
  labels: ReadonlyMap<string, LabelVisibility>,
  diagnostics: Diagnostic[],
): void {
  const label = lookupLabel(labels, name);
  if (!label || label.public) return;
  if (referenceSpan.sourceUnit === label.definingSourceUnit) return;
  diagnostics.push(
    diagnostic(
      referenceSpan,
      `symbol "${name}" is private to ${label.definingSourceName}; export it with @${label.name} or keep the reference inside that file`,
    ),
  );
}

function lookupLabel(
  labels: ReadonlyMap<string, LabelVisibility>,
  name: string,
): LabelVisibility | undefined {
  const direct = labels.get(name);
  if (direct) return direct;
  const lowerName = name.toLowerCase();
  for (const [key, label] of labels) {
    if (key.toLowerCase() === lowerName) return label;
  }
  return undefined;
}
