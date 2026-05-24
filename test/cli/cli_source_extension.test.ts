import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from '../helpers/cli/build.js';
import { runCli } from '../helpers/cli/index.js';
import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { loadProgram } from '../../src/api-tooling.js';

async function withTempEntry<T>(
  prefix: string,
  entryName: string,
  source: string,
  fn: (entry: string) => Promise<T>,
): Promise<T> {
  const work = await mkdtemp(join(tmpdir(), prefix));
  const entry = join(work, entryName);
  await writeFile(entry, source, 'utf8');
  try {
    return await fn(entry);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

describe('cli source extension surface', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it.each([
    { ext: 'foo', expectsHelpProbe: true },
    { ext: 'txt', expectsHelpProbe: false },
  ])('rejects unsupported .$ext entry extensions', async ({ ext, expectsHelpProbe }) => {
    await withTempEntry(
      `azm-cli-source-ext-${ext}-`,
      `main.${ext}`,
      'main:\n  nop\n',
      async (entry) => {
        const res = await runCli(['--nobin', '--nod8m', '--nolist', entry]);
        expect(res.code).toBe(2);
        expect(res.stderr).toContain(`Unsupported entry extension ".${ext}"`);
        expect(res.stderr).toContain('expected .asm, .z80');

        if (expectsHelpProbe) {
          const help = await runCli(['--help']);
          expect(help.code).toBe(0);
          expect(help.stdout).toContain('<entry.asm|entry.z80>');
        } else {
          expect(res.stdout).toBe('');
        }
      },
    );
  });

  it.each(['azm', 'asmi'])('rejects .%s as a source extension', async (ext) => {
    await withTempEntry(
      `azm-cli-source-ext-${ext}-`,
      `main.${ext}`,
      'main:\n  nop\n',
      async (entry) => {
        const res = await runCli(['--nobin', '--nod8m', '--nolist', entry]);

        expect(res.code).toBe(2);
        expect(res.stdout).toBe('');
        expect(res.stderr).toContain(`Unsupported entry extension ".${ext}"`);
        expect(res.stderr).toContain('expected .asm, .z80');
      },
    );
  });

  it('uses current wording for unsupported programmatic source extensions', async () => {
    await withTempEntry('azm-api-source-ext-', 'main.txt', 'main:\n  ret\n', async (entry) => {
      const compiled = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(compiled.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'unsupported source file extension (expected .asm or .z80)',
        }),
      );

      const loaded = await loadProgram({ entryFile: entry });
      expect(loaded.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'unsupported source file extension (expected .asm or .z80)',
        }),
      );
    });
  });
});
