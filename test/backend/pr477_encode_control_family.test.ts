import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { encodeInstruction } from '../../src/z80/encode.js';

const span: SourceSpan = {
  file: 'pr477_encode_control_family.zax',
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
  consts: new Map(),
  enums: new Map(),
  types: new Map(),
};

describe('PR477 control encoder family extraction', () => {
  it('preserves representative control-flow encodings through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    expect(Array.from(encodeInstruction(instruction('ret', []), env, diagnostics) ?? [])).toEqual([
      0xc9,
    ]);
    expect(
      Array.from(encodeInstruction(instruction('call', [imm(0x1234)]), env, diagnostics) ?? []),
    ).toEqual([0xcd, 0x34, 0x12]);
    expect(
      Array.from(encodeInstruction(instruction('jp', [memName('IX')]), env, diagnostics) ?? []),
    ).toEqual([0xdd, 0xe9]);
    expect(
      Array.from(
        encodeInstruction(instruction('jr', [reg('NZ'), imm(-2)]), env, diagnostics) ?? [],
      ),
    ).toEqual([0x20, 0xfe]);

    expect(diagnostics).toHaveLength(0);
  });

  it('preserves representative control-flow diagnostics through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    const encoded = encodeInstruction(instruction('jp', [reg('HL')]), env, diagnostics);

    expect(encoded).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      messageIncludes: 'requires parentheses',
    });
  });
});
