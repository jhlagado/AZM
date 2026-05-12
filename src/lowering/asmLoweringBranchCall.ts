import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';

type DiagAt = (diagnostics: Diagnostic[], span: AsmInstructionNode['span'], message: string) => void;

export type BranchCallLoweringContext = {
  diagnostics: Diagnostic[];
  diagAt: DiagAt;
  emitInstr: (head: string, operands: AsmOperandNode[], span: AsmInstructionNode['span']) => boolean;
  emitRawCodeBytes: (bytes: Uint8Array, file: string, asmText: string) => void;
  emitAbs16Fixup: (opcode: number, baseLower: string, addend: number, span: AsmInstructionNode['span']) => void;
  emitRel8Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: AsmInstructionNode['span'],
    mnemonic: string,
    asmText?: string,
  ) => void;
  conditionOpcodeFromName: (nameRaw: string) => number | undefined;
  callConditionOpcodeFromName: (nameRaw: string) => number | undefined;
  jrConditionOpcodeFromName: (nameRaw: string) => number | undefined;
  conditionOpcode: (op: AsmOperandNode) => number | undefined;
  symbolicTargetFromExpr: (
    expr: Extract<AsmOperandNode, { kind: 'Imm' }>['expr'],
  ) => { baseLower: string; addend: number } | undefined;
  evalImmExpr: (expr: Extract<AsmOperandNode, { kind: 'Imm' }>['expr']) => number | undefined;
  diagIfRetStackImbalanced: (span: AsmInstructionNode['span'], mnemonic?: string) => void;
  diagIfCallStackUnverifiable: (options: {
    span: AsmInstructionNode['span'];
    mnemonic?: string;
    contractKind?: 'callee' | 'typed-call';
  }) => void;
  warnIfRawCallTargetsTypedCallable: (
    span: AsmInstructionNode['span'],
    symbolicTarget: { baseLower: string; addend: number } | undefined,
  ) => void;
  emitSyntheticEpilogue: boolean;
  epilogueLabel: string;
  emitJumpTo: (label: string, span: AsmInstructionNode['span']) => void;
  emitJumpCondTo: (opcode: number, label: string, span: AsmInstructionNode['span']) => void;
  syncToFlow: () => void;
  flowRef: { current: { reachable: boolean } };
};

const emitRel8FromOperand = (
  ctx: BranchCallLoweringContext,
  asmItem: AsmInstructionNode,
  operand: AsmOperandNode,
  opcode: number,
  mnemonic: string,
): boolean => {
  if (operand.kind !== 'Imm') {
    if (mnemonic === 'djnz' || mnemonic.startsWith('jr')) {
      ctx.diagAt(ctx.diagnostics, asmItem.span, `${mnemonic} expects disp8`);
    } else {
      ctx.diagAt(ctx.diagnostics, asmItem.span, `${mnemonic} expects an immediate target.`);
    }
    return false;
  }
  const symbolicTarget = ctx.symbolicTargetFromExpr(operand.expr);
  if (symbolicTarget) {
    ctx.emitRel8Fixup(opcode, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span, mnemonic);
    return true;
  }
  const value = ctx.evalImmExpr(operand.expr);
  if (value === undefined) {
    ctx.diagAt(ctx.diagnostics, asmItem.span, `Failed to evaluate ${mnemonic} target.`);
    return false;
  }
  if (value < -128 || value > 127) {
    ctx.diagAt(
      ctx.diagnostics,
      asmItem.span,
      `${mnemonic} relative branch displacement out of range (-128..127): ${value}.`,
    );
    return false;
  }
  ctx.emitRawCodeBytes(Uint8Array.of(opcode, value & 0xff), asmItem.span.file, `${mnemonic} ${value}`);
  return true;
};

