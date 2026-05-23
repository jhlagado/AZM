import { describe, expect, it } from 'vitest';

import { compileNextArtifacts, formatNextDiagnostic } from '../../src/index.js';

describe('stage 10 output artifacts', () => {
  const source = `
    .org $0100
    main:
      ld a,$2a
      ret
  `;

  it('returns deterministic in-memory BIN and HEX artifacts by default', () => {
    const result = compileNextArtifacts(source, { entryName: 'main.asm' });

    expect(result.diagnostics).toEqual([]);
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(['bin', 'hex']);

    const bin = result.artifacts.find((artifact) => artifact.kind === 'bin');
    const hex = result.artifacts.find((artifact) => artifact.kind === 'hex');
    expect(bin?.kind === 'bin' ? Array.from(bin.bytes) : []).toEqual([0x3e, 0x2a, 0xc9]);
    expect(hex?.kind === 'hex' ? hex.text : '').toBe(':030100003E2AC9CB\n:00000001FF\n');
  });

  it('honors HEX and BIN artifact suppression independently', () => {
    expect(compileNextArtifacts(source, { emitHex: false }).artifacts.map((a) => a.kind)).toEqual([
      'bin',
    ]);
    expect(compileNextArtifacts(source, { emitBin: false }).artifacts.map((a) => a.kind)).toEqual([
      'hex',
    ]);
  });

  it('returns no artifacts when diagnostics contain errors', () => {
    const result = compileNextArtifacts('ld a,UNKNOWN_SYMBOL\n', { entryName: 'broken.asm' });

    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'AZMN_SYMBOL',
        message: 'unknown symbol: UNKNOWN_SYMBOL',
        sourceName: 'broken.asm',
        line: 1,
        column: 1,
      },
    ]);
    expect(result.artifacts).toEqual([]);
  });

  it('formats diagnostics using the current CLI location/severity/code/message shape', () => {
    const result = compileNextArtifacts('???\n', { entryName: 'broken.asm' });

    expect(result.diagnostics).toHaveLength(1);
    expect(formatNextDiagnostic(result.diagnostics[0]!)).toBe(
      'broken.asm:1:1: error: [AZMN_PARSE] unsupported source line: ???',
    );
  });
});
