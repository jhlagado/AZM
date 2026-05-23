import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { encodeInstruction } from '../../src/z80/encode.js';
import { encoderEnv as env, imm, instruction, portC, portImm, reg } from './encoderTestHelpers.js';

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
