import type {
  AsmBlockNode,
  AsmInstructionNode,
  AsmLabelNode,
  AsmOperandNode,
  ClassicItemNode,
  FuncDeclNode,
  ImmExprNode,
  ModuleItemNode,
  OpDeclNode,
  ProgramNode,
  SectionItemNode,
  SourceSpan,
} from '../frontend/ast.js';
import {
  cloneEaExpr,
  cloneImmExpr,
  cloneOperand,
  flattenEaDottedName,
} from '../lowering/asmUtils.js';
import { expandVisibleOpBodyItems } from '../lowering/opExpansionExecution.js';
import { createOpMatchingHelpers } from '../lowering/opMatching.js';
import { createOpSubstitutionHelpers } from '../lowering/opSubstitution.js';
import type { CompileEnv } from '../semantics/env.js';
import type {
  RegisterCareDirectCall,
  RegisterCareInstruction,
  RegisterCareProgramModel,
  RegisterCareRoutine,
} from './types.js';

type FlatItem =
  | { kind: 'label'; label: AsmLabelNode }
  | { kind: 'instruction'; instruction: AsmInstructionNode };

type FlattenableItem = ModuleItemNode | SectionItemNode | ClassicItemNode;

type OpExpansionContext = {
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
  exportedOpsByQualifiedName: Map<string, OpDeclNode[]>;
  moduleIdByFile: Map<string, string>;
  nextSyntheticLabelId: number;
};

const REG8_NAMES = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']);
const CONDITION_CODES = new Set(['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M']);
const MAX_OP_EXPANSION_DEPTH = 64;
const EMPTY_OP_SUBSTITUTION_ENV: CompileEnv = {
  consts: new Map(),
  enums: new Map(),
  types: new Map(),
};

function moduleQualifierOf(name: string): string | undefined {
  const dot = name.indexOf('.');
  if (dot <= 0) return undefined;
  return name.slice(0, dot);
}

function isIxIyIndexedMem(op: AsmOperandNode): boolean {
  return (
    op.kind === 'Mem' &&
    ((op.expr.kind === 'EaName' && /^(IX|IY)$/i.test(op.expr.name)) ||
      ((op.expr.kind === 'EaAdd' || op.expr.kind === 'EaSub') &&
        op.expr.base.kind === 'EaName' &&
        /^(IX|IY)$/i.test(op.expr.base.name)))
  );
}

function normalizeFixedToken(op: AsmOperandNode): string | undefined {
  switch (op.kind) {
    case 'Reg':
      return op.name.toUpperCase();
    case 'Imm':
      return op.expr.kind === 'ImmName' ? op.expr.name.toUpperCase() : undefined;
    case 'Ea': {
      const name = flattenEaDottedName(op.expr);
      return name ? name.toUpperCase() : undefined;
    }
    default:
      return undefined;
  }
}

function evalImmNoDiag(expr: ImmExprNode): number | undefined {
  switch (expr.kind) {
    case 'ImmLiteral':
      return expr.value;
    case 'ImmUnary': {
      const value = evalImmNoDiag(expr.expr);
      if (value === undefined) return undefined;
      if (expr.op === '-') return -value;
      if (expr.op === '+') return value;
      return undefined;
    }
    case 'ImmBinary': {
      const left = evalImmNoDiag(expr.left);
      const right = evalImmNoDiag(expr.right);
      if (left === undefined || right === undefined) return undefined;
      if (expr.op === '+') return left + right;
      if (expr.op === '-') return left - right;
      if (expr.op === '*') return left * right;
      return undefined;
    }
    default:
      return undefined;
  }
}

const { selectOpOverload } = createOpMatchingHelpers({
  reg8: REG8_NAMES,
  isIxIyIndexedMem,
  flattenEaDottedName,
  isEnumName: () => false,
  normalizeFixedToken,
  conditionOpcodeFromName: (name) => (CONDITION_CODES.has(name.toUpperCase()) ? 0 : undefined),
  evalImmNoDiag,
  inferMemWidth: () => undefined,
});

function addOpDeclForFile(
  ctx: OpExpansionContext,
  file: string,
  key: string,
  op: OpDeclNode,
): void {
  let fileOps = ctx.localOpsByFile.get(file);
  if (!fileOps) {
    fileOps = new Map();
    ctx.localOpsByFile.set(file, fileOps);
  }
  const local = fileOps.get(key);
  if (local) local.push(op);
  else fileOps.set(key, [op]);
}

function collectOpDeclsFromItems(
  items: FlattenableItem[],
  ctx: OpExpansionContext,
  sourceUnitFile: string,
): void {
  for (const item of items) {
    if (item.kind === 'NamedSection') {
      collectOpDeclsFromItems(item.items as FlattenableItem[], ctx, sourceUnitFile);
      continue;
    }
    if (item.kind !== 'OpDecl') continue;
    const op = item as OpDeclNode;
    const key = op.name.toLowerCase();
    addOpDeclForFile(ctx, sourceUnitFile, key, op);
    if (op.span.file !== sourceUnitFile) addOpDeclForFile(ctx, op.span.file, key, op);

    if (op.exported) {
      const moduleId = ctx.moduleIdByFile.get(sourceUnitFile)?.toLowerCase() ?? sourceUnitFile;
      const qualified = `${moduleId}.${key}`;
      const exported = ctx.exportedOpsByQualifiedName.get(qualified);
      if (exported) exported.push(op);
      else ctx.exportedOpsByQualifiedName.set(qualified, [op]);
    }
  }
}

