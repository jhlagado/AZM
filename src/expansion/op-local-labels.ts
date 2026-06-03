import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import type { Z80AluMnemonic, Z80Instruction, Z80Operand } from '../z80/instruction.js';
import type { OpDecl } from './op-expansion.js';

const EXPRESSION_ITEM_KINDS = new Set<SourceItem['kind']>(['org', 'equ', 'binfrom', 'binto']);
const SOURCE_OPERAND_MNEMONICS = new Set<Z80Instruction['mnemonic']>([
  'and',
  'or',
  'xor',
  'cp',
]);
const JUMP_EXPRESSION_MNEMONICS = new Set<Z80Instruction['mnemonic']>([
  'jp',
  'call',
  'jr',
  'djnz',
  'jp-cc',
  'call-cc',
  'jr-cc',
]);

export function buildLocalLabelMap(
  op: OpDecl,
  line: { readonly line: number },
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  let ordinal = 0;
  for (const item of op.body) {
    if (item.kind !== 'source-items') continue;
    for (const sourceItem of item.items) {
      if (sourceItem.kind === 'label' && !map.has(sourceItem.name)) {
        map.set(sourceItem.name, `__azm_op_${op.name}_${sourceItem.name}_${line.line}_${ordinal}`);
        ordinal += 1;
      }
    }
  }
  return map;
}

export function renameSourceItems(
  items: readonly SourceItem[],
  localLabelMap: ReadonlyMap<string, string>,
): readonly SourceItem[] {
  if (localLabelMap.size === 0) return items;
  return items.map((item) => renameSourceItem(item, localLabelMap));
}

function renameSourceItem(
  item: SourceItem,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  if (item.kind === 'label') return renameLabelItem(item, localLabelMap);
  if (isExpressionItem(item)) return renameExpressionItem(item, localLabelMap);
  if (item.kind === 'db') return renameDbItem(item, localLabelMap);
  if (item.kind === 'dw') return renameDwItem(item, localLabelMap);
  if (item.kind === 'ds') return renameDsItem(item, localLabelMap);
  if (item.kind === 'align') return renameAlignItem(item, localLabelMap);
  if (item.kind === 'instruction') return renameInstructionItem(item, localLabelMap);
  return item;
}

export function renameInstructionExpressions(
  instruction: Z80Instruction,
  localLabelMap: ReadonlyMap<string, string>,
): Z80Instruction {
  if (localLabelMap.size === 0) return instruction;
  if (instruction.mnemonic === 'ld') return renameLdInstruction(instruction, localLabelMap);
  if (instruction.mnemonic === 'ld-a-imm') return renameExpressionInstruction(instruction, localLabelMap);
  if (instruction.mnemonic === 'in' || instruction.mnemonic === 'out') {
    return { ...instruction, port: renamePortExpression(instruction.port, localLabelMap) };
  }
  if (isAluSourceInstruction(instruction)) return renameSourceOperandInstruction(instruction, localLabelMap);
  if (isJumpExpressionInstruction(instruction)) return renameExpressionInstruction(instruction, localLabelMap);
  return instruction;
}

function renameLabelItem(
  item: Extract<SourceItem, { readonly kind: 'label' }>,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  return { ...item, name: localLabelMap.get(item.name) ?? item.name };
}

function isExpressionItem(
  item: SourceItem,
): item is Extract<SourceItem, { readonly expression: Expression }> {
  return EXPRESSION_ITEM_KINDS.has(item.kind);
}

function renameExpressionItem(
  item: Extract<SourceItem, { readonly expression: Expression }>,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  return { ...item, expression: renameExpression(item.expression, localLabelMap) };
}

function renameDbItem(
  item: Extract<SourceItem, { readonly kind: 'db' }>,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  return {
    ...item,
    values: item.values.map((value) =>
      value.kind === 'string-fragment' ? value : renameExpression(value, localLabelMap),
    ),
  };
}

function renameDwItem(
  item: Extract<SourceItem, { readonly kind: 'dw' }>,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  return { ...item, values: item.values.map((value) => renameExpression(value, localLabelMap)) };
}

