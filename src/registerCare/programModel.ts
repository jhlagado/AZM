import type {
  AsmBlockNode,
  AsmInstructionNode,
  AsmLabelNode,
  SourceItemNode,
  ProgramNode,
  SourceSpan,
} from '../frontend/ast.js';
import { createInlineOpInstructionStreamExpander } from '../lowering/opExpansionStream.js';
import type {
  RegisterCareDirectCall,
  RegisterCareInstruction,
  RegisterCareProgramModel,
  RegisterCareRoutine,
} from './types.js';

type FlatItem =
  | { kind: 'label'; label: AsmLabelNode }
  | { kind: 'instruction'; instruction: AsmInstructionNode };

function flattenAsmBlock(
  block: AsmBlockNode,
  out: FlatItem[],
  expandInstruction: (inst: AsmInstructionNode) => FlatItem[],
): void {
  for (const item of block.items) {
    if (item.kind === 'AsmLabel') {
      out.push({ kind: 'label', label: item });
      continue;
    }
    if (item.kind === 'AsmInstruction') {
      out.push(...expandInstruction(item));
    }
  }
}

function flattenItems(
  items: SourceItemNode[],
  out: FlatItem[],
  expandInstruction: (inst: AsmInstructionNode) => FlatItem[],
): void {
  for (const item of items) {
    if (item.kind === 'AsmLabel') {
      out.push({ kind: 'label', label: item });
      continue;
    }
    if (item.kind === 'AsmInstruction') {
      out.push(...expandInstruction(item));
    }
  }
}

function directCallTarget(inst: AsmInstructionNode): string | undefined {
  if (inst.head.toLowerCase() !== 'call') return undefined;
  if (inst.operands.length !== 1 && inst.operands.length !== 2) return undefined;
  const op = inst.operands[inst.operands.length - 1];
  if (op?.kind !== 'Imm' || op.expr.kind !== 'ImmName') return undefined;
  return op.expr.name;
}

function directTailJumpTarget(
  inst: AsmInstructionNode,
  entryNames?: ReadonlySet<string>,
): string | undefined {
  if (inst.head.toLowerCase() !== 'jp') return undefined;
  if (inst.operands.length !== 1 && inst.operands.length !== 2) return undefined;
  if (inst.operands.length === 2 && entryNames === undefined) return undefined;
  const op = inst.operands[inst.operands.length - 1];
  if (op?.kind !== 'Imm' || op.expr.kind !== 'ImmName') return undefined;
  if (op.expr.name.startsWith('.')) return undefined;
  if (entryNames !== undefined && !entryNames.has(op.expr.name)) return undefined;
  return op.expr.name;
}