export function tryLowerBranchCallInstruction(
  asmItem: AsmInstructionNode,
  ctx: BranchCallLoweringContext,
): boolean | undefined {
  const head = asmItem.head.toLowerCase();

  if (head === 'call') {
    ctx.diagIfCallStackUnverifiable({ span: asmItem.span });
  }

  if (head === 'jr') {
    if (asmItem.operands.length === 1) {
      if (asmItem.operands[0]!.kind === 'Mem') {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `jr does not support indirect targets; expects disp8`);
        return true;
      }
      const single = asmItem.operands[0]!;
      const ccSingle =
        single.kind === 'Imm' && single.expr.kind === 'ImmName'
          ? single.expr.name
          : single.kind === 'Reg'
            ? single.name
            : undefined;
      if (ccSingle && ctx.jrConditionOpcodeFromName(ccSingle) !== undefined) {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `jr cc, disp expects two operands (cc, disp8)`);
        return true;
      }
      if (single.kind === 'Imm') {
        const symbolicTarget = ctx.symbolicTargetFromExpr(single.expr);
        if (symbolicTarget && ctx.jrConditionOpcodeFromName(symbolicTarget.baseLower) !== undefined) {
          ctx.diagAt(ctx.diagnostics, asmItem.span, `jr cc, disp expects two operands (cc, disp8)`);
          return true;
        }
      }
      if (single.kind === 'Reg') {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `jr does not support register targets; expects disp8`);
        return true;
      }
      if (!emitRel8FromOperand(ctx, asmItem, single, 0x18, 'jr')) return false;
      ctx.flowRef.current.reachable = false;
      ctx.syncToFlow();
      return true;
    }
    if (asmItem.operands.length === 2) {
      const ccOp = asmItem.operands[0]!;
      const ccName =
        ccOp.kind === 'Imm' && ccOp.expr.kind === 'ImmName'
          ? ccOp.expr.name
          : ccOp.kind === 'Reg'
            ? ccOp.name
            : undefined;
      const opcode = ccName ? ctx.jrConditionOpcodeFromName(ccName) : undefined;
      if (opcode === undefined) {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `jr cc expects valid condition code NZ/Z/NC/C`);
        return true;
      }
      const target = asmItem.operands[1]!;
      if (target.kind === 'Mem') {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `jr cc, disp does not support indirect targets`);
        return true;
      }
      if (target.kind === 'Reg') {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `jr cc, disp does not support register targets; expects disp8`);
        return true;
      }
      if (target.kind !== 'Imm') {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `jr cc, disp expects disp8`);
        return true;
      }
      if (!emitRel8FromOperand(ctx, asmItem, target, opcode, `jr ${ccName!.toLowerCase()}`)) return false;
      ctx.syncToFlow();
      return true;
    }
  }

  if (head === 'djnz') {
    if (asmItem.operands.length !== 1) {
      ctx.diagAt(ctx.diagnostics, asmItem.span, `djnz expects one operand (disp8)`);
      return true;
    }
    const target = asmItem.operands[0]!;
    if (target.kind === 'Mem') {
      ctx.diagAt(ctx.diagnostics, asmItem.span, `djnz does not support indirect targets; expects disp8`);
      return true;
    }
    if (target.kind === 'Reg') {
      ctx.diagAt(ctx.diagnostics, asmItem.span, `djnz does not support register targets; expects disp8`);
      return true;
    }
    if (target.kind !== 'Imm') {
      ctx.diagAt(ctx.diagnostics, asmItem.span, `djnz expects disp8`);
      return true;
    }
    if (!emitRel8FromOperand(ctx, asmItem, target, 0x10, 'djnz')) return false;
    ctx.syncToFlow();
    return true;
  }

  if (head === 'rst' && asmItem.operands.length === 1) {
    ctx.diagIfCallStackUnverifiable({ span: asmItem.span, mnemonic: 'rst' });
  }

  if (head === 'ret') {
    if (asmItem.operands.length === 0) {
      ctx.diagIfRetStackImbalanced(asmItem.span);
      if (ctx.emitSyntheticEpilogue) {
        ctx.emitJumpTo(ctx.epilogueLabel, asmItem.span);
      } else {
        ctx.emitInstr('ret', [], asmItem.span);
      }
      ctx.flowRef.current.reachable = false;
      ctx.syncToFlow();
      return true;
    }
    if (asmItem.operands.length === 1) {
      const op = ctx.conditionOpcode(asmItem.operands[0]!);
      if (op === undefined) {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `ret cc expects a valid condition code`);
        return true;
      }
      ctx.diagIfRetStackImbalanced(asmItem.span);
      if (ctx.emitSyntheticEpilogue) {
        ctx.emitJumpCondTo(op, ctx.epilogueLabel, asmItem.span);
      } else {
        ctx.emitInstr('ret', [asmItem.operands[0]!], asmItem.span);
      }
      ctx.syncToFlow();
      return true;
    }
  }

  if ((head === 'retn' || head === 'reti') && asmItem.operands.length === 0) {
    ctx.diagIfRetStackImbalanced(asmItem.span, head);
    if (ctx.emitSyntheticEpilogue) {
      ctx.diagAt(
        ctx.diagnostics,
        asmItem.span,
        `${head} is not supported in functions that require cleanup; use ret/ret cc so cleanup epilogue can run.`,
      );
    }
    ctx.emitInstr(head, [], asmItem.span);
    ctx.flowRef.current.reachable = false;
    ctx.syncToFlow();
    return true;
  }

  if (head === 'jp' && asmItem.operands.length === 1) {
    const target = asmItem.operands[0]!;
    if (target.kind === 'Imm') {
      const symbolicTarget = ctx.symbolicTargetFromExpr(target.expr);
      if (symbolicTarget && ctx.conditionOpcodeFromName(symbolicTarget.baseLower) !== undefined) {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `jp cc, nn expects two operands (cc, nn)`);
        return true;
      }
      if (symbolicTarget) {
        ctx.emitAbs16Fixup(0xc3, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span);
        ctx.flowRef.current.reachable = false;
        ctx.syncToFlow();
        return true;
      }
    }
  }

  if (head === 'jp' && asmItem.operands.length === 2) {
    const ccOp = asmItem.operands[0]!;
    const ccName =
      ccOp.kind === 'Imm' && ccOp.expr.kind === 'ImmName'
        ? ccOp.expr.name
        : ccOp.kind === 'Reg'
          ? ccOp.name
          : undefined;
    const opcode = ccName ? ctx.conditionOpcodeFromName(ccName) : undefined;
    const target = asmItem.operands[1]!;
    if (opcode !== undefined && target.kind === 'Imm') {
      const symbolicTarget = ctx.symbolicTargetFromExpr(target.expr);
      if (symbolicTarget) {
        ctx.emitAbs16Fixup(opcode, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span);
        ctx.syncToFlow();
        return true;
      }
    }
  }

  if (head === 'call' && asmItem.operands.length === 1) {
    const target = asmItem.operands[0]!;
    if (target.kind === 'Imm') {
      const symbolicTarget = ctx.symbolicTargetFromExpr(target.expr);
      if (symbolicTarget && ctx.callConditionOpcodeFromName(symbolicTarget.baseLower) !== undefined) {
        ctx.diagAt(ctx.diagnostics, asmItem.span, `call cc, nn expects two operands (cc, nn)`);
        return true;
      }
      if (symbolicTarget) {
        ctx.warnIfRawCallTargetsTypedCallable(asmItem.span, symbolicTarget);
        ctx.emitAbs16Fixup(0xcd, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span);
        ctx.syncToFlow();
        return true;
      }
    }
  }

  if (head === 'call' && asmItem.operands.length === 2) {
    const ccOp = asmItem.operands[0]!;
    const ccName =
      ccOp.kind === 'Imm' && ccOp.expr.kind === 'ImmName'
        ? ccOp.expr.name
        : ccOp.kind === 'Reg'
          ? ccOp.name
          : undefined;
    const opcode = ccName ? ctx.callConditionOpcodeFromName(ccName) : undefined;
    const target = asmItem.operands[1]!;
    if (opcode !== undefined && target.kind === 'Imm') {
      const symbolicTarget = ctx.symbolicTargetFromExpr(target.expr);
      if (symbolicTarget) {
        ctx.warnIfRawCallTargetsTypedCallable(asmItem.span, symbolicTarget);
        ctx.emitAbs16Fixup(opcode, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span);
        ctx.syncToFlow();
        return true;
      }
    }
  }

  return undefined;
}
