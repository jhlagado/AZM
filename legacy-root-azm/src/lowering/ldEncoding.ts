import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceSpan } from '../frontend/ast.js';
import type { LdForm } from './ldFormSelection.js';
import { createLdEncodingRegMemHelpers } from './ldEncodingRegMemHelpers.js';

export type LdEncodingContext = {
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
  reg8Code: ReadonlyMap<string, number>;
  setSpTrackingInvalid: () => void;
};

export function createLdEncodingHelpers(ctx: LdEncodingContext) {
  const { emitLdRegMemForm } = createLdEncodingRegMemHelpers(ctx);

  const emitLdForm = (form: LdForm): boolean => {
    const regMemHandled = emitLdRegMemForm(form);
    if (regMemHandled !== null) {
      return regMemHandled;
    }
    return false;
  };

  return { emitLdForm };
}