function buildOpExpansionContext(program: ProgramNode): OpExpansionContext {
  const ctx: OpExpansionContext = {
    localOpsByFile: new Map(),
    exportedOpsByQualifiedName: new Map(),
    moduleIdByFile: new Map(),
    nextSyntheticLabelId: 0,
  };
  for (const file of program.files) {
    if ('moduleId' in file) ctx.moduleIdByFile.set(file.path, file.moduleId);
  }
  for (const file of program.files) {
    collectOpDeclsFromItems(file.items as FlattenableItem[], ctx, file.path);
  }
  return ctx;
}

function resolveOpCandidates(
  inst: AsmInstructionNode,
  ctx: OpExpansionContext,
): OpDeclNode[] | undefined {
  const lower = inst.head.toLowerCase();
  const qualifier = moduleQualifierOf(lower);
  if (!qualifier) return ctx.localOpsByFile.get(inst.span.file)?.get(lower);

  const currentModuleId = ctx.moduleIdByFile.get(inst.span.file)?.toLowerCase();
  if (currentModuleId === qualifier) {
    const localName = lower.slice(qualifier.length + 1);
    return ctx.localOpsByFile.get(inst.span.file)?.get(localName);
  }
  return ctx.exportedOpsByQualifiedName.get(lower);
}

function expandInstructionForRegisterCare(
  inst: AsmInstructionNode,
  ctx: OpExpansionContext,
  stack: ReadonlySet<string> = new Set(),
): FlatItem[] {
  if (stack.size >= MAX_OP_EXPANSION_DEPTH) return [{ kind: 'instruction', instruction: inst }];
  const candidates = resolveOpCandidates(inst, ctx);
  if (!candidates || candidates.length === 0) return [{ kind: 'instruction', instruction: inst }];
  const selection = selectOpOverload(candidates, inst.operands);
  if (selection.kind !== 'selected') return [{ kind: 'instruction', instruction: inst }];

  const opDecl = selection.overload;
  const opKey = `${opDecl.name.toLowerCase()}:${opDecl.span.file}:${opDecl.span.start.line}`;
  if (stack.has(opKey)) return [{ kind: 'instruction', instruction: inst }];
  const nextStack = new Set(stack);
  nextStack.add(opKey);

  const bindings = new Map<string, AsmOperandNode>();
  for (let index = 0; index < opDecl.params.length; index += 1) {
    bindings.set(opDecl.params[index]!.name.toLowerCase(), inst.operands[index]!);
  }
  const {
    substituteImmWithOpLabels,
    substituteOperandWithOpLabels,
    substituteConditionWithOpLabels,
  } = createOpSubstitutionHelpers({
    bindings,
    env: EMPTY_OP_SUBSTITUTION_ENV,
    diagnostics: [],
    diagAt: () => {},
    cloneImmExpr,
    cloneEaExpr,
    cloneOperand,
    flattenEaDottedName,
    normalizeFixedToken,
    inverseConditionName: (name) => (CONDITION_CODES.has(name.toUpperCase()) ? name : undefined),
  });
  const out: FlatItem[] = [];
  const expansionId = ctx.nextSyntheticLabelId;
  ctx.nextSyntheticLabelId += 1;

  const expandedItems = expandVisibleOpBodyItems({
    opDecl,
    allocateLocalLabel: (labelName) =>
      `.__azm_op_${opDecl.name.toLowerCase()}_${expansionId}_${labelName.replace(/^\.+/, '')}`,
    substituteOperandWithOpLabels,
    substituteImmWithOpLabels,
    substituteConditionWithOpLabels,
  });

  // Register-care follows the visible op-expanded instruction stream here; this is analysis
  // input only, not hidden runtime lowering.
  for (const bodyItem of expandedItems) {
    if (bodyItem.kind === 'AsmLabel') {
      out.push({
        kind: 'label',
        label: {
          kind: 'AsmLabel',
          span: inst.span,
          name: bodyItem.name,
        },
      });
      continue;
    }
    if (bodyItem.kind !== 'AsmInstruction') continue;
    const expanded: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span: inst.span,
      head: bodyItem.head,
      operands: bodyItem.operands,
    };
    out.push(...expandInstructionForRegisterCare(expanded, ctx, nextStack));
  }
  return out;
}

function flattenAsmBlock(
  block: AsmBlockNode,
  out: FlatItem[],
  opExpansion: OpExpansionContext,
): void {
  for (const item of block.items) {
    if (item.kind === 'AsmLabel') {
      out.push({ kind: 'label', label: item });
      continue;
    }
    if (item.kind === 'AsmInstruction') {
      out.push(...expandInstructionForRegisterCare(item, opExpansion));
    }
  }
}

function flattenFuncDecl(
  func: FuncDeclNode,
  out: FlatItem[],
  opExpansion: OpExpansionContext,
): void {
  out.push({
    kind: 'label',
    label: {
      kind: 'AsmLabel',
      name: func.name,
      span: func.span,
      ...(func.exported ? { isEntry: true } : {}),
    },
  });
  flattenAsmBlock(func.asm, out, opExpansion);
}

function flattenItems(
  items: FlattenableItem[],
  out: FlatItem[],
  opExpansion: OpExpansionContext,
): void {
  for (const item of items) {
    if (item.kind === 'NamedSection') {
      if (item.section === 'code') flattenItems(item.items as FlattenableItem[], out, opExpansion);
      continue;
    }
    if (item.kind === 'FuncDecl') {
      flattenFuncDecl(item, out, opExpansion);
      continue;
    }
    if (item.kind === 'AsmLabel') {
      out.push({ kind: 'label', label: item });
      continue;
    }
    if (item.kind === 'AsmInstruction') {
      out.push(...expandInstructionForRegisterCare(item, opExpansion));
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
  const opExpansion = buildOpExpansionContext(program);
  for (const file of program.files) {
    flattenItems(file.items as FlattenableItem[], flat, opExpansion);
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
