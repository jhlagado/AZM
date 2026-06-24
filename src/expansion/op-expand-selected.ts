import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { encodeZ80Instruction } from '../z80/encode.js';
import { parseZ80Instruction } from '../z80/parse-instruction.js';
import { instantiateTemplateInstruction } from './op-instruction-instantiation.js';
import {
  buildLocalLabelMap,
  renameInstructionExpressions,
  renameSourceItems,
} from './op-local-labels.js';
import type {
  LogicalLineLike,
  OpDecl,
  OpTemplateItem,
} from './op-expansion.js';
import {
  formatOpOperand,
  type OpOperand,
} from './op-operands.js';
import { formatOpSelectionDiagnostic, selectOpOverload } from './op-selection.js';

type EmittedOpSource = NonNullable<Extract<SourceItem, { kind: 'instruction' }>['emittedSource']>;

export function expandSelectedOp(
  ops: ReadonlyMap<string, readonly OpDecl[]>,
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
  stack: readonly OpDecl[],
): readonly SourceItem[] {
  const name = overloads[0]?.name ?? '<unknown>';
  const cycleStart = stack.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (cycleStart !== -1) {
    diagnostics.push(parseDiagnostic(line, formatCycleDiagnostic(name, stack, cycleStart, overloads)));
    return [];
  }

  const selection = selectOpOverload(overloads, operands);
  if (selection.kind !== 'selected') {
    diagnostics.push(parseDiagnostic(line, formatOpSelectionDiagnostic(selection, overloads, operands)));
    return [];
  }

  const bindings = bindOpOperands(selection.overload, operands);
  const expanded: SourceItem[] = [];
  const localLabelMap = buildLocalLabelMap(selection.overload, line);
  const expansionStack = [...stack, selection.overload];
  const emittedSource = opEmittedSource(line);
  for (const item of selection.overload.body) {
    expanded.push(
      ...expandTemplateItem(
        ops,
        item,
        bindings,
        line,
        diagnostics,
        selection.overload,
        expansionStack,
        localLabelMap,
        emittedSource,
      ),
    );
  }
  return expanded;
}

function bindOpOperands(overload: OpDecl, operands: readonly OpOperand[]): ReadonlyMap<string, OpOperand> {
  const bindings = new Map<string, OpOperand>();
  overload.params.forEach((param, index) => {
    bindings.set(param.name, operands[index]!);
  });
  return bindings;
}

function expandTemplateItem(
  ops: ReadonlyMap<string, readonly OpDecl[]>,
  item: OpTemplateItem,
  bindings: ReadonlyMap<string, OpOperand>,
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
  overload: OpDecl,
  expansionStack: readonly OpDecl[],
  localLabelMap: ReadonlyMap<string, string>,
  emittedSource: EmittedOpSource,
): readonly SourceItem[] {
  if (item.kind === 'source-items') {
    return renameSourceItems(item.items, localLabelMap).map((renamed) =>
      stampOpSource(renamed, emittedSource),
    );
  }
  const concreteOperands = instantiateTemplateOperands(item, bindings);
  if (!concreteOperands) {
    diagnostics.push(parseDiagnostic(line, `invalid op expansion in "${overload.name}"`));
    return [];
  }
  const nested = ops.get(item.mnemonic);
  if (nested) {
    return expandSelectedOp(ops, nested, concreteOperands, line, diagnostics, expansionStack);
  }
  const instruction = instantiateTemplateInstruction(item.mnemonic, concreteOperands);
  if (!instruction || encodeZ80Instruction(instruction).size === 0) {
    reportInvalidOpExpansion(line, diagnostics, overload, expansionStack, item, concreteOperands);
    return [];
  }
  return [{
    kind: 'instruction',
    instruction: renameInstructionExpressions(instruction, localLabelMap),
    span: emittedSource.span,
    emittedSource,
  }];
}

