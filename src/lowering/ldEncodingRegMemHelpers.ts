import type { StepPipeline, StepReg8 } from './steps.js';
import type { AsmOperandNode, SourceSpan } from '../frontend/ast.js';
import type { LdForm } from './ldFormSelection.js';
import type { LdEncodingContext } from './ldEncoding.js';

export function createLdEncodingRegMemHelpers(ctx: LdEncodingContext) {
  const {
    LOAD_RP_FVAR,
    LOAD_RP_GLOB,
    STORE_RP_FVAR,
    STORE_RP_GLOB,
    TEMPLATE_L_ABC,
    TEMPLATE_L_DE,
    TEMPLATE_L_HL,
    TEMPLATE_LW_BC,
    TEMPLATE_LW_DE,
    TEMPLATE_LW_HL,
    TEMPLATE_S_ANY,
    TEMPLATE_S_HL,
    TEMPLATE_SW_DEBC,
    TEMPLATE_SW_HL,
    buildEaBytePipeline,
    buildEaWordPipeline,
    diagAt,
    diagnostics,
    emitAbs16Fixup,
    emitAbs16FixupEd,
    emitAbs16FixupPrefixed,
    emitInstr,
    emitLoadWordFromHlAddress,
    emitRawCodeBytes,
    emitStepPipeline,
    emitStoreSavedHlToEa,
    emitStoreWordToHlAddress,
    formatIxDisp,
    loadImm16ToHL: _loadImm16ToHL,
    materializeEaAddressToHL,
    reg8Code,
    setSpTrackingInvalid,
  } = ctx;

  const halfIndexRegs = new Set(['IXH', 'IXL', 'IYH', 'IYL']);
  const isHalfIndexReg = (name: string): boolean => halfIndexRegs.has(name.toUpperCase());

  const regOperand = (name: string, span: SourceSpan): AsmOperandNode => ({ kind: 'Reg', span, name });

  const pushReg = (name: string, span: SourceSpan): boolean => emitInstr('push', [regOperand(name, span)], span);

  const popReg = (name: string, span: SourceSpan): boolean => emitInstr('pop', [regOperand(name, span)], span);

  const ixDispMem = (disp: number, span: SourceSpan): AsmOperandNode => ({
    kind: 'Mem',
    span,
    expr:
      disp === 0
        ? { kind: 'EaName', span, name: 'IX' }
        : {
            kind: disp >= 0 ? 'EaAdd' : 'EaSub',
            span,
            base: { kind: 'EaName', span, name: 'IX' },
            offset: { kind: 'ImmLiteral', span, value: Math.abs(disp) },
          },
  });

  const emitByteMemLoadToReg8 = (form: LdForm, regUp: string): boolean => {
    const { inst, src, srcResolved } = form;
    const d = reg8Code.get(regUp);
    const viaA = isHalfIndexReg(regUp);
    if ((d === undefined && !viaA) || src.kind !== 'Mem') return false;

    if (srcResolved?.kind === 'abs') {
      if (regUp === 'A') {
        emitAbs16Fixup(0x3a, srcResolved.baseLower, srcResolved.addend, inst.span);
        return true;
      }
      if (!pushReg('AF', inst.span)) return false;
      emitAbs16Fixup(0x3a, srcResolved.baseLower, srcResolved.addend, inst.span);
      if (!emitInstr('ld', [regOperand(regUp, inst.span), regOperand('A', inst.span)], inst.span)) {
        return false;
      }
      return popReg('AF', inst.span);
    }

    if (srcResolved?.kind === 'stack' && srcResolved.ixDisp >= -0x80 && srcResolved.ixDisp <= 0x7f) {
      if (viaA) {
        if (!pushReg('AF', inst.span)) return false;
        emitRawCodeBytes(
          Uint8Array.of(0xdd, 0x7e, srcResolved.ixDisp & 0xff),
          inst.span.file,
          `ld A, (ix${formatIxDisp(srcResolved.ixDisp)})`,
        );
        if (!emitInstr('ld', [regOperand(regUp, inst.span), regOperand('A', inst.span)], inst.span)) {
          return false;
        }
        return popReg('AF', inst.span);
      }
      if (regUp === 'H' || regUp === 'L') {
        if (!emitInstr('ex', [regOperand('DE', inst.span), regOperand('HL', inst.span)], inst.span)) {
          return false;
        }
        if (
          !emitInstr(
            'ld',
            [regOperand(regUp === 'H' ? 'D' : 'E', inst.span), ixDispMem(srcResolved.ixDisp, inst.span)],
            inst.span,
          )
        ) {
          return false;
        }
        return emitInstr('ex', [regOperand('DE', inst.span), regOperand('HL', inst.span)], inst.span);
      }

      emitRawCodeBytes(
        Uint8Array.of(0xdd, 0x46 + (d! << 3), srcResolved.ixDisp & 0xff),
        inst.span.file,
        `ld ${regUp}, (ix${formatIxDisp(srcResolved.ixDisp)})`,
      );
      return true;
    }

    const eaPipe = buildEaBytePipeline(src.expr, inst.span);
    if (eaPipe) {
      let templated: StepPipeline | null = null;
      if (viaA) {
        if (!pushReg('AF', inst.span)) return false;
        if (!emitStepPipeline(TEMPLATE_L_ABC('A', eaPipe), inst.span)) return false;
        if (!emitInstr('ld', [regOperand(regUp, inst.span), regOperand('A', inst.span)], inst.span)) {
          return false;
        }
        return popReg('AF', inst.span);
      }
      if (regUp === 'A' || regUp === 'B' || regUp === 'C') templated = TEMPLATE_L_ABC(regUp as StepReg8, eaPipe);
      else if (regUp === 'H' || regUp === 'L') templated = TEMPLATE_L_HL(regUp as 'H' | 'L', eaPipe);
      else if (regUp === 'D' || regUp === 'E') templated = TEMPLATE_L_DE(regUp as 'D' | 'E', eaPipe);
      if (templated && emitStepPipeline(templated, inst.span)) return true;
    }

    if (viaA) {
      if (!pushReg('AF', inst.span)) return false;
      if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
      emitRawCodeBytes(Uint8Array.of(0x7e), inst.span.file, 'ld A, (hl)');
      if (!emitInstr('ld', [regOperand(regUp, inst.span), regOperand('A', inst.span)], inst.span)) {
        return false;
      }
      return popReg('AF', inst.span);
    }
    if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
    emitRawCodeBytes(Uint8Array.of(0x46 + (d! << 3)), inst.span.file, `ld ${regUp}, (hl)`);
    return true;
  };

  const emitRegFromMem = (form: LdForm, isAssignmentForm: boolean): boolean => {
    const { dst, src, inst, srcResolved, srcScalarExact } = form;
    if (dst.kind !== 'Reg' || src.kind !== 'Mem') return false;

    if (form.srcHasRegisterLikeEaBase) return false;
    if (form.srcIsIxIyDispMem && reg8Code.has(dst.name.toUpperCase())) return false;
    if (form.srcIsEaNameHL) return false;
    if (dst.name.toUpperCase() === 'A' && form.srcIsEaNameBCorDE) return false;
    if (dst.name.toUpperCase() === 'A' && srcResolved?.kind === 'abs') {
      emitAbs16Fixup(0x3a, srcResolved.baseLower, srcResolved.addend, inst.span);
      return true;
    }
    const regUp = dst.name.toUpperCase();
    const d = reg8Code.get(regUp);
    if (d !== undefined || isHalfIndexReg(regUp)) {
      return emitByteMemLoadToReg8(form, regUp);
    }

    const r16 = dst.name.toUpperCase();
    if (r16 === 'HL') {
      if (srcScalarExact === 'byte') {
        if (isAssignmentForm) {
          if (
            !emitInstr(
              'ld',
              [regOperand('H', inst.span), { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: 0 } }],
              inst.span,
            )
          ) {
            return false;
          }
          return emitByteMemLoadToReg8(form, 'L');
        }
        diagAt(diagnostics, inst.span, 'Word register load requires a word-typed source.');
        return true;
      }
      if (srcResolved?.kind === 'stack') return emitStepPipeline(LOAD_RP_FVAR('HL', srcResolved.ixDisp), inst.span);
      if (srcResolved?.kind === 'abs') {
        if (srcResolved.addend === 0 && emitStepPipeline(LOAD_RP_GLOB('HL', srcResolved.baseLower), inst.span)) {
          return true;
        }
        emitAbs16Fixup(0x2a, srcResolved.baseLower, srcResolved.addend, inst.span);
        return true;
      }
      const srcPipeW = buildEaWordPipeline(src.expr, inst.span);
      if (srcPipeW && emitStepPipeline(TEMPLATE_LW_HL(srcPipeW), inst.span)) return true;
      if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
      return emitLoadWordFromHlAddress('HL', inst.span);
    }
    if (r16 === 'DE') {
      if (srcScalarExact === 'byte') {
        if (isAssignmentForm) {
          if (
            !emitInstr(
              'ld',
              [regOperand('D', inst.span), { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: 0 } }],
              inst.span,
            )
          ) {
            return false;
          }
          return emitByteMemLoadToReg8(form, 'E');
        }
        diagAt(diagnostics, inst.span, 'Word register load requires a word-typed source.');
        return true;
      }
      if (srcResolved?.kind === 'stack') return emitStepPipeline(LOAD_RP_FVAR('DE', srcResolved.ixDisp), inst.span);
      if (srcResolved?.kind === 'abs') {
        if (srcResolved.addend === 0 && emitStepPipeline(LOAD_RP_GLOB('DE', srcResolved.baseLower), inst.span)) {
          return true;
        }
        emitAbs16FixupEd(0x5b, srcResolved.baseLower, srcResolved.addend, inst.span);
        return true;
      }
      const srcPipeW = buildEaWordPipeline(src.expr, inst.span);
      if (srcPipeW && emitStepPipeline(TEMPLATE_LW_DE(srcPipeW), inst.span)) return true;
      if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
      return emitLoadWordFromHlAddress('DE', inst.span);
    }
    if (r16 === 'BC') {
      if (srcScalarExact === 'byte') {
        if (isAssignmentForm) {
          if (
            !emitInstr(
              'ld',
              [regOperand('B', inst.span), { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: 0 } }],
              inst.span,
            )
          ) {
            return false;
          }
          return emitByteMemLoadToReg8(form, 'C');
        }
        diagAt(diagnostics, inst.span, 'Word register load requires a word-typed source.');
        return true;
      }
      if (srcResolved?.kind === 'stack') return emitStepPipeline(LOAD_RP_FVAR('BC', srcResolved.ixDisp), inst.span);
      if (srcResolved?.kind === 'abs') {
        if (srcResolved.addend === 0 && emitStepPipeline(LOAD_RP_GLOB('BC', srcResolved.baseLower), inst.span)) {
          return true;
        }
        emitAbs16FixupEd(0x4b, srcResolved.baseLower, srcResolved.addend, inst.span);
        return true;
      }
      const srcPipeW = buildEaWordPipeline(src.expr, inst.span);
      if (srcPipeW && emitStepPipeline(TEMPLATE_LW_BC(srcPipeW), inst.span)) return true;
      if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
      return emitLoadWordFromHlAddress('BC', inst.span);
    }
    if (r16 === 'SP' && srcResolved?.kind === 'abs') {
      emitAbs16FixupEd(0x7b, srcResolved.baseLower, srcResolved.addend, inst.span);
      setSpTrackingInvalid();
      return true;
    }
    if (r16 === 'IX' || r16 === 'IY') {
      if (srcResolved?.kind === 'abs') {
        emitAbs16FixupPrefixed(r16 === 'IX' ? 0xdd : 0xfd, 0x2a, srcResolved.baseLower, srcResolved.addend, inst.span);
        return true;
      }
      if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
      if (!emitLoadWordFromHlAddress('HL', inst.span)) return false;
      if (!pushReg('HL', inst.span) || !popReg(r16, inst.span)) {
        return false;
      }
      return true;
    }

    return false;
  };

  const emitMemFromReg = (form: LdForm): boolean => {
    const { dst, src, inst, dstResolved, dstScalarExact } = form;
    if (dst.kind !== 'Mem' || src.kind !== 'Reg') return false;

    if (form.dstHasRegisterLikeEaBase) return false;
    if (form.dstIsIxIyDispMem && reg8Code.has(src.name.toUpperCase())) return false;
    if (form.dstIsEaNameHL) return false;
    if (src.name.toUpperCase() === 'A' && form.dstIsEaNameBCorDE) return false;
    if (src.name.toUpperCase() === 'A' && dstResolved?.kind === 'abs') {
      emitAbs16Fixup(0x32, dstResolved.baseLower, dstResolved.addend, inst.span);
      return true;
    }
    const regUp = src.name.toUpperCase();
    const s8 = reg8Code.get(regUp);
    const viaA = isHalfIndexReg(regUp);
    if (s8 !== undefined || viaA) {
      if (dstResolved?.kind === 'abs' && dstResolved.addend === 0) {
        if (!pushReg('AF', inst.span)) return false;
        if (!emitInstr('ld', [regOperand('A', inst.span), regOperand(regUp, inst.span)], inst.span)) {
          return false;
        }
        emitAbs16Fixup(0x32, dstResolved.baseLower, 0, inst.span);
        return popReg('AF', inst.span);
      }

      if (dstResolved?.kind === 'stack' && dstResolved.ixDisp >= -0x80 && dstResolved.ixDisp <= 0x7f) {
        if (viaA) {
          if (!pushReg('AF', inst.span)) return false;
          if (!emitInstr('ld', [regOperand('A', inst.span), regOperand(regUp, inst.span)], inst.span)) {
            return false;
          }
          emitRawCodeBytes(
            Uint8Array.of(0xdd, 0x77, dstResolved.ixDisp & 0xff),
            inst.span.file,
            `ld (ix${formatIxDisp(dstResolved.ixDisp)}), A`,
          );
          return popReg('AF', inst.span);
        }
        if (regUp === 'H' || regUp === 'L') {
          if (!emitInstr('ex', [regOperand('DE', inst.span), regOperand('HL', inst.span)], inst.span)) {
            return false;
          }
          if (
            !emitInstr(
              'ld',
              [ixDispMem(dstResolved.ixDisp, inst.span), regOperand(regUp === 'H' ? 'D' : 'E', inst.span)],
              inst.span,
            )
          ) {
            return false;
          }
          return emitInstr('ex', [regOperand('DE', inst.span), regOperand('HL', inst.span)], inst.span);
        }
        emitRawCodeBytes(
          Uint8Array.of(0xdd, 0x70 + s8!, dstResolved.ixDisp & 0xff),
          inst.span.file,
          `ld (ix${formatIxDisp(dstResolved.ixDisp)}), ${regUp}`,
        );
        return true;
      }

      const dstPipe = buildEaBytePipeline(dst.expr, inst.span);
      if (dstPipe) {
        if (viaA) {
          if (!pushReg('AF', inst.span)) return false;
          if (!emitInstr('ld', [regOperand('A', inst.span), regOperand(regUp, inst.span)], inst.span)) {
            return false;
          }
          if (!emitStepPipeline(TEMPLATE_S_ANY('A', dstPipe), inst.span)) return false;
          return popReg('AF', inst.span);
        }
        if ((regUp === 'H' || regUp === 'L') && emitStepPipeline(TEMPLATE_S_HL(regUp as 'H' | 'L', dstPipe), inst.span)) {
          return true;
        }
        if (emitStepPipeline(TEMPLATE_S_ANY(regUp as StepReg8, dstPipe), inst.span)) return true;
      }
      const preserveA = regUp === 'A';
      if (viaA) {
        if (!pushReg('AF', inst.span)) return false;
        if (!emitInstr('ld', [regOperand('A', inst.span), regOperand(regUp, inst.span)], inst.span)) {
          return false;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitRawCodeBytes(Uint8Array.of(0x77), inst.span.file, 'ld (hl), a');
        return popReg('AF', inst.span);
      }
      if (preserveA && !pushReg('AF', inst.span)) return false;
      if (!materializeEaAddressToHL(dst.expr, inst.span)) {
        if (preserveA) return popReg('AF', inst.span);
        return false;
      }
      emitRawCodeBytes(Uint8Array.of(0x70 + s8!), inst.span.file, `ld (hl), ${regUp}`);
      if (preserveA && !popReg('AF', inst.span)) return false;
      return true;
    }

    const r16 = src.name.toUpperCase();
    if (r16 === 'HL') {
      if (dstScalarExact === 'byte') {
        diagAt(diagnostics, inst.span, 'Word register store requires a word-typed destination.');
        return true;
      }
      const dstPipeW = buildEaWordPipeline(dst.expr, inst.span);
      if (dstPipeW && emitStepPipeline(TEMPLATE_SW_HL(dstPipeW), inst.span)) return true;
      if (dstResolved?.kind === 'stack') return emitStepPipeline(STORE_RP_FVAR('HL', dstResolved.ixDisp), inst.span);
      if (dstResolved?.kind === 'abs') {
        if (dstResolved.addend === 0 && emitStepPipeline(STORE_RP_GLOB('HL', dstResolved.baseLower), inst.span)) {
          return true;
        }
        emitAbs16Fixup(0x22, dstResolved.baseLower, dstResolved.addend, inst.span);
        return true;
      }
      return emitStoreSavedHlToEa(dst.expr, inst.span);
    }
    if (r16 === 'DE') {
      if (dstScalarExact === 'byte') {
        diagAt(diagnostics, inst.span, 'Word register store requires a word-typed destination.');
        return true;
      }
      const dstPipeW = buildEaWordPipeline(dst.expr, inst.span);
      if (dstPipeW) return emitStepPipeline(TEMPLATE_SW_DEBC('DE', dstPipeW), inst.span);
      if (dstResolved?.kind === 'stack') return emitStepPipeline(STORE_RP_FVAR('DE', dstResolved.ixDisp), inst.span);
      if (dstResolved?.kind === 'abs') {
        if (dstResolved.addend === 0 && emitStepPipeline(STORE_RP_GLOB('DE', dstResolved.baseLower), inst.span)) {
          return true;
        }
        emitAbs16FixupEd(0x53, dstResolved.baseLower, dstResolved.addend, inst.span);
        return true;
      }
      if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
      return emitStoreWordToHlAddress('DE', inst.span);
    }
    if (r16 === 'BC') {
      if (dstScalarExact === 'byte') {
        diagAt(diagnostics, inst.span, 'Word register store requires a word-typed destination.');
        return true;
      }
      const dstPipeW = buildEaWordPipeline(dst.expr, inst.span);
      if (dstPipeW) return emitStepPipeline(TEMPLATE_SW_DEBC('BC', dstPipeW), inst.span);
      if (dstResolved?.kind === 'stack') return emitStepPipeline(STORE_RP_FVAR('BC', dstResolved.ixDisp), inst.span);
      if (dstResolved?.kind === 'abs') {
        if (dstResolved.addend === 0 && emitStepPipeline(STORE_RP_GLOB('BC', dstResolved.baseLower), inst.span)) {
          return true;
        }
        emitAbs16FixupEd(0x43, dstResolved.baseLower, dstResolved.addend, inst.span);
        return true;
      }
      if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
      return emitStoreWordToHlAddress('BC', inst.span);
    }
    if (r16 === 'SP' && dstResolved?.kind === 'abs') {
      emitAbs16FixupEd(0x73, dstResolved.baseLower, dstResolved.addend, inst.span);
      return true;
    }
    if (r16 === 'IX' || r16 === 'IY') {
      if (dstResolved?.kind === 'abs') {
        emitAbs16FixupPrefixed(r16 === 'IX' ? 0xdd : 0xfd, 0x22, dstResolved.baseLower, dstResolved.addend, inst.span);
        return true;
      }
      if (!pushReg(r16, inst.span) || !popReg('DE', inst.span)) {
        return false;
      }
      if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
      return emitStoreWordToHlAddress('DE', inst.span);
    }

    return false;
  };

  const emitLdRegMemForm = (form: LdForm): boolean | null => {
    const isAssignmentForm = form.inst.head.toLowerCase() === ':=';
    if (form.dst.kind === 'Reg' && form.src.kind === 'Mem') {
      return emitRegFromMem(form, isAssignmentForm);
    }
    if (form.dst.kind === 'Mem' && form.src.kind === 'Reg') {
      return emitMemFromReg(form);
    }
    return null;
  };

  return { emitLdRegMemForm };
}