import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { encodeInstruction } from '../../src/z80/encode.js';
import { encoderEnv as env, instruction, memName, reg } from './encoderTestHelpers.js';

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
