import type { AsmInstructionNode } from '../frontend/ast.js';
import type { BranchCallLoweringContext } from './asmLoweringBranchCall.js';
import type { LdHelperContext } from './asmInstructionLdHelpers.js';
import type { LdLoweringContext } from './asmLoweringLd.js';

/**
 * Fields required by {@link createAsmInstructionLdHelpers} beyond what
 * {@link BranchCallLoweringContext} already provides (`emitInstr`, `emitAbs16Fixup`).
 */
type AsmLoweringLdHelperSlice = Omit<LdHelperContext, 'emitInstr' | 'emitAbs16Fixup'>;

type AsmLoweringLdSlice = Pick<LdLoweringContext, 'resolveEa'>;

/**
 * Dispatcher path shared by the non-`ld` `lowerLdWithEa` fallback.
 */
type AsmLoweringDispatcherSlice = {
  lowerLdWithEa: (asmItem: AsmInstructionNode) => boolean;
};

/**
 * Narrow surface for {@link createAsmInstructionLoweringHelpers}: branch/call, LD helpers,
 * and raw-instruction fallback. Composed from helper-family contracts plus LD-helper
 * and dispatcher-only fields.
 */
export type AsmLoweringHost = BranchCallLoweringContext &
  AsmLoweringLdHelperSlice &
  AsmLoweringLdSlice &
  AsmLoweringDispatcherSlice;
