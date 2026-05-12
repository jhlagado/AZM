import type { EaExprNode, ImmExprNode } from '../frontend/ast.js';
import type { LdForm } from './ldFormSelection.js';
import type { EaResolution } from './eaResolution.js';
import type { ScalarKind } from './typeResolution.js';

export function immExprUsesAnyRegister(expr: ImmExprNode, names: ReadonlySet<string>): boolean {
  switch (expr.kind) {
    case 'ImmLiteral':
    case 'ImmCurrentLocation':
    case 'ImmSizeof':
      return false;
    case 'ImmName':
      return names.has(expr.name.toUpperCase());
    case 'ImmOffsetof':
      return expr.path.steps.some((step) =>
        step.kind === 'OffsetofIndex' ? immExprUsesAnyRegister(step.expr, names) : false,
      );
    case 'ImmUnary':
      return immExprUsesAnyRegister(expr.expr, names);
    case 'ImmBinary':
      return immExprUsesAnyRegister(expr.left, names) || immExprUsesAnyRegister(expr.right, names);
  }
}

export function eaUsesAnyRegister(ea: EaExprNode, names: ReadonlySet<string>): boolean {
  switch (ea.kind) {
    case 'EaName':
      return names.has(ea.name.toUpperCase());
    case 'EaImm':
      return immExprUsesAnyRegister(ea.expr, names);
    case 'EaReinterpret':
      return eaUsesAnyRegister(ea.base, names);
    case 'EaField':
      return eaUsesAnyRegister(ea.base, names);
    case 'EaAdd':
    case 'EaSub':
      return eaUsesAnyRegister(ea.base, names) || immExprUsesAnyRegister(ea.offset, names);
    case 'EaIndex':
      switch (ea.index.kind) {
        case 'IndexImm':
          return eaUsesAnyRegister(ea.base, names) || immExprUsesAnyRegister(ea.index.value, names);
        case 'IndexReg8':
          return eaUsesAnyRegister(ea.base, names) || names.has(ea.index.reg.toUpperCase());
        case 'IndexReg16':
          return eaUsesAnyRegister(ea.base, names) || names.has(ea.index.reg.toUpperCase());
        case 'IndexMemHL':
          return eaUsesAnyRegister(ea.base, names) || names.has('HL');
        case 'IndexMemIxIy':
          return eaUsesAnyRegister(ea.base, names) || names.has(ea.index.base.toUpperCase());
        case 'IndexEa':
          return eaUsesAnyRegister(ea.base, names) || eaUsesAnyRegister(ea.index.expr, names);
      }
  }
}

export function anyEaUsesAnyRegister(
  eas: ReadonlyArray<EaExprNode | undefined>,
  names: ReadonlySet<string>,
): boolean {
  return eas.some((ea) => (ea ? eaUsesAnyRegister(ea, names) : false));
}

export function pickHiddenByteReg(...eas: Array<EaExprNode | undefined>): 'A' | 'B' | 'C' | 'D' | 'E' {
  for (const candidate of ['A', 'B', 'C', 'D', 'E'] as const) {
    if (!anyEaUsesAnyRegister(eas, new Set([candidate]))) return candidate;
  }
  return 'A';
}

export function pickHiddenWordPair(...eas: Array<EaExprNode | undefined>): 'DE' | 'BC' | undefined {
  const usesDE = anyEaUsesAnyRegister(eas, new Set(['DE', 'D', 'E']));
  const usesBC = anyEaUsesAnyRegister(eas, new Set(['BC', 'B', 'C']));
  if (!usesDE) return 'DE';
  if (!usesBC) return 'BC';
  return undefined;
}

function regPairForReg8(name: string): 'AF' | 'BC' | 'DE' | undefined {
  switch (name.toUpperCase()) {
    case 'A':
      return 'AF';
    case 'B':
    case 'C':
      return 'BC';
    case 'D':
    case 'E':
      return 'DE';
    default:
      return undefined;
  }
}

function canDirectLoadByteToReg8(_regUp: string, resolved: EaResolution | undefined): boolean {
  if (resolved?.kind === 'abs') return true;
  return resolved?.kind === 'stack' && resolved.ixDisp >= -0x80 && resolved.ixDisp <= 0x7f;
}