function toInstruction(inst: AsmInstructionNode, labels: string[] = []): RegisterCareInstruction {
  return {
    instruction: inst,
    head: inst.head.toLowerCase(),
    file: inst.span.file,
    line: inst.span.start.line,
    column: inst.span.start.column,
    labels,
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

function isLocalLabel(name: string): boolean {
  return name.startsWith('.');
}

function isEntryLabel(label: AsmLabelNode): boolean {
  return label.isEntry === true;
}

function flatItemFile(item: FlatItem): string {
  return item.kind === 'label' ? item.label.span.file : item.instruction.span.file;
}

function isTerminalReturn(inst: AsmInstructionNode): boolean {
  const head = inst.head.toLowerCase();
  if (head === 'ret') return inst.operands.length === 0;
  return head === 'retn' || head === 'reti';
}

export function buildRegisterCareProgramModel(program: ProgramNode): RegisterCareProgramModel {
  const flat: FlatItem[] = [];
  const { expandInstruction } = createInlineOpInstructionStreamExpander(program);
  for (const file of program.files) {
    flattenItems(file.items, flat, expandInstruction);
  }
  const labelItems = flat.filter(
    (item): item is Extract<FlatItem, { kind: 'label' }> => item.kind === 'label',
  );
  const filesWithEntryLabels = new Set(
    labelItems.filter((item) => isEntryLabel(item.label)).map((item) => item.label.span.file),
  );
  const entryLabelNames = new Set(
    labelItems
      .filter(
        (item) =>
          isEntryLabel(item.label) ||
          (!filesWithEntryLabels.has(item.label.span.file) && !isLocalLabel(item.label.name)),
      )
      .map((item) => item.label.name),
  );

  const directCalls: RegisterCareDirectCall[] = flat.flatMap((item) => {
    if (item.kind !== 'instruction') return [];
    const target = directCallTarget(item.instruction);
    if (target === undefined) return [];
    return [
      {
        target,
        subject: `CALL ${target}`,
        file: item.instruction.span.file,
        line: item.instruction.span.start.line,
        column: item.instruction.span.start.column,
      },
    ];
  });
  const directTailJumps: RegisterCareDirectCall[] = flat.flatMap((item) => {
    if (item.kind !== 'instruction') return [];
    const sourceFileUsesEntryLabels = filesWithEntryLabels.has(item.instruction.span.file);
    const target = directTailJumpTarget(
      item.instruction,
      sourceFileUsesEntryLabels ? entryLabelNames : undefined,
    );
    if (target === undefined) return [];
    return [
      {
        target,
        subject: `JP ${target}`,
        file: item.instruction.span.file,
        line: item.instruction.span.start.line,
        column: item.instruction.span.start.column,
      },
    ];
  });
  const directBoundaries = [...directCalls, ...directTailJumps];
  const directCallTargets = Array.from(new Set(directCalls.map((call) => call.target))).sort();

  const routines: RegisterCareRoutine[] = [];
  const coalescedGlobalLabelIndexes = new Set<number>();
  for (let index = 0; index < flat.length; index += 1) {
    const item = flat[index];
    if (coalescedGlobalLabelIndexes.has(index)) continue;
    if (item?.kind !== 'label' || isLocalLabel(item.label.name)) continue;
    const routineFile = item.label.span.file;
    const fileUsesEntryLabels = filesWithEntryLabels.has(routineFile);
    if (fileUsesEntryLabels && !isEntryLabel(item.label)) continue;

    const labels = [item.label.name];
    const entryLabels = isEntryLabel(item.label) ? [item.label.name] : undefined;
    const instructions: RegisterCareInstruction[] = [];
    let pendingInstructionLabels = [item.label.name];
    let endSpan = item.label.span;

    for (let rangeIndex = index + 1; rangeIndex < flat.length; rangeIndex += 1) {
      const rangeItem = flat[rangeIndex];
      if (!rangeItem) break;
      if (flatItemFile(rangeItem) !== routineFile) break;
      if (rangeItem.kind === 'label') {
        if (fileUsesEntryLabels && isEntryLabel(rangeItem.label)) {
          if (instructions.length > 0) break;
          labels.push(rangeItem.label.name);
          entryLabels?.push(rangeItem.label.name);
          coalescedGlobalLabelIndexes.add(rangeIndex);
          endSpan = rangeItem.label.span;
          continue;
        }
        if (!fileUsesEntryLabels && !isLocalLabel(rangeItem.label.name)) {
          if (instructions.length > 0) break;
          labels.push(rangeItem.label.name);
          coalescedGlobalLabelIndexes.add(rangeIndex);
          endSpan = rangeItem.label.span;
          continue;
        }
        labels.push(rangeItem.label.name);
        pendingInstructionLabels.push(rangeItem.label.name);
        endSpan = rangeItem.label.span;
        continue;
      }

      instructions.push(toInstruction(rangeItem.instruction, pendingInstructionLabels));
      pendingInstructionLabels = [];
      endSpan = rangeItem.instruction.span;
      if (isTerminalReturn(rangeItem.instruction)) break;
    }

    routines.push({
      name: item.label.name,
      span: spanFrom(item.label.span, endSpan),
      labels,
      ...(entryLabels ? { entryLabels } : {}),
      instructions,
    });
  }

  return { routines, directCallTargets, directCalls, directBoundaries };
}
