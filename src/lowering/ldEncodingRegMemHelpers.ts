import type { LdForm } from './ldFormSelection.js';
import type { LdEncodingContext } from './ldEncoding.js';

export function createLdEncodingRegMemHelpers(ctx: LdEncodingContext) {
  const {
    diagAt,
    diagnostics,
    emitAbs16Fixup,
    emitAbs16FixupEd,
    emitAbs16FixupPrefixed,
    reg8Code,
    setSpTrackingInvalid,
  } = ctx;

  const emitRegFromMem = (form: LdForm): boolean => {
    const { dst, src, inst, srcResolved } = form;
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
    if (reg8Code.has(regUp)) {
      return false;
    }

    const r16 = dst.name.toUpperCase();
    if (r16 === 'HL') {
      if (srcResolved?.kind === 'abs') {
        emitAbs16Fixup(0x2a, srcResolved.baseLower, srcResolved.addend, inst.span);
        return true;
      }
      return false;
    }
    if (r16 === 'DE') {
      if (srcResolved?.kind === 'abs') {
        emitAbs16FixupEd(0x5b, srcResolved.baseLower, srcResolved.addend, inst.span);
        return true;
      }
      return false;
    }
    if (r16 === 'BC') {
      if (srcResolved?.kind === 'abs') {
        emitAbs16FixupEd(0x4b, srcResolved.baseLower, srcResolved.addend, inst.span);
        return true;
      }
      return false;
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
      return false;
    }

    return false;
  };

  const emitMemFromReg = (form: LdForm): boolean => {
    const { dst, src, inst, dstResolved } = form;
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
    if (reg8Code.has(regUp)) {
      return false;
    }

    const r16 = src.name.toUpperCase();
    if (r16 === 'HL') {
      if (dstResolved?.kind === 'abs') {
        emitAbs16Fixup(0x22, dstResolved.baseLower, dstResolved.addend, inst.span);
        return true;
      }
      return false;
    }
    if (r16 === 'DE') {
      if (dstResolved?.kind === 'abs') {
        emitAbs16FixupEd(0x53, dstResolved.baseLower, dstResolved.addend, inst.span);
        return true;
      }
      return false;
    }
    if (r16 === 'BC') {
      if (dstResolved?.kind === 'abs') {
        emitAbs16FixupEd(0x43, dstResolved.baseLower, dstResolved.addend, inst.span);
        return true;
      }
      return false;
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
      return false;
    }

    return false;
  };

  const emitLdRegMemForm = (form: LdForm): boolean | null => {
    if (form.dst.kind === 'Reg' && form.src.kind === 'Mem') {
      return emitRegFromMem(form);
    }
    if (form.dst.kind === 'Mem' && form.src.kind === 'Reg') {
      return emitMemFromReg(form);
    }
    return null;
  };

  return { emitLdRegMemForm };
}
