import type { StepPipeline, StepReg8 } from './steps.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode } from '../frontend/ast.js';
import type { ImmExprNode, SourceSpan, TypeExprNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { EaResolution } from './eaResolution.js';
import type { LdForm } from './ldFormSelection.js';
import {
  planAssignmentMemTransfer,
  type AssignmentMemTransferPlan,
} from './ldTransferPlan.js';
import { createLdEncodingRegMemHelpers } from './ldEncodingRegMemHelpers.js';
import type { ScalarKind } from './typeResolution.js';

export type LdEncodingContext = {
  LOAD_RP_FVAR: (rp: 'HL' | 'DE' | 'BC', ixDisp: number) => StepPipeline;
  LOAD_RP_GLOB: (rp: 'HL' | 'DE' | 'BC', baseLower: string) => StepPipeline;
  STORE_RP_FVAR: (rp: 'HL' | 'DE' | 'BC', ixDisp: number) => StepPipeline;
  STORE_RP_GLOB: (rp: 'HL' | 'DE' | 'BC', baseLower: string) => StepPipeline;
  TEMPLATE_L_ABC: (dest: StepReg8, ea: StepPipeline) => StepPipeline;
  TEMPLATE_L_DE: (dest: 'D' | 'E', ea: StepPipeline) => StepPipeline;
  TEMPLATE_L_HL: (dest: 'H' | 'L', ea: StepPipeline) => StepPipeline;
  TEMPLATE_LW_BC: (ea: StepPipeline) => StepPipeline;
  TEMPLATE_LW_DE: (ea: StepPipeline) => StepPipeline;
  TEMPLATE_LW_HL: (ea: StepPipeline) => StepPipeline;
  TEMPLATE_S_ANY: (src: StepReg8, ea: StepPipeline) => StepPipeline;
  TEMPLATE_S_HL: (src: 'H' | 'L', ea: StepPipeline) => StepPipeline;
  TEMPLATE_SW_DEBC: (src: 'DE' | 'BC', ea: StepPipeline) => StepPipeline;
  TEMPLATE_SW_HL: (ea: StepPipeline) => StepPipeline;
  buildEaBytePipeline: (ea: EaExprNode, span: SourceSpan) => StepPipeline | null;
  buildEaWordPipeline: (ea: EaExprNode, span: SourceSpan) => StepPipeline | null;
  canUseScalarWordAccessor: (resolved: EaResolution | undefined) => boolean;
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  diagnostics: Diagnostic[];
  emitAbs16Fixup: (
    opcode: number,
    target: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  emitAbs16FixupEd: (
    opcode: number,
    target: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  emitAbs16FixupPrefixed: (
    prefix: number,
    opcode: number,
    target: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  emitLoadWordFromHlAddress: (target: 'HL' | 'DE' | 'BC', span: SourceSpan) => boolean;
  emitRawCodeBytes: (bytes: Uint8Array, file: string, asmText: string) => void;
  emitScalarWordLoad: (
    target: 'HL' | 'DE' | 'BC',
    resolved: EaResolution | undefined,
    span: SourceSpan,
  ) => boolean;
  emitScalarWordStore: (
    source: 'HL' | 'DE' | 'BC',
    resolved: EaResolution | undefined,
    span: SourceSpan,
  ) => boolean;
  emitStepPipeline: (pipeline: StepPipeline, span: SourceSpan) => boolean;
  emitStoreSavedHlToEa: (ea: EaExprNode, span: SourceSpan) => boolean;
  emitStoreWordToHlAddress: (source: 'DE' | 'BC', span: SourceSpan) => boolean;
  env: CompileEnv;
  evalImmExpr: (expr: ImmExprNode) => number | undefined;
  formatIxDisp: (disp: number) => string;
  isWordCompatibleScalarKind: (
    scalar: ScalarKind | undefined,
  ) => scalar is 'word' | 'addr';
  loadImm16ToHL: (value: number, span: SourceSpan) => boolean;
  materializeEaAddressToHL: (ea: EaExprNode, span: SourceSpan) => boolean;
  reg8Code: ReadonlyMap<string, number>;
  resolveScalarKind: (typeExpr: TypeExprNode, seen?: Set<string>) => ScalarKind | undefined;
  setSpTrackingInvalid: () => void;
};

export function createLdEncodingHelpers(ctx: LdEncodingContext) {
  const { emitLdRegMemForm } = createLdEncodingRegMemHelpers(ctx);
  const {
    TEMPLATE_L_ABC,
    TEMPLATE_LW_DE,
    TEMPLATE_S_ANY,
    TEMPLATE_SW_DEBC,
    buildEaBytePipeline,
    buildEaWordPipeline,
    canUseScalarWordAccessor,
    diagAt,
    diagnostics,
    emitAbs16Fixup,
    emitInstr,
    emitLoadWordFromHlAddress,
    emitRawCodeBytes,
    emitScalarWordLoad,
    emitScalarWordStore,
    emitStepPipeline,
    emitStoreWordToHlAddress,
    evalImmExpr,
    isWordCompatibleScalarKind,
    loadImm16ToHL,
    materializeEaAddressToHL,
    resolveScalarKind,
  } = ctx;

  const emitLdForm = (form: LdForm): boolean => {
    const { inst, dst, src, dstResolved, srcResolved, dstScalarExact, srcScalarExact, scalarMemToMem } = form;
    const isAssignmentForm = inst.head.toLowerCase() === ':=';
    const regOperand = (name: string): AsmOperandNode => ({ kind: 'Reg', span: inst.span, name });
    const pushReg = (name: string): boolean => emitInstr('push', [regOperand(name)], inst.span);
    const popReg = (name: string): boolean => emitInstr('pop', [regOperand(name)], inst.span);
    const makeSubForm = (
      nextDst: AsmOperandNode,
      nextSrc: AsmOperandNode,
      overrides?: Partial<LdForm>,
    ): LdForm => ({
      ...form,
      dst: nextDst,
      src: nextSrc,
      dstResolved: nextDst.kind === 'Mem' ? dstResolved : undefined,
      srcResolved: nextSrc.kind === 'Mem' ? srcResolved : undefined,
      dstScalarExact: nextDst.kind === 'Mem' ? dstScalarExact : undefined,
      srcScalarExact: nextSrc.kind === 'Mem' ? srcScalarExact : undefined,
      scalarMemToMem: undefined,
      srcHasRegisterLikeEaBase: nextSrc.kind === 'Mem' ? form.srcHasRegisterLikeEaBase : false,
      dstHasRegisterLikeEaBase: nextDst.kind === 'Mem' ? form.dstHasRegisterLikeEaBase : false,
      srcIsIxIyDispMem: nextSrc.kind === 'Mem' ? form.srcIsIxIyDispMem : false,
      dstIsIxIyDispMem: nextDst.kind === 'Mem' ? form.dstIsIxIyDispMem : false,
      srcIsEaNameHL: nextSrc.kind === 'Mem' ? form.srcIsEaNameHL : false,
      dstIsEaNameHL: nextDst.kind === 'Mem' ? form.dstIsEaNameHL : false,
      srcIsEaNameBCorDE: nextSrc.kind === 'Mem' ? form.srcIsEaNameBCorDE : false,
      dstIsEaNameBCorDE: nextDst.kind === 'Mem' ? form.dstIsEaNameBCorDE : false,
      ...overrides,
    });
    const copyHlIntoPair = (pair: 'DE' | 'BC'): boolean => {
      if (pair === 'DE') {
        return emitInstr(
          'ex',
          [regOperand('DE'), regOperand('HL')],
          inst.span,
        );
      }
      return pushReg('HL') && popReg('BC');
    };

    const runAssignmentMemTransferPlan = (plan: AssignmentMemTransferPlan): boolean => {
      switch (plan.kind) {
        case 'addressOf': {
          const { hiddenPair, preserveHl } = plan;
          if (!pushReg(hiddenPair)) return false;
          if (preserveHl && !pushReg('HL')) return false;
          const addrSrc = form.src;
          if (addrSrc.kind !== 'Ea' || !addrSrc.explicitAddressOf) return false;
          if (!materializeEaAddressToHL(addrSrc.expr, inst.span)) return false;
          if (!copyHlIntoPair(hiddenPair)) return false;
          if (!emitLdForm(makeSubForm(dst, regOperand(hiddenPair)))) return false;
          if (preserveHl && !popReg('HL')) return false;
          if (!popReg(hiddenPair)) return false;
          return true;
        }
        case 'byteMemToMem': {
          const { hiddenReg, preservePair, preserveHl } = plan;
          if (!pushReg(preservePair)) return false;
          if (preserveHl && !pushReg('HL')) return false;
          if (!emitLdForm(makeSubForm(regOperand(hiddenReg), src))) return false;
          if (!emitLdForm(makeSubForm(dst, regOperand(hiddenReg)))) return false;
          if (preserveHl && !popReg('HL')) return false;
          if (!popReg(preservePair)) return false;
          return true;
        }
        case 'wordMemToMem': {
          const { hiddenPair, preserveHl } = plan;
          if (!pushReg(hiddenPair)) return false;
          if (preserveHl && !pushReg('HL')) return false;
          if (!emitLdForm(makeSubForm(regOperand(hiddenPair), src))) return false;
          if (!emitLdForm(makeSubForm(dst, regOperand(hiddenPair)))) return false;
          if (preserveHl && !popReg('HL')) return false;
          if (!popReg(hiddenPair)) return false;
          return true;
        }
      }
    };

    const emitAssignmentMemTransfer = (): boolean => {
      if (dst.kind !== 'Mem') return false;
      const planned = planAssignmentMemTransfer(form, isWordCompatibleScalarKind);
      if (planned.kind === 'reject') return false;
      if (planned.kind === 'diagnostic') {
        diagAt(diagnostics, inst.span, planned.message);
        return true;
      }
      return runAssignmentMemTransferPlan(planned.plan);
    };

    const regMemHandled = emitLdRegMemForm(form);
    if (regMemHandled !== null) {
      return regMemHandled;
    }

    if (isAssignmentForm && dst.kind === 'Mem' && (src.kind === 'Mem' || (src.kind === 'Ea' && src.explicitAddressOf))) {
      return emitAssignmentMemTransfer();
    }

    if (dst.kind === 'Mem' && src.kind === 'Mem') {
      if (
        (srcScalarExact === 'byte' && isWordCompatibleScalarKind(dstScalarExact)) ||
        (dstScalarExact === 'byte' && isWordCompatibleScalarKind(srcScalarExact))
      ) {
        diagAt(diagnostics, inst.span, 'Word mem->mem transfer requires word-typed source and destination.');
        return true;
      }
      if (
        scalarMemToMem !== undefined &&
        dstResolved?.kind === 'stack' &&
        srcResolved?.kind === 'stack' &&
        dstResolved.ixDisp >= -0x80 &&
        dstResolved.ixDisp <= 0x7f &&
        srcResolved.ixDisp >= -0x80 &&
        srcResolved.ixDisp <= 0x7f
      ) {
        const dstLoDisp = dstResolved.ixDisp;
        const dstHiDisp = dstResolved.ixDisp + 1;
        const srcLoDisp = srcResolved.ixDisp;
        const srcHiDisp = srcResolved.ixDisp + 1;
        const fmtIxDisp = (disp: number): string => {
          const abs = Math.abs(disp).toString(16).padStart(4, '0').toUpperCase();
          return disp >= 0 ? `(IX + $${abs})` : `(IX - $${abs})`;
        };
        const dstLo = dstLoDisp & 0xff;
        const dstHi = dstHiDisp & 0xff;
        const srcLo = srcLoDisp & 0xff;
        const srcHi = srcHiDisp & 0xff;

        if (scalarMemToMem === 'byte') {
          emitRawCodeBytes(Uint8Array.of(0xdd, 0x5e, srcLo), inst.span.file, `ld e, ${fmtIxDisp(srcLoDisp)}`);
          emitRawCodeBytes(Uint8Array.of(0xdd, 0x73, dstLo), inst.span.file, `ld ${fmtIxDisp(dstLoDisp)}, e`);
          return true;
        }

        emitRawCodeBytes(Uint8Array.of(0xdd, 0x5e, srcLo), inst.span.file, `ld e, ${fmtIxDisp(srcLoDisp)}`);
        emitRawCodeBytes(Uint8Array.of(0xdd, 0x56, srcHi), inst.span.file, `ld d, ${fmtIxDisp(srcHiDisp)}`);
        emitRawCodeBytes(Uint8Array.of(0xdd, 0x73, dstLo), inst.span.file, `ld ${fmtIxDisp(dstLoDisp)}, e`);
        emitRawCodeBytes(Uint8Array.of(0xdd, 0x72, dstHi), inst.span.file, `ld ${fmtIxDisp(dstHiDisp)}, d`);
        return true;
      }

      if (!scalarMemToMem) return false;
      if (scalarMemToMem === 'byte') {
        const srcPipe = buildEaBytePipeline(src.expr, inst.span);
        const dstPipe = buildEaBytePipeline(dst.expr, inst.span);
        if (srcPipe && dstPipe) {
          if (!emitStepPipeline(TEMPLATE_L_ABC('A', srcPipe), inst.span)) return false;
          if (!emitStepPipeline(TEMPLATE_S_ANY('A', dstPipe), inst.span)) return false;
          return true;
        }
        if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)) return false;
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitRawCodeBytes(Uint8Array.of(0x7e), inst.span.file, 'ld a, (hl)');
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitRawCodeBytes(Uint8Array.of(0x77), inst.span.file, 'ld (hl), a');
        if (!emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)) return false;
        return true;
      }
      const srcPipeW = buildEaWordPipeline(src.expr, inst.span);
      const dstPipeW = buildEaWordPipeline(dst.expr, inst.span);
      if (srcPipeW && dstPipeW) {
        if (!emitStepPipeline(TEMPLATE_LW_DE(srcPipeW), inst.span)) return false;
        if (!emitStepPipeline(TEMPLATE_SW_DEBC('DE', dstPipeW), inst.span)) return false;
        return true;
      }
      if (srcPipeW && canUseScalarWordAccessor(dstResolved)) {
        if (!emitStepPipeline(TEMPLATE_LW_DE(srcPipeW), inst.span)) return false;
        if (!emitScalarWordStore('DE', dstResolved, inst.span)) return false;
        return true;
      }
      if (canUseScalarWordAccessor(srcResolved) && dstPipeW) {
        if (!emitScalarWordLoad('DE', srcResolved, inst.span)) return false;
        if (!emitStepPipeline(TEMPLATE_SW_DEBC('DE', dstPipeW), inst.span)) return false;
        return true;
      }
      if (canUseScalarWordAccessor(srcResolved) && canUseScalarWordAccessor(dstResolved)) {
        if (!emitScalarWordLoad('DE', srcResolved, inst.span)) return false;
        if (!emitScalarWordStore('DE', dstResolved, inst.span)) return false;
        return true;
      }
      if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
      if (!emitLoadWordFromHlAddress('DE', inst.span)) return false;
      if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span)) return false;
      if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
      if (!emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span)) return false;
      return emitStoreWordToHlAddress('DE', inst.span);
    }

    if (dst.kind === 'Mem' && src.kind === 'Imm') {
      if (form.dstHasRegisterLikeEaBase) return false;
      if (form.dstIsIxIyDispMem) return false;
      if (form.dstIsEaNameHL) return false;
      const scalar =
        dstResolved?.typeExpr !== undefined ? resolveScalarKind(dstResolved.typeExpr, new Set()) : undefined;
      const v = evalImmExpr(src.expr);
      if (v === undefined) {
        diagAt(diagnostics, inst.span, 'ld (ea), imm expects a constant imm expression.');
        return true;
      }
      const fitsImm8 = (value: number): boolean => value >= -0x80 && value <= 0xff;
      const fitsImm16 = (value: number): boolean => value >= -0x8000 && value <= 0xffff;

      if (scalar === 'byte') {
        if (!fitsImm8(v)) {
          diagAt(diagnostics, inst.span, 'ld (ea), imm expects imm8.');
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return true;
        return emitInstr(
          'ld',
          [
            { kind: 'Mem', span: inst.span, expr: { kind: 'EaName', span: inst.span, name: 'HL' } },
            { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: v } },
          ],
          inst.span,
        );
      }

      if (scalar === 'word' || scalar === 'addr') {
        if (!fitsImm16(v)) {
          diagAt(diagnostics, inst.span, 'ld (ea), imm expects imm16.');
          return true;
        }
        if (dstResolved?.kind === 'abs') {
          if (!loadImm16ToHL(v, inst.span)) return true;
          emitAbs16Fixup(0x22, dstResolved.baseLower, dstResolved.addend, inst.span);
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return true;
        const lo = v & 0xff;
        const hi = (v >> 8) & 0xff;
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Mem', span: inst.span, expr: { kind: 'EaName', span: inst.span, name: 'HL' } },
              { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: lo } },
            ],
            inst.span,
          )
        ) {
          return true;
        }
        if (!emitInstr('inc', [{ kind: 'Reg', span: inst.span, name: 'HL' }], inst.span)) return true;
        return emitInstr(
          'ld',
          [
            { kind: 'Mem', span: inst.span, expr: { kind: 'EaName', span: inst.span, name: 'HL' } },
            { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: hi } },
          ],
          inst.span,
        );
      }

      diagAt(diagnostics, inst.span, 'ld (ea), imm is supported only for byte/word/addr destinations.');
      return true;
    }

    return false;
  };

  return { emitLdForm };
}
