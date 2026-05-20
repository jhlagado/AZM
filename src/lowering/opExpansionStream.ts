import type {
  AsmInstructionNode,
  AsmLabelNode,
  AsmOperandNode,
  AsmItemNode,
  ImmExprNode,
  SourceItemNode,
  OpDeclNode,
  ProgramNode,
} from '../frontend/ast.js';
import {
  cloneEaExpr,
  cloneImmExpr,
  cloneOperand,
  flattenEaDottedName,
} from './asmUtils.js';
import { expandInlineOpBodyItems } from './opExpansionExecution.js';
import { createOpMatchingHelpers } from './opMatching.js';
import { createOpSubstitutionHelpers } from './opSubstitution.js';
import type { CompileEnv } from '../semantics/env.js';

type FlattenableItem = SourceItemNode | AsmItemNode;

type OpExpansionContext = {
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
  nextSyntheticLabelId: number;
};

const REG8_NAMES = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']);
const CONDITION_CODES = new Set(['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M']);
const MAX_OP_EXPANSION_DEPTH = 64;
const EMPTY_OP_SUBSTITUTION_ENV: CompileEnv = {
  equates: new Map(),
  enums: new Map(),
  types: new Map(),
};

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
    if (item.kind !== 'OpDecl') continue;
    const op = item as OpDeclNode;
    const key = op.name.toLowerCase();
    addOpDeclForFile(ctx, sourceUnitFile, key, op);
    if (op.span.file !== sourceUnitFile) addOpDeclForFile(ctx, op.span.file, key, op);
  }
}

function buildOpExpansionContext(program: ProgramNode): OpExpansionContext {
  const ctx: OpExpansionContext = {
    localOpsByFile: new Map(),
    nextSyntheticLabelId: 0,
  };
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
  return ctx.localOpsByFile.get(inst.span.file)?.get(lower);
}

export type ExpandedOpStreamItem =
  | { kind: 'label'; label: AsmLabelNode }
  | { kind: 'instruction'; instruction: AsmInstructionNode };

export function createInlineOpInstructionStreamExpander(program: ProgramNode): {
  expandInstruction: (inst: AsmInstructionNode) => ExpandedOpStreamItem[];
} {
  const ctx = buildOpExpansionContext(program);

  function expandInstruction(
    inst: AsmInstructionNode,
    stack: ReadonlySet<string> = new Set(),
  ): ExpandedOpStreamItem[] {
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
      substituteOperandWithOpLabels,
    } = createOpSubstitutionHelpers({
      bindings,
      env: EMPTY_OP_SUBSTITUTION_ENV,
      diagnostics: [],
      diagAt: () => {},
      cloneImmExpr,
      cloneEaExpr,
      cloneOperand,
      flattenEaDottedName,
    });
    const out: ExpandedOpStreamItem[] = [];
    const expansionId = ctx.nextSyntheticLabelId;
    ctx.nextSyntheticLabelId += 1;

    const expandedItems = expandInlineOpBodyItems({
      opDecl,
      allocateLocalLabel: (labelName) =>
        `.__azm_op_${opDecl.name.toLowerCase()}_${expansionId}_${labelName.replace(/^\.+/, '')}`,
      substituteOperandWithOpLabels,
    });

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
      out.push(...expandInstruction(expanded, nextStack));
    }
    return out;
  }

  return { expandInstruction };
}