function renameDsItem(
  item: Extract<SourceItem, { readonly kind: 'ds' }>,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  return item.fill
    ? {
        ...item,
        size: renameExpression(item.size, localLabelMap),
        fill: renameExpression(item.fill, localLabelMap),
      }
    : { ...item, size: renameExpression(item.size, localLabelMap) };
}

function renameAlignItem(
  item: Extract<SourceItem, { readonly kind: 'align' }>,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  return { ...item, alignment: renameExpression(item.alignment, localLabelMap) };
}

function renameInstructionItem(
  item: Extract<SourceItem, { readonly kind: 'instruction' }>,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  return {
    ...item,
    instruction: renameInstructionExpressions(item.instruction, localLabelMap),
  };
}

function renameLdInstruction(
  instruction: Extract<Z80Instruction, { readonly mnemonic: 'ld' }>,
  localLabelMap: ReadonlyMap<string, string>,
): Z80Instruction {
  return {
    ...instruction,
    target: renameOperandExpression(instruction.target, localLabelMap),
    source: renameOperandExpression(instruction.source, localLabelMap),
  };
}

function renameExpressionInstruction(
  instruction: Extract<Z80Instruction, { readonly expression: Expression }>,
  localLabelMap: ReadonlyMap<string, string>,
): Z80Instruction {
  return { ...instruction, expression: renameExpression(instruction.expression, localLabelMap) };
}

function isAluSourceInstruction(
  instruction: Z80Instruction,
): instruction is Extract<Z80Instruction, { readonly mnemonic: Z80AluMnemonic; readonly source: Z80Operand }> {
  return SOURCE_OPERAND_MNEMONICS.has(instruction.mnemonic) || isAccumulatorAluInstruction(instruction);
}

function isAccumulatorAluInstruction(
  instruction: Z80Instruction,
): instruction is Extract<Z80Instruction, { readonly mnemonic: 'add' | 'adc' | 'sub' | 'sbc'; readonly source: Z80Operand }> {
  return (
    (instruction.mnemonic === 'add' ||
      instruction.mnemonic === 'adc' ||
      instruction.mnemonic === 'sub' ||
      instruction.mnemonic === 'sbc') &&
    !('target' in instruction)
  );
}

function renameSourceOperandInstruction(
  instruction: Extract<Z80Instruction, { readonly source: Z80Operand }>,
  localLabelMap: ReadonlyMap<string, string>,
): Z80Instruction {
  return { ...instruction, source: renameOperandExpression(instruction.source, localLabelMap) };
}

function isJumpExpressionInstruction(
  instruction: Z80Instruction,
): instruction is Extract<Z80Instruction, { readonly expression: Expression }> {
  return JUMP_EXPRESSION_MNEMONICS.has(instruction.mnemonic);
}

function renameOperandExpression(
  operand: Z80Operand,
  localLabelMap: ReadonlyMap<string, string>,
): Z80Operand {
  switch (operand.kind) {
    case 'imm':
      return { ...operand, expression: renameExpression(operand.expression, localLabelMap) };
    case 'mem-abs':
      return { ...operand, expression: renameExpression(operand.expression, localLabelMap) };
    case 'indexed':
      return { ...operand, displacement: renameExpression(operand.displacement, localLabelMap) };
    default:
      return operand;
  }
}

function renamePortExpression(
  port: Extract<Z80Instruction, { readonly mnemonic: 'in' | 'out' }>['port'],
  localLabelMap: ReadonlyMap<string, string>,
): Extract<Z80Instruction, { readonly mnemonic: 'in' | 'out' }>['port'] {
  return port.kind === 'imm'
    ? { ...port, expression: renameExpression(port.expression, localLabelMap) }
    : port;
}

function renameExpression(
  expression: Expression,
  localLabelMap: ReadonlyMap<string, string>,
): Expression {
  switch (expression.kind) {
    case 'symbol':
      return { ...expression, name: localLabelMap.get(expression.name) ?? expression.name };
    case 'unary':
      return { ...expression, expression: renameExpression(expression.expression, localLabelMap) };
    case 'binary':
      return {
        ...expression,
        left: renameExpression(expression.left, localLabelMap),
        right: renameExpression(expression.right, localLabelMap),
      };
    case 'layout-cast':
      return { ...expression, base: renameExpression(expression.base, localLabelMap) };
    default:
      return expression;
  }
}