function opEmittedSource(line: LogicalLineLike): EmittedOpSource {
  return {
    span: {
      sourceName: line.sourceName,
      line: line.line,
      column: firstColumn(line.text),
      ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
      ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
      ...(line.sourceUnitRelation !== undefined ? { sourceUnitRelation: line.sourceUnitRelation } : {}),
    },
    kind: 'macro',
  };
}

function stampOpSource(item: SourceItem, emittedSource: EmittedOpSource): SourceItem {
  if (item.kind !== 'instruction') return item;
  return { ...item, emittedSource };
}

function formatOpChainEntry(op: OpDecl): string {
  return `${op.name} (${op.sourceName}:${op.line})`;
}

function formatCycleDiagnostic(
  name: string,
  stack: readonly OpDecl[],
  cycleStart: number,
  overloads: readonly OpDecl[],
): string {
  return [
    `Cyclic op expansion detected for "${name}".`,
    `expansion chain: ${[...stack.slice(cycleStart), overloads[0]!].map(formatOpChainEntry).join(' -> ')}`,
  ].join('\n');
}

function formatExpandedInstruction(mnemonic: string, operands: readonly OpOperand[]): string {
  return `${mnemonic} ${operands.map(formatOpOperand).join(', ')}`.trim();
}

function reportInvalidOpExpansion(
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
  overload: OpDecl,
  expansionStack: readonly OpDecl[],
  item: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
  concreteOperands: readonly OpOperand[],
): void {
  const expandedInstruction = formatExpandedInstruction(item.mnemonic, concreteOperands);
  const underlying = expandedInstructionUnderlyingError(item, concreteOperands);
  if (underlying) {
    diagnostics.push(parseDiagnostic(line, underlying));
  }
  diagnostics.push(
    parseDiagnostic(
      line,
      formatInvalidOpExpansionDiagnostic(overload, expandedInstruction, expansionStack),
    ),
  );
}

function expandedInstructionUnderlyingError(
  item: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
  concreteOperands: readonly OpOperand[],
): string | undefined {
  const instruction = instantiateTemplateInstruction(item.mnemonic, concreteOperands);
  if (instruction && encodeZ80Instruction(instruction).size > 0) {
    return undefined;
  }
  if (instruction?.mnemonic === 'ld' || item.mnemonic === 'ld') {
    return 'ld expects a supported register/memory/immediate transfer form';
  }
  const parsed = parseZ80Instruction(formatExpandedInstruction(item.mnemonic, concreteOperands));
  return parsed?.error;
}

function formatInvalidOpExpansionDiagnostic(
  overload: OpDecl,
  expandedInstruction: string,
  expansionStack: readonly OpDecl[],
): string {
  return [
    `Invalid op expansion in "${overload.name}" at call site.`,
    `expanded instruction: ${expandedInstruction}`,
    `op definition: ${overload.sourceName}:${overload.line}`,
    `expansion chain: ${expansionStack.map(formatOpChainEntry).join(' -> ')}`,
  ].join('\n');
}

function instantiateTemplateOperands(
  item: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
  bindings: ReadonlyMap<string, OpOperand>,
): readonly OpOperand[] | undefined {
  const operands = item.operands.map((operand) =>
    operand.kind === 'param'
      ? bindings.get(operand.name)
      : operand.kind === 'port-param'
        ? parenthesizedOperandFromBinding(item.mnemonic, bindings.get(operand.name))
        : operand.operand,
  );
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }
  return operands as OpOperand[];
}

function parenthesizedOperandFromBinding(
  mnemonic: string,
  operand: OpOperand | undefined,
): OpOperand | undefined {
  if (operand?.kind !== 'imm') {
    return undefined;
  }
  return mnemonic === 'in' || mnemonic === 'out'
    ? operand
    : { kind: 'mem-abs', expression: operand.expression, text: `(${operand.text})` };
}

function parseDiagnostic(line: LogicalLineLike, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_PARSE',
    message,
    sourceName: line.sourceName,
    line: line.line,
    column: firstColumn(line.text),
  };
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}
