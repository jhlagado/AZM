import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile, defaultFormatWriters } from '../../src/api-compile.js';
import { compileSource } from '../../src/core/compile.js';

describe('multi-instruction physical lines', () => {
  it('assembles backslash-separated instruction chains as consecutive instructions', () => {
    const result = compileSource('main: ld a,b \\ inc a \\ ret\n');

    expect(result.diagnostics).toEqual([]);
    expect([...result.bytes]).toEqual([0x78, 0x3c, 0xc9]);
    expect(result.symbols.main).toBe(0);
  });

  it('keeps semicolon text as a comment rather than a chained instruction', () => {
    const result = compileSource('main: ld a,b; inc a\n');

    expect(result.diagnostics).toEqual([]);
    expect([...result.bytes]).toEqual([0x78]);
  });

  it('does not split readable backslashes inside quoted byte operands', () => {
    const result = compileSource('main: ld a,"\\\\" \\ ret\n');

    expect(result.diagnostics).toEqual([]);
    expect([...result.bytes]).toEqual([0x3e, 0x5c, 0xc9]);
  });

  it('rejects directives and later labels in instruction chains', () => {
    const firstDirective = compileSource('.org $8000 \\ ld a,0\n');
    const directive = compileSource('main: ld a,b \\ .db 1\n');
    const label = compileSource('main: ld a,b \\ next: inc a\n');

    expect(firstDirective.diagnostics).toHaveDiagnostic({
      code: 'AZMN_PARSE',
      severity: 'error',
      messageIncludes: 'directives must be on their own line',
      line: 1,
      column: 1,
    });
    expect(directive.diagnostics).toHaveDiagnostic({
      code: 'AZMN_PARSE',
      severity: 'error',
      messageIncludes: 'directives must be on their own line',
      line: 1,
      column: 16,
    });
    expect(label.diagnostics).toHaveDiagnostic({
      code: 'AZMN_PARSE',
      severity: 'error',
      messageIncludes: 'labels are only allowed before the first chained instruction',
      line: 1,
      column: 16,
    });
  });

  it('rejects empty chain segments', () => {
    const result = compileSource('main: ld a,b \\  \\ ret\n');

    expect(result.diagnostics).toHaveDiagnostic({
      code: 'AZMN_PARSE',
      severity: 'error',
      messageIncludes: 'empty instruction segment in chained line',
      line: 1,
      column: 15,
    });
  });

  it('keeps chain diagnostics ordered before later segment diagnostics', () => {
    const result = compileSource(
      [
        'op onlyA(dst A)',
        '  xor a',
        'end',
        'main: ld a,b \\  \\ onlyA b',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({
        code: 'AZMN_PARSE',
        message: 'empty instruction segment in chained line',
        line: 4,
        column: 15,
      }),
    );
    expect(result.diagnostics[1]).toEqual(
      expect.objectContaining({
        code: 'AZMN_PARSE',
        message: expect.stringContaining('No matching op overload for "onlyA"'),
        line: 4,
        column: 19,
      }),
    );
  });

  it('expands op invocations used as chained segments', () => {
    const result = compileSource(
      [
        'op clearA()',
        '  xor a',
        'end',
        'main: clearA \\ ret',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toEqual([]);
    expect([...result.bytes]).toEqual([0xaf, 0xc9]);
  });

  it('supports chained instruction templates inside op bodies', () => {
    const result = compileSource(
      [
        'op copyThenReturn()',
        '  ld a,b \\ ret',
        'end',
        'main:',
        '  copyThenReturn',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toEqual([]);
    expect([...result.bytes]).toEqual([0x78, 0xc9]);
  });

  it('supports a first label before a chained op invocation inside op bodies', () => {
    const result = compileSource(
      [
        'op clear_a()',
        '  xor a',
        'end',
        'op labeled_clear()',
        'local: clear_a \\ ret',
        'end',
        'main:',
        '  labeled_clear',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toEqual([]);
    expect([...result.bytes]).toEqual([0xaf, 0xc9]);
  });

  it('rejects directives after a first label inside op-body chains', () => {
    const result = compileSource(
      [
        'op bad()',
        'local: .db 1 \\ ret',
        'end',
        'main:',
        '  bad',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toHaveDiagnostic({
      code: 'AZMN_PARSE',
      severity: 'error',
      messageIncludes: 'directives must be on their own line',
      line: 2,
      column: 8,
    });
  });

  it('rejects later labels inside op-body chains', () => {
    const result = compileSource(
      [
        'op bad()',
        '  ld a,b \\ later: ret',
        'end',
        'main:',
        '  bad',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toHaveDiagnostic({
      code: 'AZMN_PARSE',
      severity: 'error',
      messageIncludes: 'labels are only allowed before the first chained instruction',
      line: 2,
      column: 12,
    });
  });

  it('rejects empty segments inside op-body chains', () => {
    const result = compileSource(
      [
        'op bad()',
        '  ld a,b \\  \\ ret',
        'end',
        'main:',
        '  bad',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toHaveDiagnostic({
      code: 'AZMN_PARSE',
      severity: 'error',
      messageIncludes: 'empty instruction segment in chained line',
      line: 2,
      column: 11,
    });
  });

  it('preserves per-segment columns in D8 source maps', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-chain-d8-'));
    try {
      const entry = join(work, 'main.asm');
      await writeFile(entry, 'main: ld a,b \\ inc a \\ ret\n', 'utf8');

      const result = await compile(
        entry,
        { sourceRoot: work, emitAsm80: false },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
      expect(d8m?.kind).toBe('d8m');
      const segments = d8m?.kind === 'd8m' ? d8m.json.files['main.asm']?.segments ?? [] : [];
      expect(segments).toEqual([
        expect.objectContaining({ start: 0, end: 1, line: 1, column: 7 }),
        expect.objectContaining({ start: 1, end: 2, line: 1, column: 16 }),
        expect.objectContaining({ start: 2, end: 3, line: 1, column: 24 }),
      ]);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('case-style lint checks each chained instruction segment', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-chain-case-style-'));
    try {
      const entry = join(work, 'main.asm');
      await writeFile(entry, 'main: LD A,B \\ inc c \\ RET\n', 'utf8');

      const result = await compile(
        entry,
        { caseStyle: 'upper', emitBin: false, emitHex: false, emitD8m: false, emitAsm80: false },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toHaveDiagnostic({
        code: 'AZMN_CASE_STYLE',
        severity: 'warning',
        messageIncludes: 'mnemonic "inc" should be uppercase',
        column: 16,
      });
      expect(result.diagnostics).toHaveDiagnostic({
        code: 'AZMN_CASE_STYLE',
        severity: 'warning',
        messageIncludes: 'register "c" should be uppercase',
        column: 20,
      });
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
