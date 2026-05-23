import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { encodeInstruction } from '../../src/z80/encode.js';
import { encoderEnv as env, imm, instruction, memName, reg } from './encoderTestHelpers.js';

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
