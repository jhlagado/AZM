import { describe, expect, it } from 'vitest';

import { createAsmInstructionLoweringHelpers } from '../../src/lowering/asmInstructionLowering.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';

const span: SourceSpan = {
  file: 'fixture.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

describe('PR532 asm instruction lowering integration', () => {
  it('dispatches representative instruction paths through the extracted helper', () => {
    const events: string[] = [];
    const flow = { reachable: true };
    const helper = createAsmInstructionLoweringHelpers({
      diagnostics: [],
      diagAt: (_diagnostics, _span, message) => {
        events.push(`diag:${message}`);
      },
      emitInstr: (head, operands) => {
        events.push(`instr:${head}:${operands.length}`);
        return true;
      },
      emitRawCodeBytes: (_bytes, _file, asmText) => {
        events.push(`raw:${asmText}`);
      },
      emitAbs16Fixup: (opcode, baseLower, addend) => {
        events.push(`abs:${opcode.toString(16)}:${baseLower}:${addend}`);
      },
      emitAbs16FixupPrefixed: (prefix, opcode2, baseLower, addend) => {
        events.push(`abs2:${prefix.toString(16)}:${opcode2.toString(16)}:${baseLower}:${addend}`);
      },
      emitRel8Fixup: (opcode, baseLower, addend, _span, mnemonic) => {
        events.push(`rel:${opcode.toString(16)}:${baseLower}:${addend}:${mnemonic}`);
      },
      conditionOpcodeFromName: (name) => (name.toUpperCase() === 'NZ' ? 0xc2 : undefined),
      callConditionOpcodeFromName: (name) => (name.toUpperCase() === 'NZ' ? 0xc4 : undefined),
      jrConditionOpcodeFromName: (name) => (name.toUpperCase() === 'NZ' ? 0x20 : undefined),
      conditionOpcode: (op) =>
        op.kind === 'Reg' && op.name.toUpperCase() === 'NZ'
          ? 0xc2
          : op.kind === 'Imm' && op.expr.kind === 'ImmName' && op.expr.name.toUpperCase() === 'NZ'
            ? 0xc2
            : undefined,
      symbolicTargetFromExpr: (expr) => {
        if (expr.kind === 'ImmName') return { baseLower: expr.name.toLowerCase(), addend: 0 };
        return undefined;
      },
      evalImmExpr: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
      resolveScalarBinding: () => undefined,
      resolveRawAliasTargetName: () => undefined,
      isModuleStorageName: () => false,
      isFrameSlotName: () => false,
      resolveScalarTypeForLd: () => undefined,
      resolveEa: () => undefined,
      diagIfRetStackImbalanced: () => {},
      diagIfCallStackUnverifiable: () => {},
      warnIfRawCallTargetsTypedCallable: (_span, target) => {
        if (target) events.push(`warn:${target.baseLower}`);
      },
      lowerLdWithEa: () => false,
      pushEaAddress: () => false,
      materializeEaAddressToHL: () => false,
      emitScalarWordLoad: () => false,
      emitScalarWordStore: () => false,
      emitVirtualReg16Transfer: () => false,
      reg16: new Set(['BC', 'DE', 'HL']),
      emitSyntheticEpilogue: true,
      epilogueLabel: '__zax_epilogue_0',
      emitJumpTo: (label) => {
        events.push(`jmp:${label}`);
      },
      emitJumpCondTo: (opcode, label) => {
        events.push(`jmpcc:${opcode.toString(16)}:${label}`);
      },
      syncToFlow: () => {
        events.push(`sync:${flow.reachable ? 'reach' : 'dead'}`);
      },
      flowRef: { current: flow },
    });

    const jrItem: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'jr',
      operands: [{ kind: 'Imm', span, expr: { kind: 'ImmName', span, name: 'Loop' } }],
    };
    const retItem: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'ret',
      operands: [{ kind: 'Reg', span, name: 'nz' }],
    };
    const ldItem: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'ld',
      operands: [
        { kind: 'Reg', span, name: 'HL' },
        { kind: 'Imm', span, expr: { kind: 'ImmName', span, name: 'Target' } },
      ] satisfies AsmOperandNode[],
    };

    helper.lowerAsmInstructionDispatcher(jrItem);
    flow.reachable = true;
    helper.lowerAsmInstructionDispatcher(retItem);
    helper.lowerAsmInstructionDispatcher(ldItem);

    expect(events).toContain('rel:18:loop:0:jr');
    expect(events).toContain('jmpcc:c2:__zax_epilogue_0');
    expect(events).toContain('abs:21:target:0');
  });
});
