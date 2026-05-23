import type { LdEncodingContext } from './ldEncoding.js';
import { createLdEncodingHelpers } from './ldEncoding.js';
import type { LdFormSelectionContext } from './ldFormSelection.js';
import { createLdFormSelectionHelpers } from './ldFormSelection.js';

type LdLoweringContext = LdFormSelectionContext & LdEncodingContext;

export function createLdLoweringHelpers(ctx: LdLoweringContext) {
  const { analyzeLdInstruction } = createLdFormSelectionHelpers(ctx);
  const { emitLdForm } = createLdEncodingHelpers(ctx);

  const lowerLdWithEa = (inst: Parameters<typeof analyzeLdInstruction>[0]): boolean => {
    const form = analyzeLdInstruction(inst);
    if (!form) return false;
    return emitLdForm(form);
  };

  return { lowerLdWithEa };
}
