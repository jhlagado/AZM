import type { AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import type { LoweringContext } from './programLowering.js';
import {
  activeClassicAddress,
  containsCurrentLocation,
  evalClassicImmAtCurrent,
} from './classicTraversalHelpers.js';

export type ClassicInstructionNode = {
  kind: string;
  span: SourceSpan;
  head?: string;
  operands?: AsmOperandNode[];
};

function jpConditionOpcodeFromName(nameRaw: string): number | undefined {
  switch (nameRaw.toUpperCase()) {
    case 'NZ':
      return 0xc2;
    case 'Z':
      return 0xca;
    case 'NC':
      return 0xd2;
    case 'C':
      return 0xda;
    case 'PO':
      return 0xe2;
    case 'PE':
      return 0xea;
    case 'P':
      return 0xf2;
    case 'M':
      return 0xfa;
    default:
      return undefined;
  }
}

function ldReg16ImmediateOpcode(nameRaw: string): number | undefined {
  switch (nameRaw.toUpperCase()) {
    case 'BC':
      return 0x01;
    case 'DE':
      return 0x11;
    case 'HL':
      return 0x21;
    case 'SP':
      return 0x31;
    default:
      return undefined;
  }
}

function ldReg16MemOpcode(nameRaw: string): { prefix?: number; opcode: number } | undefined {
  switch (nameRaw.toUpperCase()) {
    case 'BC':
      return { prefix: 0xed, opcode: 0x4b };
    case 'DE':
      return { prefix: 0xed, opcode: 0x5b };
    case 'HL':
      return { opcode: 0x2a };
    case 'SP':
      return { prefix: 0xed, opcode: 0x7b };
    default:
      return undefined;
  }
}

function ldMemReg16Opcode(nameRaw: string): { prefix?: number; opcode: number } | undefined {
  switch (nameRaw.toUpperCase()) {
    case 'BC':
      return { prefix: 0xed, opcode: 0x43 };
    case 'DE':
      return { prefix: 0xed, opcode: 0x53 };
    case 'HL':
      return { opcode: 0x22 };
    case 'SP':
      return { prefix: 0xed, opcode: 0x73 };
    case 'IX':
      return { prefix: 0xdd, opcode: 0x22 };
    case 'IY':
      return { prefix: 0xfd, opcode: 0x22 };
    default:
      return undefined;
  }
}

function memSymbolicTarget(
  ctx: LoweringContext,
  op: AsmOperandNode | undefined,
): { baseLower: string; addend: number } | undefined {
  if (!op || op.kind !== 'Mem') return undefined;
  if (op.expr.kind === 'EaName') {
    if (['A', 'B', 'C', 'D', 'E', 'H', 'L', 'BC', 'DE', 'HL', 'SP', 'IX', 'IY'].includes(op.expr.name.toUpperCase())) {
      return undefined;
    }
    return { baseLower: op.expr.name.toLowerCase(), addend: 0 };
  }
  if (op.expr.kind === 'EaImm') return ctx.symbolicTargetFromExpr(op.expr.expr);
  if (
    (op.expr.kind === 'EaAdd' || op.expr.kind === 'EaSub') &&
    op.expr.base.kind === 'EaName'
  ) {
    if (op.expr.base.name.toUpperCase() === 'IX' || op.expr.base.name.toUpperCase() === 'IY') {
      return undefined;
    }
    return ctx.symbolicTargetFromExpr({
      kind: 'ImmBinary',
      span: op.span,
      op: op.expr.kind === 'EaAdd' ? '+' : '-',
      left: { kind: 'ImmName', span: op.expr.base.span, name: op.expr.base.name },
      right: op.expr.offset,
    });
  }
  return undefined;
}

function immExprFromOperand(op: AsmOperandNode | undefined): ImmExprNode | undefined {
  if (!op) return undefined;
  if (op.kind === 'Imm') return op.expr;
  if (op.kind === 'Ea' && op.expr.kind === 'EaName') {
    return { kind: 'ImmName', span: op.span, name: op.expr.name };
  }
  if (op.kind === 'Ea' && op.expr.kind === 'EaImm') return op.expr.expr;
  if (
    op.kind === 'Ea' &&
    (op.expr.kind === 'EaAdd' || op.expr.kind === 'EaSub') &&
    op.expr.base.kind === 'EaName'
  ) {
    return {
      kind: 'ImmBinary',
      span: op.span,
      op: op.expr.kind === 'EaAdd' ? '+' : '-',
      left: { kind: 'ImmName', span: op.expr.base.span, name: op.expr.base.name },
      right: op.expr.offset,
    };
  }
  return undefined;
}

function evalMemAddress(
  ctx: LoweringContext,
  op: AsmOperandNode | undefined,
): number | undefined {
  if (!op || op.kind !== 'Mem') return undefined;
  if (op.expr.kind === 'EaName') {
    if (['BC', 'DE', 'HL', 'SP', 'IX', 'IY'].includes(op.expr.name.toUpperCase())) return undefined;
    return ctx.evalImmExpr(
      { kind: 'ImmName', span: op.span, name: op.expr.name },
      ctx.env,
      ctx.diagnostics,
    );
  }
  if (op.expr.kind === 'EaImm') return ctx.evalImmExpr(op.expr.expr, ctx.env, ctx.diagnostics);
  return undefined;
}

export function lowerClassicInstruction(ctx: LoweringContext, item: ClassicInstructionNode): void {
  if (!item.head || !item.operands) return;
  const head = item.head.toLowerCase();
  const first = item.operands[0];
  const emitRelativeCurrentTarget = (
    opcode: number,
    targetExpr: ImmExprNode,
  ): boolean => {
    if (!containsCurrentLocation(targetExpr)) return false;
    const current = activeClassicAddress(ctx);
    if (current === undefined) {
      ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate current location.`);
      return true;
    }
    const target = evalClassicImmAtCurrent(ctx, targetExpr, current);
    if (target === undefined) {
      ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate ${head} target.`);
      return true;
    }
    const displacement = target - (current + 2);
    if (displacement < -128 || displacement > 127) {
      ctx.diag(
        ctx.diagnostics,
        item.span.file,
        `${head} relative branch displacement out of range (-128..127): ${displacement}.`,
      );
      return true;
    }
    ctx.emitRawCodeBytes(Uint8Array.of(opcode, displacement & 0xff), item.span.file, `${head} ${displacement}`);
    return true;
  };
  const emitRelativeAbsoluteTarget = (
    opcode: number,
    targetExpr: ImmExprNode,
  ): boolean => {
    const current = activeClassicAddress(ctx);
    if (current === undefined) {
      ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate current location.`);
      return true;
    }
    const target = evalClassicImmAtCurrent(ctx, targetExpr, current);
    if (target === undefined) {
      ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate ${head} target.`);
      return true;
    }
    const displacement = target - (current + 2);
    if (displacement < -128 || displacement > 127) {
      ctx.diag(
        ctx.diagnostics,
        item.span.file,
        `${head} relative branch displacement out of range (-128..127): ${displacement}.`,
      );
      return true;
    }
    ctx.emitRawCodeBytes(Uint8Array.of(opcode, displacement & 0xff), item.span.file, `${head} ${displacement}`);
    return true;
  };

  if (head === 'djnz' && item.operands.length === 1 && first?.kind === 'Imm') {
    if (emitRelativeCurrentTarget(0x10, first.expr)) return;
    const symbolic = ctx.symbolicTargetFromExpr(first.expr);
    if (symbolic) {
      ctx.emitRel8Fixup(0x10, symbolic.baseLower, symbolic.addend, item.span, 'djnz');
      return;
    }
    if (emitRelativeAbsoluteTarget(0x10, first.expr)) return;
  }
  if (head === 'jr' && item.operands.length === 1 && first?.kind === 'Imm') {
    if (emitRelativeCurrentTarget(0x18, first.expr)) return;
    const symbolic = ctx.symbolicTargetFromExpr(first.expr);
    if (symbolic) {
      ctx.emitRel8Fixup(0x18, symbolic.baseLower, symbolic.addend, item.span, 'jr');
      return;
    }
    if (emitRelativeAbsoluteTarget(0x18, first.expr)) return;
  }
  if (head === 'jr' && item.operands.length === 2) {
    const cc =
      first?.kind === 'Imm' && first.expr.kind === 'ImmName'
        ? first.expr.name
        : first?.kind === 'Reg'
          ? first.name
          : undefined;
    const opcode = cc ? ctx.jrConditionOpcodeFromName(cc) : undefined;
    const target = item.operands[1];
    if (opcode !== undefined && target?.kind === 'Imm') {
      if (emitRelativeCurrentTarget(opcode, target.expr)) return;
      const symbolic = ctx.symbolicTargetFromExpr(target.expr);
      if (symbolic) {
        ctx.emitRel8Fixup(opcode, symbolic.baseLower, symbolic.addend, item.span, `jr ${cc}`);
        return;
      }
      if (emitRelativeAbsoluteTarget(opcode, target.expr)) return;
    }
  }
  if (head === 'call') {
    if (item.operands.length === 1 && first?.kind === 'Imm') {
      if (containsCurrentLocation(first.expr)) {
        const current = activeClassicAddress(ctx);
        const target = current === undefined ? undefined : evalClassicImmAtCurrent(ctx, first.expr, current);
        if (target !== undefined) {
          ctx.emitRawCodeBytes(
            Uint8Array.of(0xcd, target & 0xff, (target >> 8) & 0xff),
            item.span.file,
            `call ${target}`,
          );
          return;
        }
      }
      const value = ctx.evalImmExpr(first.expr, ctx.env, ctx.diagnostics);
      if (value !== undefined) {
        ctx.emitRawCodeBytes(
          Uint8Array.of(0xcd, value & 0xff, (value >> 8) & 0xff),
          item.span.file,
          `call ${value}`,
        );
        return;
      }
      const symbolic = ctx.symbolicTargetFromExpr(first.expr);
      if (symbolic) {
        ctx.emitAbs16Fixup(0xcd, symbolic.baseLower, symbolic.addend, item.span);
        return;
      }
    }
    if (item.operands.length === 2) {
      const cc =
        first?.kind === 'Imm' && first.expr.kind === 'ImmName'
          ? first.expr.name
          : first?.kind === 'Reg'
            ? first.name
            : undefined;
      const opcode = cc ? ctx.callConditionOpcodeFromName(cc) : undefined;
      const target = item.operands[1];
      if (opcode !== undefined && target?.kind === 'Imm') {
        const value = ctx.evalImmExpr(target.expr, ctx.env, ctx.diagnostics);
        if (value !== undefined) {
          ctx.emitRawCodeBytes(
            Uint8Array.of(opcode, value & 0xff, (value >> 8) & 0xff),
            item.span.file,
            `call ${cc},${value}`,
          );
          return;
        }
        const symbolic = ctx.symbolicTargetFromExpr(target.expr);
        if (symbolic) {
          ctx.emitAbs16Fixup(opcode, symbolic.baseLower, symbolic.addend, item.span);
          return;
        }
      }
    }
  }
  if (head === 'jp' && item.operands.length === 1 && first?.kind === 'Imm') {
    if (containsCurrentLocation(first.expr)) {
      const current = activeClassicAddress(ctx);
      const target = current === undefined ? undefined : evalClassicImmAtCurrent(ctx, first.expr, current);
      if (target !== undefined) {
        ctx.emitRawCodeBytes(
          Uint8Array.of(0xc3, target & 0xff, (target >> 8) & 0xff),
          item.span.file,
          `jp ${target}`,
        );
        return;
      }
    }
    const value = ctx.evalImmExpr(first.expr, ctx.env, ctx.diagnostics);
    if (value !== undefined) {
      ctx.emitRawCodeBytes(
        Uint8Array.of(0xc3, value & 0xff, (value >> 8) & 0xff),
        item.span.file,
        `jp ${value}`,
      );
      return;
    }
    const symbolic = ctx.symbolicTargetFromExpr(first.expr);
    if (symbolic) {
      ctx.emitAbs16Fixup(0xc3, symbolic.baseLower, symbolic.addend, item.span);
      return;
    }
  }
  if (head === 'jp' && item.operands.length === 2) {
    const cc =
      first?.kind === 'Imm' && first.expr.kind === 'ImmName'
        ? first.expr.name
        : first?.kind === 'Reg'
          ? first.name
          : undefined;
    const opcode = cc ? jpConditionOpcodeFromName(cc) : undefined;
    const target = item.operands[1];
    if (opcode !== undefined && target?.kind === 'Imm') {
      const evaluated = ctx.evalImmExpr(target.expr, ctx.env, ctx.diagnostics);
      if (evaluated !== undefined) {
        ctx.emitRawCodeBytes(
          Uint8Array.of(opcode, evaluated & 0xff, (evaluated >> 8) & 0xff),
          item.span.file,
          `jp ${cc},${evaluated}`,
        );
        return;
      }
      if (containsCurrentLocation(target.expr)) {
        const current = activeClassicAddress(ctx);
        const value = current === undefined ? undefined : evalClassicImmAtCurrent(ctx, target.expr, current);
        if (value !== undefined) {
          ctx.emitRawCodeBytes(
            Uint8Array.of(opcode, value & 0xff, (value >> 8) & 0xff),
            item.span.file,
            `jp ${cc},${value}`,
          );
          return;
        }
      }
      const symbolic = ctx.symbolicTargetFromExpr(target.expr);
      if (symbolic) {
        ctx.emitAbs16Fixup(opcode, symbolic.baseLower, symbolic.addend, item.span);
        return;
      }
    }
  }
  if (head === 'ld' && item.operands.length === 2 && first?.kind === 'Reg') {
    const opcode = ldReg16ImmediateOpcode(first.name);
    const source = item.operands[1];
    const sourceExpr = immExprFromOperand(source);
    if (opcode !== undefined && sourceExpr) {
      const value = ctx.evalImmExpr(sourceExpr, ctx.env, ctx.diagnostics);
      if (value !== undefined) {
        ctx.emitRawCodeBytes(
          Uint8Array.of(opcode, value & 0xff, (value >> 8) & 0xff),
          item.span.file,
          `ld ${first.name},${value}`,
        );
        return;
      }
      const symbolic = ctx.symbolicTargetFromExpr(sourceExpr);
      if (symbolic) {
        ctx.emitAbs16Fixup(opcode, symbolic.baseLower, symbolic.addend, item.span);
        return;
      }
    }
    if ((first.name.toUpperCase() === 'IX' || first.name.toUpperCase() === 'IY') && sourceExpr) {
      const value = ctx.evalImmExpr(sourceExpr, ctx.env, ctx.diagnostics);
      if (value !== undefined) {
        const prefix = first.name.toUpperCase() === 'IX' ? 0xdd : 0xfd;
        ctx.emitRawCodeBytes(
          Uint8Array.of(prefix, 0x21, value & 0xff, (value >> 8) & 0xff),
          item.span.file,
          `ld ${first.name},${value}`,
        );
        return;
      }
      const symbolic = ctx.symbolicTargetFromExpr(sourceExpr);
      if (symbolic) {
        ctx.emitAbs16FixupPrefixed(
          first.name.toUpperCase() === 'IX' ? 0xdd : 0xfd,
          0x21,
          symbolic.baseLower,
          symbolic.addend,
          item.span,
        );
        return;
      }
    }
    const memOpcode = ldReg16MemOpcode(first.name);
    const memSymbolic = memSymbolicTarget(ctx, source);
    if (memOpcode && memSymbolic) {
      if (memOpcode.prefix !== undefined) {
        ctx.emitAbs16FixupPrefixed(
          memOpcode.prefix,
          memOpcode.opcode,
          memSymbolic.baseLower,
          memSymbolic.addend,
          item.span,
        );
      } else {
        ctx.emitAbs16Fixup(memOpcode.opcode, memSymbolic.baseLower, memSymbolic.addend, item.span);
      }
      return;
    }
    const memValue = evalMemAddress(ctx, source);
    if (memOpcode && memValue !== undefined) {
      const bytes =
        memOpcode.prefix !== undefined
          ? Uint8Array.of(memOpcode.prefix, memOpcode.opcode, memValue & 0xff, (memValue >> 8) & 0xff)
          : Uint8Array.of(memOpcode.opcode, memValue & 0xff, (memValue >> 8) & 0xff);
      ctx.emitRawCodeBytes(bytes, item.span.file, `ld ${first.name},(${memValue})`);
      return;
    }
  }
  if (head === 'ld' && item.operands.length === 2) {
    const second = item.operands[1];
    if (first?.kind === 'Reg' && first.name.toUpperCase() === 'A' && second?.kind === 'Mem') {
      const symbolic = memSymbolicTarget(ctx, second);
      if (symbolic) {
        ctx.emitAbs16Fixup(0x3a, symbolic.baseLower, symbolic.addend, item.span);
        return;
      }
      const value = evalMemAddress(ctx, second);
      if (value !== undefined) {
        ctx.emitRawCodeBytes(Uint8Array.of(0x3a, value & 0xff, (value >> 8) & 0xff), item.span.file, 'ld a,(nn)');
        return;
      }
    }
    if (first?.kind === 'Mem' && second?.kind === 'Reg' && second.name.toUpperCase() === 'A') {
      const symbolic = memSymbolicTarget(ctx, first);
      if (symbolic) {
        ctx.emitAbs16Fixup(0x32, symbolic.baseLower, symbolic.addend, item.span);
        return;
      }
      const value = evalMemAddress(ctx, first);
      if (value !== undefined) {
        ctx.emitRawCodeBytes(Uint8Array.of(0x32, value & 0xff, (value >> 8) & 0xff), item.span.file, 'ld (nn),a');
        return;
      }
    }
    if (first?.kind === 'Mem' && second?.kind === 'Reg') {
      const memOpcode = ldMemReg16Opcode(second.name);
      const symbolic = memSymbolicTarget(ctx, first);
      if (memOpcode && symbolic) {
        if (memOpcode.prefix !== undefined) {
          ctx.emitAbs16FixupPrefixed(
            memOpcode.prefix,
            memOpcode.opcode,
            symbolic.baseLower,
            symbolic.addend,
            item.span,
          );
        } else {
          ctx.emitAbs16Fixup(memOpcode.opcode, symbolic.baseLower, symbolic.addend, item.span);
        }
        return;
      }
      const value = evalMemAddress(ctx, first);
      if (memOpcode && value !== undefined) {
        const bytes =
          memOpcode.prefix !== undefined
            ? Uint8Array.of(memOpcode.prefix, memOpcode.opcode, value & 0xff, (value >> 8) & 0xff)
            : Uint8Array.of(memOpcode.opcode, value & 0xff, (value >> 8) & 0xff);
        ctx.emitRawCodeBytes(bytes, item.span.file, `ld (nn),${second.name}`);
        return;
      }
    }
  }
  ctx.emitInstr(item.head, item.operands, item.span);
}
