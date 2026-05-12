import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../src/diagnosticTypes.js';
import type { Diagnostic } from '../src/diagnosticTypes.js';
import { createAsmInstructionLoweringHelpers } from '../src/lowering/asmInstructionLowering.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../src/frontend/ast.js';

const span: SourceSpan = {
  file: 'fixture.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

describe('PR781 ld typed-storage migration diagnostics', () => {
  function helperFor(resolveScalar: (name: string) => 'byte' | 'word' | 'addr' | undefined) {
    const diagnostics: Diagnostic[] = [];
    let ldCalled = false;
    const helper = createAsmInstructionLoweringHelpers({
      diagnostics,
      diagAt: (_diags, _span, message) => {
        diagnostics.push({
          id: DiagnosticIds.EmitError,
          severity: 'error',
          message,
          file: span.file,
          line: span.start.line,
          column: span.start.column,
        });
      },
      emitInstr: () => true,
      emitRawCodeBytes: () => {},
      emitAbs16Fixup: () => {},
      emitAbs16FixupPrefixed: () => {},
      emitRel8Fixup: () => {},
      conditionOpcodeFromName: () => undefined,
      callConditionOpcodeFromName: () => undefined,
      jrConditionOpcodeFromName: () => undefined,
      conditionOpcode: () => undefined,
      symbolicTargetFromExpr: () => undefined,
      evalImmExpr: () => undefined,
      resolveScalarBinding: resolveScalar,
      resolveRawAliasTargetName: () => undefined,
      isModuleStorageName: () => false,
      isFrameSlotName: () => false,
      resolveScalarTypeForLd: () => undefined,
      resolveEa: () => undefined,
      diagIfRetStackImbalanced: () => {},
      diagIfCallStackUnverifiable: () => {},
      warnIfRawCallTargetsTypedCallable: () => {},
      lowerLdWithEa: () => {
        ldCalled = true;
        return false;
      },
      pushEaAddress: () => false,
      materializeEaAddressToHL: () => false,
      emitScalarWordLoad: () => false,
      emitScalarWordStore: () => false,
      emitVirtualReg16Transfer: () => false,
      reg16: new Set(['BC', 'DE', 'HL']),
      emitSyntheticEpilogue: false,
      epilogueLabel: '__zax_epilogue_0',
      emitJumpTo: () => {},
      emitJumpCondTo: () => {},
      syncToFlow: () => {},
      flowRef: { current: { reachable: true } },
    });
    return {
      helper,
      diagnostics,
      get ldCalled() {
        return ldCalled;
      },
    };
  }

  it('diagnoses typed storage names in ld immediate form', () => {
    const ctx = helperFor((name) => (name.toLowerCase() === 'x' ? 'byte' : undefined));
    const ldItem: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'ld',
      operands: [
        { kind: 'Reg', span, name: 'A' },
        { kind: 'Imm', span, expr: { kind: 'ImmName', span, name: 'x' } },
      ] satisfies AsmOperandNode[],
    };

    ctx.helper.lowerAsmInstructionDispatcher(ldItem);

    expect(ctx.diagnostics.length).toBeGreaterThan(0);
    expectDiagnostic(ctx.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: ':=',
    });
    expect(ctx.ldCalled).toBe(false);
  });

  it('diagnoses typed storage paths in ld', () => {
    const ctx = helperFor((name) => (name.toLowerCase() === 'x' ? 'byte' : undefined));
    const ldItem: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'ld',
      operands: [
        { kind: 'Reg', span, name: 'A' },
        { kind: 'Ea', span, expr: { kind: 'EaName', span, name: 'x' } },
      ] satisfies AsmOperandNode[],
    };

    ctx.helper.lowerAsmInstructionDispatcher(ldItem);

    expect(ctx.diagnostics.length).toBeGreaterThan(0);
    expectDiagnostic(ctx.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: ':=',
    });
    expect(ctx.ldCalled).toBe(false);
  });
});
