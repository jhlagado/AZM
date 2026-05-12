import type { AsmInstructionNode, EaExprNode } from '../frontend/ast.js';
import type { BranchCallLoweringContext } from './asmLoweringBranchCall.js';
import type { StepLoweringContext } from './asmLoweringStep.js';
import type { LdHelperContext } from './asmInstructionLdHelpers.js';

/**
 * Fields required by {@link createAsmInstructionLdHelpers} beyond what
 * {@link BranchCallLoweringContext} already provides (`emitInstr`, `emitAbs16Fixup`).
 */
export type AsmLoweringLdHelperSlice = Omit<LdHelperContext, 'emitInstr' | 'emitAbs16Fixup'>;

/**
 * Step lowering needs EA typing, resolution, and scalar word load/store helpers.
 */
export type AsmLoweringStepSlice = Pick<
  StepLoweringContext,
  | 'resolveScalarTypeForLd'
  | 'resolveEa'
  | 'materializeEaAddressToHL'
  | 'emitScalarWordLoad'
  | 'emitScalarWordStore'
>;

/**
 * Dispatcher paths shared by assignment lowering and the non-`ld` `lowerLdWithEa` fallback.
 */
export type AsmLoweringDispatcherSlice = {
  lowerLdWithEa: (asmItem: AsmInstructionNode) => boolean;
  pushEaAddress: (ea: EaExprNode, span: AsmInstructionNode['span']) => boolean;
};

/**
 * Narrow surface for {@link createAsmInstructionLoweringHelpers}: branch/call, LD helpers,
 * step, assignment, and raw-instruction fallback. Composed from family-module contracts plus
 * LD-helper and dispatcher-only fields (no unused legacy fields).
 */
export type AsmLoweringHost = BranchCallLoweringContext &
  AsmLoweringLdHelperSlice &
  AsmLoweringStepSlice &
  AsmLoweringDispatcherSlice;
