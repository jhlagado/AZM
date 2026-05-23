import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { binBytes, containsSubsequence } from '../test-helpers.js';
import { compileBackendFixture } from './isaDiagnosticTestHelpers.js';

describe('PR24 ISA core tranche', () => {
  it('encodes sub/cp/and/or/xor and rel8 branches', async () => {
    const res = await compileBackendFixture('pr24_isa_core.asm');
    expect(res.diagnostics).toEqual([]);
    expect(
      containsSubsequence(binBytes(res.artifacts), [
        0x06,
        0x02, // ld b,2
        0x3e,
        0x05, // ld a,5
        0x90, // sub a,b
        0xd6,
        0x01, // sub 1
        0xe6,
        0xf0, // and $f0
        0xb7, // or a
        0xee,
        0x55, // xor $55
        0xbe, // cp (hl)
        0x20,
        0x02, // jr nz,skip
        0x10,
        0x00, // djnz skip
        0x00, // nop
      ]),
    ).toBe(true);
  });

  it('diagnoses rel8 out-of-range label branches', async () => {
    const res = await compileBackendFixture('pr24_jr_label_out_of_range.asm');
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: 'out of range for rel8 branch',
    });
  });

  it('encodes backwards rel8 branch displacements', async () => {
    const res = await compileBackendFixture('pr24_rel8_backward.asm');
    expect(res.diagnostics).toEqual([]);
    expect(containsSubsequence(binBytes(res.artifacts), [0x10, 0xfe])).toBe(true);
  });
});
