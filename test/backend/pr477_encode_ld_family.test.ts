import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { encodeInstruction } from '../../src/z80/encode.js';
import { encoderEnv as env, imm, instruction, memName, reg } from './encoderTestHelpers.js';

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
