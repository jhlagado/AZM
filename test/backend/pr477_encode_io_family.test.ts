import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { encodeInstruction } from '../../src/z80/encode.js';

const span: SourceSpan = {
  file: 'pr477_encode_io_family.zax',
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

function portC(): AsmOperandNode {
  return { kind: 'PortC', span };
}

function portImm(value: number): AsmOperandNode {
  return { kind: 'PortImm8', span, expr: { kind: 'ImmLiteral', span, value } };
}

const env = {
  consts: new Map<string, number>(),
  enums: new Map<string, number>(),
  types: new Map(),
};

describe('PR477 io encoder family extraction', () => {
  it('preserves representative io encodings through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    expect(
      Array.from(encodeInstruction(instruction('rst', [imm(0x10)]), env, diagnostics) ?? []),
    ).toEqual([0xd7]);
    expect(
      Array.from(encodeInstruction(instruction('im', [imm(2)]), env, diagnostics) ?? []),
    ).toEqual([0xed, 0x5e]);
    expect(
      Array.from(
        encodeInstruction(instruction('in', [reg('A'), portImm(0x12)]), env, diagnostics) ?? [],
      ),
    ).toEqual([0xdb, 0x12]);
    expect(
      Array.from(
        encodeInstruction(instruction('out', [portC(), reg('B')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0xed, 0x41]);

    expect(diagnostics).toEqual([]);
  });

  it('preserves representative io diagnostics through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    const encoded = encodeInstruction(
      instruction('out', [portImm(0x12), reg('B')]),
      env,
      diagnostics,
    );

    expect(encoded).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      messageIncludes: 'requires source A',
    });
  });
});
