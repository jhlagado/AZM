import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { encodeInstruction } from '../../src/z80/encode.js';

const span: SourceSpan = {
  file: 'pr477_encode_alu_family.zax',
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

describe('PR477 alu encoder family extraction', () => {
  it('preserves representative arithmetic and logic encodings through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    expect(
      Array.from(
        encodeInstruction(instruction('add', [reg('A'), reg('B')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0x80]);
    expect(
      Array.from(
        encodeInstruction(instruction('add', [reg('HL'), reg('SP')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0x39]);
    expect(
      Array.from(
        encodeInstruction(instruction('adc', [reg('HL'), reg('DE')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0xed, 0x5a]);
    expect(
      Array.from(encodeInstruction(instruction('xor', [imm(0x12)]), env, diagnostics) ?? []),
    ).toEqual([0xee, 0x12]);
    expect(
      Array.from(
        encodeInstruction(instruction('sub', [reg('A'), memName('HL')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0x96]);

    expect(diagnostics).toEqual([]);
  });

  it('preserves representative alu diagnostics through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    const encoded = encodeInstruction(instruction('adc', [reg('BC'), reg('DE')]), env, diagnostics);

    expect(encoded).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      messageIncludes: 'destination A or HL',
    });
  });
});
