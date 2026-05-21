import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';

type DiagAt = (diagnostics: Diagnostic[], span: AsmInstructionNode['span'], message: string) => void;
type DiagAtWithId = (
  diagnostics: Diagnostic[],
  span: AsmInstructionNode['span'],
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds],
  message: string,
) => void;

export type BranchCallLoweringContext = {
  diagnostics: Diagnostic[];
  diagAt: DiagAt;
  diagAtWithId: DiagAtWithId;
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
  }) => void;
  syncToFlow: () => void;
  flowRef: { current: { reachable: boolean } };
};

function diagEncode(ctx: BranchCallLoweringContext, asmItem: AsmInstructionNode, message: string): void {
  ctx.diagAtWithId(ctx.diagnostics, asmItem.span, DiagnosticIds.EncodeError, message);
}

const emitRel8FromOperand = (
  ctx: BranchCallLoweringContext,
  asmItem: AsmInstructionNode,
  operand: AsmOperandNode,
  opcode: number,
  mnemonic: string,
): boolean => {
  if (operand.kind !== 'Imm') {
    if (mnemonic === 'djnz' || mnemonic.startsWith('jr')) {
      diagEncode(ctx, asmItem, `${mnemonic} expects disp8`);
    } else {
      diagEncode(ctx, asmItem, `${mnemonic} expects an immediate target.`);
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
    diagEncode(ctx, asmItem, `Failed to evaluate ${mnemonic} target.`);
    return false;
  }
  if (value < -128 || value > 127) {
    diagEncode(
      ctx,
      asmItem,
      `${mnemonic} relative branch displacement out of range (-128..127): ${value}.`,
    );
    return false;
  }
  ctx.emitRawCodeBytes(Uint8Array.of(opcode, value & 0xff), asmItem.span.file, `${mnemonic} ${value}`);
  return true;
};

function conditionNameFromOperand(op: AsmOperandNode): string | undefined {
  if (op.kind === 'Imm' && op.expr.kind === 'ImmName') return op.expr.name;
  if (op.kind === 'Reg') return op.name;
  return undefined;
}

function emitAbs16FixupFromOperand(
  ctx: BranchCallLoweringContext,
  asmItem: AsmInstructionNode,
  operand: AsmOperandNode,
  opcode: number,
): boolean {
  if (operand.kind !== 'Imm') return false;
  const symbolicTarget = ctx.symbolicTargetFromExpr(operand.expr);
  if (!symbolicTarget) return false;
  ctx.emitAbs16Fixup(opcode, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span);
  ctx.syncToFlow();
  return true;
}

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
        diagEncode(ctx, asmItem, `jr does not support indirect targets; expects disp8`);
        return true;
      }
      const single = asmItem.operands[0]!;
      const ccSingle = conditionNameFromOperand(single);
      if (ccSingle && ctx.jrConditionOpcodeFromName(ccSingle) !== undefined) {
        diagEncode(ctx, asmItem, `jr cc, disp expects two operands (cc, disp8)`);
        return true;
      }
      if (single.kind === 'Imm') {
        const symbolicTarget = ctx.symbolicTargetFromExpr(single.expr);
        if (symbolicTarget && ctx.jrConditionOpcodeFromName(symbolicTarget.baseLower) !== undefined) {
          diagEncode(ctx, asmItem, `jr cc, disp expects two operands (cc, disp8)`);
          return true;
        }
      }
      if (single.kind === 'Reg') {
        diagEncode(ctx, asmItem, `jr does not support register targets; expects disp8`);
        return true;
      }
      if (!emitRel8FromOperand(ctx, asmItem, single, 0x18, 'jr')) return false;
      ctx.flowRef.current.reachable = false;
      ctx.syncToFlow();
      return true;
    }
    if (asmItem.operands.length === 2) {
      const ccOp = asmItem.operands[0]!;
      const ccName = conditionNameFromOperand(ccOp);
      const opcode = ccName ? ctx.jrConditionOpcodeFromName(ccName) : undefined;
      if (opcode === undefined) {
        diagEncode(ctx, asmItem, `jr cc expects valid condition code NZ/Z/NC/C`);
        return true;
      }
      const target = asmItem.operands[1]!;
      if (target.kind === 'Mem') {
        diagEncode(ctx, asmItem, `jr cc, disp does not support indirect targets`);
        return true;
      }
      if (target.kind === 'Reg') {
        diagEncode(ctx, asmItem, `jr cc, disp does not support register targets; expects disp8`);
        return true;
      }
      if (target.kind !== 'Imm') {
        diagEncode(ctx, asmItem, `jr cc, disp expects disp8`);
        return true;
      }
      if (!emitRel8FromOperand(ctx, asmItem, target, opcode, `jr ${ccName!.toLowerCase()}`)) return false;
      ctx.syncToFlow();
      return true;
    }
  }

  if (head === 'djnz') {
    if (asmItem.operands.length !== 1) {
      diagEncode(ctx, asmItem, `djnz expects one operand (disp8)`);
      return true;
    }
    const target = asmItem.operands[0]!;
    if (target.kind === 'Mem') {
      diagEncode(ctx, asmItem, `djnz does not support indirect targets; expects disp8`);
      return true;
    }
    if (target.kind === 'Reg') {
      diagEncode(ctx, asmItem, `djnz does not support register targets; expects disp8`);
      return true;
    }
    if (target.kind !== 'Imm') {
      diagEncode(ctx, asmItem, `djnz expects disp8`);
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
      ctx.emitInstr('ret', [], asmItem.span);
      ctx.flowRef.current.reachable = false;
      ctx.syncToFlow();
      return true;
    }
    if (asmItem.operands.length === 1) {
      const op = ctx.conditionOpcode(asmItem.operands[0]!);
      if (op === undefined) {
        diagEncode(ctx, asmItem, `ret cc expects a valid condition code`);
        return true;
      }
      ctx.diagIfRetStackImbalanced(asmItem.span);
      ctx.emitInstr('ret', [asmItem.operands[0]!], asmItem.span);
      ctx.syncToFlow();
      return true;
    }
  }

  if ((head === 'retn' || head === 'reti') && asmItem.operands.length === 0) {
    ctx.diagIfRetStackImbalanced(asmItem.span, head);
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
        diagEncode(ctx, asmItem, `jp cc, nn expects two operands (cc, nn)`);
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
    const ccName = conditionNameFromOperand(ccOp);
    const opcode = ccName ? ctx.conditionOpcodeFromName(ccName) : undefined;
    const target = asmItem.operands[1]!;
    if (opcode !== undefined && emitAbs16FixupFromOperand(ctx, asmItem, target, opcode)) {
      return true;
    }
  }

  if (head === 'call' && asmItem.operands.length === 1) {
    const target = asmItem.operands[0]!;
    if (target.kind === 'Imm') {
      const symbolicTarget = ctx.symbolicTargetFromExpr(target.expr);
      if (symbolicTarget && ctx.callConditionOpcodeFromName(symbolicTarget.baseLower) !== undefined) {
        diagEncode(ctx, asmItem, `call cc, nn expects two operands (cc, nn)`);
        return true;
      }
      if (symbolicTarget) {
        ctx.emitAbs16Fixup(0xcd, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span);
        ctx.syncToFlow();
        return true;
      }
    }
  }

  if (head === 'call' && asmItem.operands.length === 2) {
    const ccOp = asmItem.operands[0]!;
    const ccName = conditionNameFromOperand(ccOp);
    const opcode = ccName ? ctx.callConditionOpcodeFromName(ccName) : undefined;
    const target = asmItem.operands[1]!;
    if (opcode !== undefined && emitAbs16FixupFromOperand(ctx, asmItem, target, opcode)) {
      return true;
    }
  }

  return undefined;
}
