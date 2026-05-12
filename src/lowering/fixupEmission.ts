import type { AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import {
  formatAbs16FixupAsm,
  formatAbs16FixupEdAsm,
  formatAbs16FixupPrefixedAsm,
} from './traceFormat.js';

type FixupRecord = {
  /** Patch offset in code. */
  offset: number;
  /** Target symbol (lowercased). */
  baseLower: string;
  /** Byte addend. */
  addend: number;
  /** Owning file. */
  file: string;
};

type Rel8FixupRecord = {
  /** Patch offset. */
  offset: number;
  /** Branch origin. */
  origin: number;
  /** Target symbol. */
  baseLower: string;
  /** Addend. */
  addend: number;
  /** Owning file. */
  file: string;
  /** Mnemonic for diagnostics. */
  mnemonic: string;
};

type EvalImmExpr = (expr: ImmExprNode) => number | undefined;

type TraceInstruction = (start: number, bytes: Uint8Array, asmText: string) => void;

type FixupEmissionContext = {
  /** Current code offset. */
  getCodeOffset: () => number;
  /** Sets code offset. */
  setCodeOffset: (value: number) => void;
  /** Writes a code byte. */
  setCodeByte: (offset: number, value: number) => void;
  /** Records source range for listing. */
  recordCodeSourceRange: (start: number, end: number) => void;
  /** Enqueues abs16 fixup. */
  pushFixup: (fixup: FixupRecord) => void;
  /** Enqueues rel8 fixup. */
  pushRel8Fixup: (fixup: Rel8FixupRecord) => void;
  /** Trace hook for raw emission. */
  traceInstruction: TraceInstruction;
  /** Optional lowered-instr recorder for asm trace. */
  recordLoweredInstr?: (bytes: Uint8Array, asmText: string, span: SourceSpan) => void;
  /** Const imm evaluation. */
  evalImmExpr: EvalImmExpr;
};

export function createFixupEmissionHelpers(ctx: FixupEmissionContext) {
  const recordLoweredInstr = (bytes: Uint8Array, asmText: string, span: SourceSpan): void => {
    ctx.recordLoweredInstr?.(bytes, asmText, span);
  };

  const emitAbs16Fixup = (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ): void => {
    const start = ctx.getCodeOffset();
    ctx.setCodeByte(start, opcode);
    ctx.setCodeByte(start + 1, 0x00);
    ctx.setCodeByte(start + 2, 0x00);
    ctx.setCodeOffset(start + 3);
    ctx.recordCodeSourceRange(start, start + 3);
    ctx.pushFixup({ offset: start + 1, baseLower, addend, file: span.file });
    const bytes = Uint8Array.of(opcode, 0x00, 0x00);
    const text = asmText ?? formatAbs16FixupAsm(opcode, baseLower, addend);
    ctx.traceInstruction(start, bytes, text);
    recordLoweredInstr(bytes, text, span);
  };

  const emitAbs16FixupEd = (
    opcode2: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ): void => {
    const start = ctx.getCodeOffset();
    ctx.setCodeByte(start, 0xed);
    ctx.setCodeByte(start + 1, opcode2);
    ctx.setCodeByte(start + 2, 0x00);
    ctx.setCodeByte(start + 3, 0x00);
    ctx.setCodeOffset(start + 4);
    ctx.recordCodeSourceRange(start, start + 4);
    ctx.pushFixup({ offset: start + 2, baseLower, addend, file: span.file });
    const bytes = Uint8Array.of(0xed, opcode2, 0x00, 0x00);
    const text = asmText ?? formatAbs16FixupEdAsm(opcode2, baseLower, addend);
    ctx.traceInstruction(start, bytes, text);
    recordLoweredInstr(bytes, text, span);
  };

  const emitAbs16FixupPrefixed = (
    prefix: number,
    opcode2: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ): void => {
    const start = ctx.getCodeOffset();
    ctx.setCodeByte(start, prefix);
    ctx.setCodeByte(start + 1, opcode2);
    ctx.setCodeByte(start + 2, 0x00);
    ctx.setCodeByte(start + 3, 0x00);
    ctx.setCodeOffset(start + 4);
    ctx.recordCodeSourceRange(start, start + 4);
    ctx.pushFixup({ offset: start + 2, baseLower, addend, file: span.file });
    const bytes = Uint8Array.of(prefix, opcode2, 0x00, 0x00);
    const text = asmText ?? formatAbs16FixupPrefixedAsm(prefix, opcode2, baseLower, addend);
    ctx.traceInstruction(start, bytes, text);
    recordLoweredInstr(bytes, text, span);
  };

  const emitRel8Fixup = (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    mnemonic: string,
    asmText?: string,
  ): void => {
    const start = ctx.getCodeOffset();
    ctx.setCodeByte(start, opcode);
    ctx.setCodeByte(start + 1, 0x00);
    ctx.setCodeOffset(start + 2);
    ctx.recordCodeSourceRange(start, start + 2);
    ctx.pushRel8Fixup({
      offset: start + 1,
      origin: start + 2,
      baseLower,
      addend,
      file: span.file,
      mnemonic,
    });
    const bytes = Uint8Array.of(opcode, 0x00);
    const text = asmText ?? `${mnemonic} ${baseLower}`;
    ctx.traceInstruction(start, bytes, text);
    recordLoweredInstr(bytes, text, span);
  };

  const conditionOpcodeFromName = (nameRaw: string): number | undefined => {
    const asName = nameRaw.toUpperCase();
    switch (asName) {
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
  };

  const conditionNameFromOpcode = (opcode: number): string | undefined => {
    switch (opcode) {
      case 0xc2:
        return 'NZ';
      case 0xca:
        return 'Z';
      case 0xd2:
        return 'NC';
      case 0xda:
        return 'C';
      case 0xe2:
        return 'PO';
      case 0xea:
        return 'PE';
      case 0xf2:
        return 'P';
      case 0xfa:
        return 'M';
      default:
        return undefined;
    }
  };

  const callConditionOpcodeFromName = (nameRaw: string): number | undefined => {
    switch (nameRaw.toUpperCase()) {
      case 'NZ':
        return 0xc4;
      case 'Z':
        return 0xcc;
      case 'NC':
        return 0xd4;
      case 'C':
        return 0xdc;
      case 'PO':
        return 0xe4;
      case 'PE':
        return 0xec;
      case 'P':
        return 0xf4;
      case 'M':
        return 0xfc;
      default:
        return undefined;
    }
  };

  const symbolicTargetFromExpr = (
    expr: ImmExprNode,
  ): { baseLower: string; addend: number } | undefined => {
    if (expr.kind === 'ImmName') return { baseLower: expr.name.toLowerCase(), addend: 0 };
    if (expr.kind !== 'ImmBinary') return undefined;
    if (expr.op !== '+' && expr.op !== '-') return undefined;

    const leftName = expr.left.kind === 'ImmName' ? expr.left.name.toLowerCase() : undefined;
    const rightName = expr.right.kind === 'ImmName' ? expr.right.name.toLowerCase() : undefined;

    if (leftName) {
      const right = ctx.evalImmExpr(expr.right);
      if (right === undefined) return undefined;
      return { baseLower: leftName, addend: expr.op === '+' ? right : -right };
    }

    if (expr.op === '+' && rightName) {
      const left = ctx.evalImmExpr(expr.left);
      if (left === undefined) return undefined;
      return { baseLower: rightName, addend: left };
    }

    return undefined;
  };

  const jrConditionOpcodeFromName = (nameRaw: string): number | undefined => {
    switch (nameRaw.toUpperCase()) {
      case 'NZ':
        return 0x20;
      case 'Z':
        return 0x28;
      case 'NC':
        return 0x30;
      case 'C':
        return 0x38;
      default:
        return undefined;
    }
  };

  const conditionOpcode = (op: AsmOperandNode): number | undefined => {
    const asName =
      op.kind === 'Imm' && op.expr.kind === 'ImmName'
        ? op.expr.name
        : op.kind === 'Reg'
          ? op.name
          : undefined;
    return asName ? conditionOpcodeFromName(asName) : undefined;
  };

  const inverseConditionName = (nameRaw: string): string | undefined => {
    const name = nameRaw.toUpperCase();
    switch (name) {
      case 'NZ':
        return 'Z';
      case 'Z':
        return 'NZ';
      case 'NC':
        return 'C';
      case 'C':
        return 'NC';
      case 'PO':
        return 'PE';
      case 'PE':
        return 'PO';
      case 'P':
        return 'M';
      case 'M':
        return 'P';
      default:
        return undefined;
    }
  };

  return {
    callConditionOpcodeFromName,
    conditionNameFromOpcode,
    conditionOpcode,
    conditionOpcodeFromName,
    emitAbs16Fixup,
    emitAbs16FixupEd,
    emitAbs16FixupPrefixed,
    emitRel8Fixup,
    inverseConditionName,
    jrConditionOpcodeFromName,
    symbolicTargetFromExpr,
  };
}