function canDirectStoreByteFromReg8(_regUp: string, resolved: EaResolution | undefined): boolean {
  if (resolved?.kind === 'abs') return true;
  return resolved?.kind === 'stack' && resolved.ixDisp >= -0x80 && resolved.ixDisp <= 0x7f;
}

function canDirectLoadWordToPair(resolved: EaResolution | undefined): boolean {
  return resolved?.kind === 'abs' || resolved?.kind === 'stack';
}

function canDirectStoreWordFromPair(resolved: EaResolution | undefined): boolean {
  return resolved?.kind === 'abs' || resolved?.kind === 'stack';
}

/** Explicit `:=` mem transfer after form selection: scratch + HL preservation decided here, not during emission. */
export type AssignmentMemTransferPlan =
  | {
      kind: 'addressOf';
      hiddenPair: 'DE' | 'BC';
      preserveHl: boolean;
    }
  | {
      kind: 'byteMemToMem';
      hiddenReg: 'A' | 'B' | 'C' | 'D' | 'E';
      preservePair: 'AF' | 'BC' | 'DE';
      preserveHl: boolean;
    }
  | {
      kind: 'wordMemToMem';
      hiddenPair: 'DE' | 'BC';
      preserveHl: boolean;
    };

export type PlanAssignmentMemTransferResult =
  | { kind: 'plan'; plan: AssignmentMemTransferPlan }
  | { kind: 'diagnostic'; message: string }
  | { kind: 'reject' };

export function planAssignmentMemTransfer(
  form: LdForm,
  isWordCompatibleScalarKind: (scalar: ScalarKind | undefined) => scalar is 'word' | 'addr',
): PlanAssignmentMemTransferResult {
  const { dst, src, dstResolved, srcResolved, dstScalarExact, srcScalarExact, scalarMemToMem } = form;

  if (dst.kind !== 'Mem') return { kind: 'reject' };

  if (src.kind === 'Ea' && src.explicitAddressOf) {
    if (!isWordCompatibleScalarKind(dstScalarExact)) {
      return { kind: 'diagnostic', message: 'Address transfer requires a word/addr destination.' };
    }
    const hiddenPair = pickHiddenWordPair(src.expr, dst.expr);
    if (!hiddenPair) {
      return {
        kind: 'diagnostic',
        message: '":=" address transfer cannot preserve destination address registers cleanly.',
      };
    }
    const preserveHl = !canDirectStoreWordFromPair(dstResolved);
    return { kind: 'plan', plan: { kind: 'addressOf', hiddenPair, preserveHl } };
  }

  if (src.kind !== 'Mem') return { kind: 'reject' };

  if (
    (srcScalarExact === 'byte' && isWordCompatibleScalarKind(dstScalarExact)) ||
    (dstScalarExact === 'byte' && isWordCompatibleScalarKind(srcScalarExact))
  ) {
    return {
      kind: 'diagnostic',
      message: 'Word mem->mem transfer requires word-typed source and destination.',
    };
  }

  if (scalarMemToMem === 'byte') {
    const hiddenReg = pickHiddenByteReg(src.expr, dst.expr);
    const preservePair = regPairForReg8(hiddenReg);
    if (!preservePair) {
      return {
        kind: 'diagnostic',
        message: '":=" byte transfer could not choose a hidden transfer register.',
      };
    }
    const preserveHl =
      !canDirectLoadByteToReg8(hiddenReg, srcResolved) ||
      !canDirectStoreByteFromReg8(hiddenReg, dstResolved);
    return {
      kind: 'plan',
      plan: { kind: 'byteMemToMem', hiddenReg, preservePair, preserveHl },
    };
  }

  if (!scalarMemToMem) return { kind: 'reject' };

  const hiddenPair = pickHiddenWordPair(src.expr, dst.expr);
  if (!hiddenPair) {
    return {
      kind: 'diagnostic',
      message: '":=" word transfer cannot preserve destination address registers cleanly.',
    };
  }
  const preserveHl =
    !canDirectLoadWordToPair(srcResolved) || !canDirectStoreWordFromPair(dstResolved);
  return { kind: 'plan', plan: { kind: 'wordMemToMem', hiddenPair, preserveHl } };
}
