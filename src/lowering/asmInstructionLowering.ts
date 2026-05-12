import type { AsmInstructionNode } from '../frontend/ast.js';
import { createAsmInstructionLdHelpers } from './asmInstructionLdHelpers.js';
import { tryLowerBranchCallInstruction } from './asmLoweringBranchCall.js';
import { tryLowerStepInstruction } from './asmLoweringStep.js';
import { tryLowerAssignmentInstruction } from './asmLoweringAssign.js';
import { tryLowerLdInstruction } from './asmLoweringLd.js';
import type { AsmLoweringHost } from './asmLoweringHost.js';

export type { AsmLoweringHost } from './asmLoweringHost.js';

export function createAsmInstructionLoweringHelpers(host: AsmLoweringHost) {
  const {
    emitAssignmentImmediateToRegister,
    emitAssignmentRegisterTransfer,
    isTypedStorageLdOperand,
    resolveRawLabelName,
    isRawLdLabelName,
    emitAbs16LdFixup,
    isRegisterLikeMemEa,
  } = createAsmInstructionLdHelpers(host);
  const lowerAsmInstructionDispatcher = (asmItem: AsmInstructionNode): void => {
    const branchResult = tryLowerBranchCallInstruction(asmItem, host);
    if (branchResult !== undefined) {
      if (!branchResult) return;
      return;
    }

    const stepResult = tryLowerStepInstruction(asmItem, host);
    if (stepResult !== undefined) {
      if (!stepResult) return;
      return;
    }

    const ldResult = tryLowerLdInstruction(asmItem, {
      diagnostics: host.diagnostics,
      diagAt: host.diagAt,
      emitAbs16Fixup: host.emitAbs16Fixup,
      emitAbs16FixupPrefixed: host.emitAbs16FixupPrefixed,
      evalImmExpr: host.evalImmExpr,
      resolveScalarBinding: host.resolveScalarBinding,
      lowerLdWithEa: host.lowerLdWithEa,
      emitAbs16LdFixup,
      isTypedStorageLdOperand,
      isRawLdLabelName,
      resolveRawLabelName,
      isRegisterLikeMemEa,
      syncToFlow: host.syncToFlow,
    });
    if (ldResult !== undefined) {
      if (!ldResult) return;
      return;
    }

    const assignResult = tryLowerAssignmentInstruction(asmItem, {
      diagnostics: host.diagnostics,
      diagAt: host.diagAt,
      emitInstr: host.emitInstr,
      lowerLdWithEa: host.lowerLdWithEa,
      pushEaAddress: host.pushEaAddress,
      reg16: host.reg16,
      emitAssignmentImmediateToRegister,
      emitAssignmentRegisterTransfer,
      syncToFlow: host.syncToFlow,
    });
    if (assignResult !== undefined) {
      if (!assignResult) return;
      return;
    }

    const head = asmItem.head.toLowerCase();

    if (head !== 'ld' && host.lowerLdWithEa(asmItem)) {
      host.syncToFlow();
      return;
    }

    if (host.emitVirtualReg16Transfer(asmItem)) {
      host.syncToFlow();
      return;
    }

    if (!host.emitInstr(asmItem.head, asmItem.operands, asmItem.span)) return;

    if ((head === 'jp' || head === 'jr') && asmItem.operands.length === 1) {
      host.flowRef.current.reachable = false;
    } else if (
      (head === 'ret' || head === 'retn' || head === 'reti') &&
      asmItem.operands.length === 0
    ) {
      host.flowRef.current.reachable = false;
    }
    host.syncToFlow();
  };

  return { lowerAsmInstructionDispatcher };
}
