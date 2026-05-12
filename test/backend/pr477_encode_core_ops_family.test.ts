import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { encodeInstruction } from '../../src/z80/encode.js';

const span: SourceSpan = {
  file: 'pr477_encode_core_ops_family.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function instruction(head: string, operands: AsmOperandNode[]): AsmInstructionNode {
  return { kind: 'AsmInstruction', span, head, operands };
}

function reg(name: string): AsmOperandNode {
  return { kind: 'Reg', span, name };
}

function memName(name: string): AsmOperandNode {
  return { kind: 'Mem', span, expr: { kind: 'EaName', span, name } };
}

const env = {
  consts: new Map<string, number>(),
  enums: new Map<string, number>(),
  types: new Map(),
};

describe('PR477 core-ops encoder family extraction', () => {
  it('preserves representative core op encodings through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    expect(
      Array.from(encodeInstruction(instruction('inc', [reg('IXL')]), env, diagnostics) ?? []),
    ).toEqual([0xdd, 0x2c]);
    expect(
      Array.from(encodeInstruction(instruction('dec', [memName('HL')]), env, diagnostics) ?? []),
    ).toEqual([0x35]);
    expect(
      Array.from(encodeInstruction(instruction('push', [reg('IY')]), env, diagnostics) ?? []),
    ).toEqual([0xfd, 0xe5]);
    expect(
      Array.from(encodeInstruction(instruction('pop', [reg('BC')]), env, diagnostics) ?? []),
    ).toEqual([0xc1]);
    expect(
      Array.from(
        encodeInstruction(instruction('ex', [memName('SP'), reg('IX')]), env, diagnostics) ?? [],
      ),
    ).toEqual([0xdd, 0xe3]);

    expect(diagnostics).toEqual([]);
  });

  it('preserves representative core op diagnostics through encodeInstruction', () => {
    const diagnostics: Diagnostic[] = [];

    const encoded = encodeInstruction(instruction('push', [memName('HL')]), env, diagnostics);

    expect(encoded).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      messageIncludes: 'push expects reg16',
    });
  });
});
