import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RegisterContractsAnnotationsArtifact } from '../../src/outputs/types.js';
import { describe, expect, it } from 'vitest';

import { compile, defaultFormatWriters } from '../../src/index.js';

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('stage 14 register-contracts compile API slice', () => {
  it('returns an error diagnostic for .asmi interface extension mismatch', async () => {
    await withTempDir('azm-next-regcontracts-compile-ext-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'lib.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      await writeFile(iface, ['extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

      const result = await compile(
        entry,
        {
          registerContractsInterfaces: [iface],
          emitRegisterReport: true,
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_REGISTER_CONTRACTS',
          message: 'Register contracts interface files must use the .asmi extension',
          sourceName: iface,
        },
      ]);
      expect(result.artifacts).toEqual([]);
    });
  });

  it('throws on malformed --accept-out values before assembly', async () => {
    await withTempDir('azm-next-regcontracts-compile-accept-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');

      await expect(
        compile(
          entry,
          {
            acceptRegisterOutputCandidates: ['MASK:A,'],
            registerContracts: 'audit',
          },
          { formats: defaultFormatWriters },
        ),
      ).rejects.toThrow('Invalid --accept-out value "MASK:A,"');
    });
  });

  it('throws on malformed interface contract lines', async () => {
    await withTempDir('azm-next-regcontracts-compile-interface-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'lib.asmi');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      await writeFile(iface, ['extern MON', 'clobbers A, Q', 'end'].join('\n'), 'utf8');

      await expect(
        compile(
          entry,
          {
            registerContracts: 'audit',
            registerContractsInterfaces: [iface],
            emitRegisterInterface: true,
          },
          { formats: defaultFormatWriters },
        ),
      ).rejects.toThrow('invalid register contracts interface line "clobbers A, Q"');
    });
  });

  it('emits register-contracts annotation artifacts when requested', async () => {
    await withTempDir('azm-next-regcontracts-compile-annotations-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'mon3.asmi');
      await writeFile(
        entry,
        [
          'START:',
          '    call MASK',
          '    ret',
          '',
          '; Helper prose.',
          'MASK:',
          '    ld a, $80',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );
      await writeFile(iface, ['extern MASK', 'out A', 'end'].join('\n'), 'utf8');

      const result = await compile(
        entry,
        {
          registerContracts: 'audit',
          emitRegisterAnnotations: true,
          registerContractsInterfaces: [iface],
          registerContractsProfile: 'mon3',
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toHaveLength(0);
      const annotations = result.artifacts.find(
        (artifact): artifact is RegisterContractsAnnotationsArtifact =>
          artifact.kind === 'register-contracts-annotations',
      );
      expect(annotations).toBeDefined();
      const annotationArtifact = annotations!;
      expect(annotationArtifact).toMatchObject({
        kind: 'register-contracts-annotations',
      });
      expect(annotationArtifact.files).toHaveLength(1);
      expect(annotationArtifact.files[0]!.path).toBe(entry);
      expect(annotationArtifact.files[0]!.text).toContain(
        ['; Helper prose.', ';!      out       A'].join('\n'),
      );
      expect(annotationArtifact.files[0]!.text).toContain(';!      out       A');
      expect(annotationArtifact.files[0]!.text).toContain('MASK:');

      const onDisk = await readFile(entry, 'utf8');
      expect(onDisk).toContain('MASK:');
      expect(onDisk).not.toContain(';!      out       A');
    });
  });

  it('inserts expects-out hints under --fix for direct continuation reads', async () => {
    await withTempDir('azm-next-regcontracts-compile-fix-direct-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    ld a,3',
          '    ld hl,$2000',
          '    call MASK',
          '    ld d,a',
          '',
          '; Helper prose.',
          'MASK:',
          '    ld a,$80',
          '    ld (hl),a',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'audit',
          emitRegisterAnnotations: true,
          fixRegisterContracts: true,
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toHaveLength(0);
      const annotations = result.artifacts.find(
        (artifact): artifact is RegisterContractsAnnotationsArtifact =>
          artifact.kind === 'register-contracts-annotations',
      );
      expect(annotations).toBeDefined();
      const text = annotations!.files[0]!.text;
      expect(text).toContain('; expects out A');
      expect(text).toContain('    call MASK');
      expect(text).toContain('; Helper prose.');
      expect(text).toContain(';!      maybe-out A');
    });
  });

  it('inserts expects-out hints under --fix when continuation reads are control-flow reachable', async () => {
    await withTempDir('azm-next-regcontracts-compile-fix-indirect-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    ld hl,$2000',
          '    call MASK',
          '    inc b',
          '    ld d,a',
          '',
          '; Helper prose.',
          'MASK:',
          '    ld a,$80',
          '    ld (hl),a',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'audit',
          emitRegisterAnnotations: true,
          fixRegisterContracts: true,
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toHaveLength(0);
      const annotations = result.artifacts.find(
        (artifact): artifact is RegisterContractsAnnotationsArtifact =>
          artifact.kind === 'register-contracts-annotations',
      );
      expect(annotations).toBeDefined();
      const text = annotations!.files[0]!.text;
      expect(text).toContain('; expects out A');
      expect(text).toContain('    call MASK');
      expect(text).toContain('; Helper prose.');
    });
  });

  it('promotes accepted output candidates to annotations', async () => {
    await withTempDir('azm-next-regcontracts-compile-accept-annotations-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    call MASK',
          '    ret',
          '',
          '; Helper prose.',
          'MASK:',
          '    ld a, $80',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'audit',
          emitRegisterAnnotations: true,
          acceptRegisterOutputCandidates: ['MASK:A'],
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toHaveLength(0);
      const annotations = result.artifacts.find(
        (artifact): artifact is RegisterContractsAnnotationsArtifact =>
          artifact.kind === 'register-contracts-annotations',
      );
      expect(annotations).toBeDefined();
      const annotationArtifact = annotations!;
      expect(annotationArtifact.files).toHaveLength(1);
      expect(annotationArtifact.files[0]!.text).toContain(';!      out       A');
    });
  });

  it('reports direct-call conflicts as warnings in warn mode', async () => {
    await withTempDir('azm-next-regcontracts-compile-warn-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    ld de,$1000',
          '    call HELPER',
          '    inc de',
          '    ret',
          '',
          'HELPER:',
          '    ld de,$2000',
          '    ld (de),a',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'warn',
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'warning',
            message: expect.stringContaining('CALL HELPER may modify D,E'),
          }),
        ]),
      );
    });
  });

  it('reports direct-call conflicts as errors in error mode', async () => {
    await withTempDir('azm-next-regcontracts-compile-error-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    ld de,$1000',
          '    call HELPER',
          '    inc de',
          '    ret',
          '',
          'HELPER:',
          '    ld de,$2000',
          '    ld (de),a',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'error',
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'error',
            message: expect.stringContaining('CALL HELPER may modify D,E'),
          }),
        ]),
      );
    });
  });

  it('reports strict-mode unknown boundaries and unknown call list in report', async () => {
    await withTempDir('azm-next-regcontracts-compile-unknown-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        ['START:', '    call MISSING_HELPER', '    ret', '.end'].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'strict',
          emitRegisterReport: true,
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'error',
            message: expect.stringContaining('MISSING_HELPER'),
          }),
        ]),
      );

      const report = result.artifacts.find(
        (artifact) => artifact.kind === 'register-contracts-report',
      );
      expect(report?.text).toContain('Unknown calls:');
      expect(report?.text).toContain('MISSING_HELPER');
    });
  });

  it('uses interface contracts for known external call targets', async () => {
    await withTempDir('azm-next-regcontracts-compile-external-contract-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'runtime.asmi');
      await writeFile(iface, ['extern HELPER', 'clobbers DE', 'end'].join('\n'), 'utf8');
      await writeFile(
        entry,
        ['START:', '    ld de,$1000', '    call HELPER', '    inc de', '    ret', '.end'].join(
          '\n',
        ),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'warn',
          registerContractsInterfaces: [iface],
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'warning',
            message: expect.stringContaining('CALL HELPER may modify D,E'),
          }),
        ]),
      );
      expect(result.diagnostics).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Register contracts cannot prove HELPER'),
          }),
        ]),
      );
    });
  });

  it('uses mon3 register-contracts profile for RST service boundaries', async () => {
    await withTempDir('azm-next-regcontracts-compile-rst-service-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'API_SCANKEYS:',
          'START:',
          '  ld a, $12',
          '  ld c, API_SCANKEYS',
          '  rst $10',
          '  ld b, a',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'warn',
          registerContractsProfile: 'mon3',
          emitRegisterReport: true,
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual([]);
      const report = result.artifacts.find(
        (artifact) => artifact.kind === 'register-contracts-report',
      );
      expect(report?.text).toContain('Profile: mon3');
      expect(report?.text).toContain('Output candidates:');
      expect(report).toBeDefined();
    });
  });

  it('uses mon3 dispatcher service contracts for numeric RST $10 API selectors', async () => {
    await withTempDir('azm-next-regcontracts-compile-rst-api-number-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '  ld c,18',
          '  rst $10',
          '  ld c,54',
          '  rst $10',
          '  jr nc,START',
          '  cp 13',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'warn',
          registerContractsProfile: 'mon3',
          emitRegisterReport: true,
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual([]);
      const report = result.artifacts.find(
        (artifact) => artifact.kind === 'register-contracts-report',
      );
      expect(report?.text).toContain('MON3_API_54_PARSE_MATRIX_SCAN');
    });
  });

  it('constant-folds mon3 dispatcher API selectors from equates', async () => {
    await withTempDir('azm-next-regcontracts-compile-rst-api-equate-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'API_BASE .equ 0',
          'API_MATRIX_SCAN .equ API_BASE + 18',
          'API_PARSE_MATRIX_SCAN .equ API_BASE + 54',
          'START:',
          '  ld c,API_MATRIX_SCAN',
          '  rst $10',
          '  ld c,API_PARSE_MATRIX_SCAN',
          '  rst $10',
          '  jr nc,START',
          '  cp 13',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'error',
          registerContractsProfile: 'mon3',
          emitRegisterReport: true,
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual([]);
      const report = result.artifacts.find(
        (artifact) => artifact.kind === 'register-contracts-report',
      );
      expect(report?.text).toContain('MON3_API_18_MATRIX_SCAN');
      expect(report?.text).toContain('MON3_API_54_PARSE_MATRIX_SCAN');
    });
  });

  it('uses mon3 dispatcher contracts for LCD APIs that preserve caller flags', async () => {
    await withTempDir('azm-next-regcontracts-compile-rst-lcd-api-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'API_COMMAND_TO_LCD .equ 15',
          'API_CHAR_TO_LCD .equ 14',
          'START:',
          '  cp 13',
          '  jr z,ShowReturn',
          'ShowAscii:',
          '  ld b,1',
          '  ld c,API_COMMAND_TO_LCD',
          '  rst $10',
          '  ld c,API_CHAR_TO_LCD',
          '  rst $10',
          '  ret',
          'ShowReturn:',
          "  ld a,'R'",
          '  jr ShowAscii',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'warn',
          registerContractsProfile: 'mon3',
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual([]);
    });
  });

  it('accepts the mon3 matrix keyboard dispatcher flow', async () => {
    await withTempDir('azm-next-regcontracts-compile-matrix-flow-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'API_MATRIX_SCAN .equ 18',
          'API_PARSE_MATRIX_SCAN .equ 54',
          'API_COMMAND_TO_LCD .equ 15',
          'API_CHAR_TO_LCD .equ 14',
          'ASCII_CR .equ 13',
          'ASCII_ESC .equ 27',
          'START:',
          'PollMatrix:',
          '  ld c,API_MATRIX_SCAN',
          '  rst $10',
          '  ld c,API_PARSE_MATRIX_SCAN',
          '  rst $10',
          '  jr nc,PollMatrix',
          '  cp ASCII_CR',
          '  jr z,ShowReturn',
          '  cp ASCII_ESC',
          '  jr z,ShowEscape',
          'ShowAscii:',
          '  ld b,1',
          '  ld c,API_COMMAND_TO_LCD',
          '  rst $10',
          '  ld c,API_CHAR_TO_LCD',
          '  rst $10',
          '  jr PollMatrix',
          'ShowReturn:',
          "  ld a,'R'",
          '  jr ShowAscii',
          'ShowEscape:',
          "  ld a,'E'",
          '  jr ShowAscii',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'warn',
          registerContractsProfile: 'mon3',
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual([]);
    });
  });

  it('falls back to generic RST boundary for mon3 when no service is declared', async () => {
    await withTempDir('azm-next-regcontracts-compile-rst-generic-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        ['START:', '  ld a, $12', '  rst $10', '  inc a', '.end'].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'warn',
          registerContractsProfile: 'mon3',
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'warning',
            message: expect.stringContaining('RST_$10 may modify A'),
          }),
        ]),
      );
    });
  });

  it('falls back to generic RST boundary when the mon3 selector value is unknown', async () => {
    await withTempDir('azm-next-regcontracts-compile-rst-unknown-selector-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        ['START:', '  ld a,$12', '  ld c,a', '  rst $10', '  inc a', '.end'].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerContracts: 'warn',
          registerContractsProfile: 'mon3',
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'warning',
            message: expect.stringContaining('RST_$10 may modify A'),
          }),
        ]),
      );
    });
  });
});
