import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { encodeInstruction } from '../../src/z80/encode.js';
import { encoderEnv as env, imm, instruction, memName, reg } from './encoderTestHelpers.js';

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
