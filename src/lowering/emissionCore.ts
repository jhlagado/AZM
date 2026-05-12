import type { AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import { renderStepInstr, type StepInstr, type StepPipeline } from './steps.js';

type EmissionCoreContext = {
  /** Current code emission offset. */
  getCodeOffset: () => number;
  /** Sets absolute code offset cursor. */
  setCodeOffset: (value: number) => void;
  /** Writes one byte into the code map. */
  setCodeByte: (offset: number, value: number) => void;
  /** Extends source range map for listings. */
  recordCodeSourceRange: (start: number, end: number) => void;
  /** Optional trace hook for emitted bytes. */
  traceInstruction: (start: number, bytes: Uint8Array, traceText: string) => void;
  /** Encodes one asm instruction. */
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  /** Loads imm16 to DE. */
  loadImm16ToDE: (value: number, span: SourceSpan) => boolean;
  /** Loads imm16 to HL. */
  loadImm16ToHL: (value: number, span: SourceSpan) => boolean;
  /** Queues standard abs16 fixup. */
  emitAbs16Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  /** Queues ED-prefixed abs16 fixup. */
  emitAbs16FixupEd: (
    opcode2: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
};

export function createEmissionCoreHelpers(ctx: EmissionCoreContext) {
  const emitCodeBytes = (bs: Uint8Array, _file: string): number => {
    const start = ctx.getCodeOffset();
    let codeOffset = start;
    for (const b of bs) {
      ctx.setCodeByte(codeOffset, b);
      codeOffset++;
    }
    ctx.setCodeOffset(codeOffset);
    ctx.recordCodeSourceRange(start, codeOffset);
    return start;
  };

  const emitRawCodeBytes = (bs: Uint8Array, _file: string, traceText: string): void => {
    const start = emitCodeBytes(bs, _file);
    ctx.traceInstruction(start, bs, traceText);
  };

  const emitStepPipeline = (pipe: StepPipeline, span: SourceSpan): boolean => {
    const rpByte = (rp: string, which: 'lo' | 'hi'): string | undefined => {
      const up = rp.toUpperCase();
      if (up === 'HL') return which === 'lo' ? 'L' : 'H';
      if (up === 'DE') return which === 'lo' ? 'E' : 'D';
      if (up === 'BC') return which === 'lo' ? 'C' : 'B';
      return undefined;
    };

    const mkReg = (name: string): AsmOperandNode => ({ kind: 'Reg', span, name });
    const mkStepReg = (name: string): AsmOperandNode => mkReg(name.toUpperCase());
    const mkMemHl = (): AsmOperandNode => ({
      kind: 'Mem',
      span,
      expr: { kind: 'EaName', span, name: 'HL' },
    });
    const mkMemIxDisp = (disp: number): AsmOperandNode => {
      if (disp === 0) {
        return { kind: 'Mem', span, expr: { kind: 'EaName', span, name: 'IX' } };
      }
      const offsetImm: ImmExprNode = {
        kind: 'ImmLiteral',
        span,
        value: Math.abs(disp),
      };
      return {
        kind: 'Mem',
        span,
        expr:
          disp >= 0
            ? { kind: 'EaAdd', span, base: { kind: 'EaName', span, name: 'IX' }, offset: offsetImm }
            : {
                kind: 'EaSub',
                span,
                base: { kind: 'EaName', span, name: 'IX' },
                offset: offsetImm,
              },
      };
    };

    const emitStepInstr = (step: StepInstr): boolean => {
      switch (step.kind) {
        case 'push':
          return ctx.emitInstr('push', [mkReg(step.reg)], span);
        case 'pop':
          return ctx.emitInstr('pop', [mkReg(step.reg)], span);
        case 'exDeHl':
          return ctx.emitInstr('ex', [mkReg('DE'), mkReg('HL')], span);
        case 'exSpHl':
          return ctx.emitInstr(
            'ex',
            [{ kind: 'Mem', span, expr: { kind: 'EaName', span, name: 'SP' } }, mkReg('HL')],
            span,
          );
        case 'addHlDe':
          return ctx.emitInstr('add', [mkReg('HL'), mkReg('DE')], span);
        case 'addHlHl':
          return ctx.emitInstr('add', [mkReg('HL'), mkReg('HL')], span);
        case 'incHl':
          return ctx.emitInstr('inc', [mkReg('HL')], span);
        case 'ldHZero':
          return ctx.emitInstr(
            'ld',
            [mkReg('H'), { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } }],
            span,
          );
        case 'ldRegReg':
          return ctx.emitInstr('ld', [mkStepReg(step.dst), mkStepReg(step.src)], span);
        case 'ldRegMemHl':
          return ctx.emitInstr('ld', [mkStepReg(step.reg), mkMemHl()], span);
        case 'ldMemHlReg':
          return ctx.emitInstr('ld', [mkMemHl(), mkStepReg(step.reg)], span);
        case 'ldRegIxDisp':
          return ctx.emitInstr('ld', [mkStepReg(step.reg), mkMemIxDisp(step.disp)], span);
        case 'ldIxDispReg':
          return ctx.emitInstr('ld', [mkMemIxDisp(step.disp), mkStepReg(step.reg)], span);
        case 'ldRpByteFromIx': {
          const regName = rpByte(step.rp, step.part);
          if (!regName) return false;
          return ctx.emitInstr('ld', [mkReg(regName), mkMemIxDisp(step.disp)], span);
        }
        case 'ldIxDispFromRpByte': {
          const regName = rpByte(step.rp, step.part);
          if (!regName) return false;
          return ctx.emitInstr('ld', [mkMemIxDisp(step.disp), mkReg(regName)], span);
        }
        case 'ldRpImm':
          return step.rp === 'DE'
            ? ctx.loadImm16ToDE(step.value, span)
            : ctx.loadImm16ToHL(step.value, span);
        case 'ldRpGlob':
          ctx.emitAbs16Fixup(
            step.rp === 'DE' ? 0x11 : 0x21,
            step.glob.toLowerCase(),
            0,
            span,
            renderStepInstr(step),
          );
          return true;
        case 'ldHlPtrGlob':
          ctx.emitAbs16Fixup(0x2a, step.glob.toLowerCase(), 0, span, renderStepInstr(step));
          return true;
        case 'ldRpPtrGlob':
          ctx.emitAbs16FixupEd(
            step.rp === 'BC' ? 0x4b : 0x5b,
            step.glob.toLowerCase(),
            0,
            span,
            renderStepInstr(step),
          );
          return true;
        case 'ldPtrGlobRp':
          if (step.rp === 'HL') {
            ctx.emitAbs16Fixup(0x22, step.glob.toLowerCase(), 0, span, renderStepInstr(step));
          } else {
            ctx.emitAbs16FixupEd(
              step.rp === 'BC' ? 0x43 : 0x53,
              step.glob.toLowerCase(),
              0,
              span,
              renderStepInstr(step),
            );
          }
          return true;
        case 'ldHlRp':
          if (step.rp === 'HL') return true;
          if (step.rp === 'DE') {
            return (
              ctx.emitInstr('ld', [mkReg('H'), mkReg('D')], span) &&
              ctx.emitInstr('ld', [mkReg('L'), mkReg('E')], span)
            );
          }
          return (
            ctx.emitInstr('ld', [mkReg('H'), mkReg('B')], span) &&
            ctx.emitInstr('ld', [mkReg('L'), mkReg('C')], span)
          );
        case 'ldRegGlob':
          return ctx.emitInstr(
            'ld',
            [
              mkStepReg(step.reg),
              { kind: 'Mem', span, expr: { kind: 'EaName', span, name: step.glob } },
            ],
            span,
          );
        case 'ldGlobReg':
          return ctx.emitInstr(
            'ld',
            [
              { kind: 'Mem', span, expr: { kind: 'EaName', span, name: step.glob } },
              mkStepReg(step.reg),
            ],
            span,
          );
        case 'ldRpByteFromReg': {
          const regName = rpByte(step.rp, step.part);
          if (!regName) return false;
          return ctx.emitInstr('ld', [mkReg(regName), mkStepReg(step.reg)], span);
        }
        case 'ldRegFromRpByte': {
          const src = rpByte(step.rp, step.part);
          if (!src) return false;
          return ctx.emitInstr('ld', [mkStepReg(step.reg), mkReg(src)], span);
        }
      }
      return false;
    };

    for (const step of pipe) {
      if (!emitStepInstr(step)) return false;
    }
    return true;
  };

  return {
    emitCodeBytes,
    emitRawCodeBytes,
    emitStepPipeline,
  };
}
