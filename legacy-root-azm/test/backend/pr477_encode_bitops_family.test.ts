import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { encodeInstruction } from '../../src/z80/encode.js';
import { encoderEnv as env, imm, instruction, memName, reg } from './encoderTestHelpers.js';

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
