import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { encodeInstruction } from '../../src/z80/encode.js';

const span: SourceSpan = {
  file: 'pr477_encode_bitops_family.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
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

function memName(name: string): AsmOperandNode {
  return { kind: 'Mem', span, expr: { kind: 'EaName', span, name } };
}

const env = {
  consts: new Map<string, number>(),
  enums: new Map<string, number>(),
  types: new Map(),
};

describe('PR477 bit/rotate encoder family extraction', () => {
  it('preserves representative bit and rotate encodings through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    expect(
      Array.from(encodeInstruction(instruction('bit', [imm(3), reg('A')]), env, diagnostics) ?? []),
    ).toEqual([0xcb, 0x5f]);
    expect(
      Array.from(
        encodeInstruction(instruction('res', [imm(2), memName('HL')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0xcb, 0x96]);
    expect(
      Array.from(encodeInstruction(instruction('rlc', [reg('B')]), env, diagnostics) ?? []),
    ).toEqual([0xcb, 0x00]);
    expect(
      Array.from(encodeInstruction(instruction('sra', [memName('HL')]), env, diagnostics) ?? []),
    ).toEqual([0xcb, 0x2e]);

    expect(diagnostics).toEqual([]);
  });

  it('preserves representative bit-op diagnostics through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    const encoded = encodeInstruction(instruction('bit', [imm(8), reg('A')]), env, diagnostics);

    expect(encoded).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      messageIncludes: 'bit index 0..7',
    });
  });
});
