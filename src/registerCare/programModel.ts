import type {
  AsmInstructionNode,
  AsmItemNode,
  AsmLabelNode,
  ClassicItemNode,
  ModuleItemNode,
  ProgramNode,
  SectionItemNode,
  SourceSpan,
} from '../frontend/ast.js';
import type {
  RegisterCareInstruction,
  RegisterCareProgramModel,
  RegisterCareRoutine,
} from './types.js';

type FlatItem =
  | { kind: 'label'; label: AsmLabelNode }
  | { kind: 'instruction'; instruction: AsmInstructionNode };

type FlattenableItem = ModuleItemNode | SectionItemNode | ClassicItemNode | AsmItemNode;

function flattenItems(items: FlattenableItem[], out: FlatItem[]): void {
  for (const item of items) {
    if (item.kind === 'NamedSection') {
      if (item.section === 'code') flattenItems(item.items as FlattenableItem[], out);
      continue;
    }
    if (item.kind === 'FuncDecl') {
      flattenItems(item.asm.items, out);
      continue;
    }
    if (item.kind === 'OpDecl') {
      flattenItems(item.body.items, out);
      continue;
    }
    if (item.kind === 'AsmLabel') {
      out.push({ kind: 'label', label: item });
      continue;
    }
    if (item.kind === 'AsmInstruction') {
      out.push({ kind: 'instruction', instruction: item });
    }
  }
}

function directCallTarget(inst: AsmInstructionNode): string | undefined {
  if (inst.head.toLowerCase() !== 'call' || inst.operands.length !== 1) return undefined;
  const op = inst.operands[0];
  if (op?.kind !== 'Imm' || op.expr.kind !== 'ImmName') return undefined;
  return op.expr.name;
}

function toInstruction(inst: AsmInstructionNode): RegisterCareInstruction {
  return {
    instruction: inst,
    head: inst.head.toLowerCase(),
    file: inst.span.file,
    line: inst.span.start.line,
    column: inst.span.start.column,
  };
}

function spanFrom(start: SourceSpan, end: SourceSpan): SourceSpan {
  if (start.file !== end.file) return start;
  return {
    file: start.file,
    start: start.start,
    end: end.end,
  };
}

function isTerminalReturn(inst: AsmInstructionNode): boolean {
  const head = inst.head.toLowerCase();
  return head === 'ret' || head === 'retn' || head === 'reti';
}

export function buildRegisterCareProgramModel(program: ProgramNode): RegisterCareProgramModel {
  const flat: FlatItem[] = [];
  for (const file of program.files) {
    flattenItems(file.items as FlattenableItem[], flat);
  }

  const directCallTargets = Array.from(
    new Set(
      flat.flatMap((item) => {
        if (item.kind !== 'instruction') return [];
        const target = directCallTarget(item.instruction);
        return target === undefined ? [] : [target];
      }),
    ),
  ).sort();
  const directCallTargetSet = new Set(directCallTargets);

  const routines: RegisterCareRoutine[] = [];
  for (let index = 0; index < flat.length; index += 1) {
    const item = flat[index];
    if (item?.kind !== 'label' || !directCallTargetSet.has(item.label.name)) continue;

    const labels = [item.label.name];
    const instructions: RegisterCareInstruction[] = [];
    let endSpan = item.label.span;

    for (let rangeIndex = index + 1; rangeIndex < flat.length; rangeIndex += 1) {
      const rangeItem = flat[rangeIndex];
      if (!rangeItem) break;
      if (rangeItem.kind === 'label') {
        if (directCallTargetSet.has(rangeItem.label.name)) break;
        labels.push(rangeItem.label.name);
        endSpan = rangeItem.label.span;
        continue;
      }

      instructions.push(toInstruction(rangeItem.instruction));
      endSpan = rangeItem.instruction.span;
      if (isTerminalReturn(rangeItem.instruction)) break;
    }

    routines.push({
      name: item.label.name,
      span: spanFrom(item.label.span, endSpan),
      labels,
      instructions,
    });
  }

  return { routines, directCallTargets };
}
