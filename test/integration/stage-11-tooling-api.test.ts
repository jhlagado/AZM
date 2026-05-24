import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeProgram,
  analyzeProgramNext,
  loadProgram,
  loadProgramNext,
} from '../../src/index.js';

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('stage 11 tooling API', () => {
  it('loads preloaded entry text through the programming API without reading the entry file', async () => {
    await withTempDir('azm-next-tooling-preload-', async (dir) => {
      const entry = join(dir, 'nested', '..', 'unsaved.asm');
      const normalizedEntry = normalize(entry);
      const result = await loadProgramNext({
        entryFile: entry,
        preloadedText: 'main:\n  ld a,$2a\n  ret\n',
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.loadedProgram?.program.kind).toBe('Program');
      expect(result.loadedProgram?.program.entryFile).toBe(normalizedEntry);
      expect(result.loadedProgram?.program.files[0].name).toBe(normalizedEntry);
      expect(result.loadedProgram?.program.files).toHaveLength(1);
      expect(result.loadedProgram?.sourceTexts.get(normalizedEntry)).toBe(
        'main:\n  ld a,$2a\n  ret\n',
      );
      expect(result.loadedProgram?.sourceLineComments.size).toBe(0);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ main: 0 });

      const stableNameResult = await loadProgram({
        entryFile: entry,
        preloadedText: 'main:\n  ret\n',
      });
      expect(analyzeProgram(stableNameResult.loadedProgram!).diagnostics).toEqual([]);
    });
  });

  it('expands quoted includes through explicit include directories and preserves child provenance', async () => {
    await withTempDir('azm-next-tooling-include-', async (dir) => {
      const includes = join(dir, 'includes');
      const entry = join(dir, 'main.asm');
      const child = join(includes, 'values.inc');
      await mkdir(includes);
      await writeFile(entry, '.org $4000\n.include "values.inc"\nmain:\n  ld a,VALUE\n', 'utf8');
      await writeFile(child, 'VALUE EQU $2a ; exported value\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry, includeDirs: [includes] });

      expect(result.diagnostics).toEqual([]);
      expect(result.loadedProgram?.sourceTexts.get(entry)).toContain('.include "values.inc"');
      expect(result.loadedProgram?.sourceTexts.get(child)).toBe('VALUE EQU $2a ; exported value\n');
      expect(result.loadedProgram?.sourceLineComments.get(child)?.get(1)).toBe('exported value');
      expect(result.loadedProgram?.program.files[0]?.items.map((item) => item.kind)).toEqual([
        'org',
        'equ',
        'comment',
        'label',
        'instruction',
      ]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ VALUE: 0x2a, main: 0x4000 });
    });
  });

  it('reports included-file parse diagnostics at the included file location', async () => {
    await withTempDir('azm-next-tooling-include-error-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const child = join(dir, 'bad.inc');
      await writeFile(entry, '.include "bad.inc"\nmain:\n  ret\n', 'utf8');
      await writeFile(child, '???\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.loadedProgram).toBeDefined();
      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_PARSE',
          message: 'unsupported source line: ???',
          sourceName: child,
          line: 1,
          column: 1,
        },
      ]);
    });
  });

  it('rejects unsupported entry extensions through the programming API', async () => {
    await withTempDir('azm-next-tooling-extension-', async (dir) => {
      const entry = join(dir, 'main.txt');
      await writeFile(entry, 'main:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.loadedProgram).toBeUndefined();
      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SOURCE',
          message: 'unsupported source file extension (expected .asm or .z80)',
          sourceName: entry,
        },
      ]);
    });
  });

  it('emits case-style warnings from tooling analysis', async () => {
    await withTempDir('azm-next-tooling-case-style-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, ['main:', '  ld a, 1', '  ret', ''].join('\n'), 'utf8');

      const loaded = await loadProgram({ entryFile: entry });
      expect(loaded.diagnostics).toEqual([]);
      expect(loaded.loadedProgram).toBeDefined();

      const analysis = analyzeProgram(loaded.loadedProgram!, { caseStyle: 'upper' });
      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: mnemonic "ld" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: register "a" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: mnemonic "ret" should be uppercase under --case-style=upper.',
        }),
      ]);
    });
  });
});
