import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { runCli } from '../helpers/cli.js';
import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { loadProgram } from '../../src/api-tooling.js';

describe('cli source extension surface', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('rejects unsupported entry extensions', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-entry-ext-unsupported-'));
    const entry = join(work, 'main.foo');
    await writeFile(entry, 'main:\n  nop\n', 'utf8');

    try {
      const res = await runCli(['--nobin', '--nod8m', '--nolist', entry]);

      expect(res.code).toBe(2);
      expect(res.stderr).toContain('Unsupported entry extension ".foo"');

      const help = await runCli(['--help']);
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('<entry.asm|entry.z80>');
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('rejects unsupported entry extensions instead of treating them as ZAX', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-source-ext-'));
    const entry = join(work, 'main.txt');
    await writeFile(entry, 'main:\n  nop\n', 'utf8');

    try {
      const res = await runCli(['--nobin', '--nod8m', '--nolist', entry]);

      expect(res.code).toBe(2);
      expect(res.stdout).toBe('');
      expect(res.stderr).toContain('Unsupported entry extension ".txt"');
      expect(res.stderr).toContain('expected .asm, .z80');
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('uses current wording for unsupported programmatic source extensions', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-api-source-ext-'));
    const entry = join(work, 'main.txt');
    await writeFile(entry, 'main:\n  ret\n', 'utf8');

    try {
      const compiled = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(compiled.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'Unsupported source file extension (expected .asm or .z80)',
        }),
      );

      const loaded = await loadProgram({ entryFile: entry });
      expect(loaded.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'Unsupported source file extension (expected .asm or .z80)',
        }),
      );
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
