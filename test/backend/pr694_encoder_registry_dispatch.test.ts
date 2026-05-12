import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { getEncoderRegistryEntry } from '../../src/z80/encoderRegistry.js';
import { encodeInstruction } from '../../src/z80/encode.js';

const span: SourceSpan = {
  file: 'pr694_encoder_registry_dispatch.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const env = {
  consts: new Map<string, number>(),
  enums: new Map<string, number>(),
  types: new Map(),
};

function instruction(head: string, operands: AsmOperandNode[]): AsmInstructionNode {
  return { kind: 'AsmInstruction', span, head, operands };
}

function reg(name: string): AsmOperandNode {
  return { kind: 'Reg', span, name };
}

function imm(value: number): AsmOperandNode {
  return { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value } };
}

describe('PR694 encoder registry dispatch', () => {
  it('registers representative zero-op and family handlers by mnemonic', () => {
    expect(getEncoderRegistryEntry('nop')).toMatchObject({
      kind: 'zero',
    });
    expect(getEncoderRegistryEntry('add')).toMatchObject({
      kind: 'family',
      family: 'alu',
      fallback: 'standard',
    });
    expect(getEncoderRegistryEntry('ld')).toMatchObject({
      kind: 'family',
      family: 'ld',
      fallback: 'none',
    });
    expect(getEncoderRegistryEntry('bit')).toMatchObject({
      kind: 'family',
      family: 'bit',
      fallback: 'arity-short-circuit',
    });
    expect(getEncoderRegistryEntry('totally_unknown')).toBeUndefined();
  });

  it('keeps registry fallback diagnostics stable for unknown, zero-op arity, and family arity', () => {
    const diagnostics: Diagnostic[] = [];

    const noOperandOpcode = encodeInstruction(instruction('ldi', []), env, diagnostics);
    expect(Array.from(noOperandOpcode ?? [])).toEqual([0xed, 0xa0]);

    const zeroArityError = encodeInstruction(instruction('ldi', [reg('A')]), env, diagnostics);
    expect(zeroArityError).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      message: 'ldi expects no operands',
    });

    const familyArityError = encodeInstruction(
      instruction('add', [reg('A'), reg('B'), reg('C')]),
      env,
      diagnostics,
    );
    expect(familyArityError).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      message: 'add expects two operands',
    });

    const unknown = encodeInstruction(instruction('bogus_op', [imm(1)]), env, diagnostics);
    expect(unknown).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      message: 'Unsupported instruction: bogus_op',
    });
  });
});
