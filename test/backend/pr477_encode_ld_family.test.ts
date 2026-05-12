import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { encodeInstruction } from '../../src/z80/encode.js';

const span: SourceSpan = {
  file: 'pr477_encode_ld_family.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const env = {
  consts: new Map<string, number>(),
  enums: new Map<string, number>(),
  types: new Map(),
};

function reg(name: string): AsmOperandNode {
  return { kind: 'Reg', span, name };
}

function imm(value: number): AsmOperandNode {
  return { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value } };
}

function memName(name: string): AsmOperandNode {
  return { kind: 'Mem', span, expr: { kind: 'EaName', span, name } };
}

function instruction(head: string, operands: AsmOperandNode[]): AsmInstructionNode {
  return { kind: 'AsmInstruction', span, head, operands };
}

describe('PR477 ld encoder family extraction', () => {
  it('preserves representative ld encodings through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    expect(
      Array.from(
        encodeInstruction(instruction('ld', [reg('BC'), imm(0x1234)]), env, diagnostics) ?? [],
      ),
    ).toEqual([0x01, 0x34, 0x12]);
    expect(
      Array.from(
        encodeInstruction(instruction('ld', [memName('HL'), reg('A')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0x77]);
    expect(
      Array.from(
        encodeInstruction(instruction('ld', [reg('A'), memName('DE')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0x1a]);
    expect(
      Array.from(
        encodeInstruction(instruction('ld', [reg('IXH'), reg('A')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0xdd, 0x67]);

    expect(diagnostics).toEqual([]);
  });

  it('preserves ld diagnostics for unsupported forms', () => {
    const diagnostics: Diagnostic[] = [];
    const encoded = encodeInstruction(
      instruction('ld', [memName('HL'), memName('DE')]),
      env,
      diagnostics,
    );

    expect(encoded).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      messageIncludes: 'memory-to-memory',
    });
  });
});
