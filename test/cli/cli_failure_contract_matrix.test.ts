import { beforeAll, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureCliBuilt } from '../helpers/cli/build.js';
import {
  exists,
  makeCliWorkDir,
  normalizePathForCompare,
  removeCliWorkDir,
  runCli,
} from '../helpers/cli/index.js';

async function expectNoArtifacts(workDir: string, stem: string): Promise<void> {
  expect(await exists(join(workDir, `${stem}.hex`))).toBe(false);
  expect(await exists(join(workDir, `${stem}.bin`))).toBe(false);
  expect(await exists(join(workDir, `${stem}.d8.json`))).toBe(false);
  expect(await exists(join(workDir, `${stem}.lst`))).toBe(false);
}

describe('cli failure contract matrix', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('returns code 1 for missing entry file and writes no artifacts', async () => {
    const work = await makeCliWorkDir('azm-cli-missing-entry-');
    const entry = join(work, 'missing.asm');
    const output = join(work, 'out.hex');

    const result = await runCli(['-o', output, entry]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('error: [AZMN_SOURCE]');
    expect(result.stderr).toContain('failed to read source file');
    expect(result.stderr).not.toContain('azm [options] <entry.asm|entry.z80>');
    await expectNoArtifacts(work, 'out');

    await removeCliWorkDir(work);
  });

  it('returns code 1 for source diagnostics and does not print usage text', async () => {
    const work = await makeCliWorkDir('azm-cli-source-diagnostic-');
    const entry = join(work, 'broken.asm');
    const output = join(work, 'out.hex');
    await writeFile(entry, '???\n', 'utf8');

    const result = await runCli(['-o', output, entry]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('error: [AZMN_PARSE]');
    expect(result.stderr).toContain('unsupported source line: ???');
    expect(result.stderr).not.toContain('azm [options] <entry.asm|entry.z80>');
    await expectNoArtifacts(work, 'out');

    await removeCliWorkDir(work);
  });

  it('returns code 1 for encoder diagnostics and writes no artifacts', async () => {
    const work = await makeCliWorkDir('azm-cli-encode-diagnostic-');
    const entry = join(work, 'broken.asm');
    const output = join(work, 'out.hex');
    await writeFile(entry, 'main:\n  ld a,300\n  ret\n', 'utf8');

    const result = await runCli(['-o', output, entry]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('error: [AZMN_SYMBOL]');
    expect(result.stderr).toContain('8-bit value out of range: 300');
    expect(result.stderr).not.toContain('azm [options] <entry.asm|entry.z80>');
    await expectNoArtifacts(work, 'out');

    await removeCliWorkDir(work);
  });

  it('returns code 2 for CLI parse errors and always includes usage text', async () => {
    const work = await makeCliWorkDir('azm-cli-usage-errors-');
    const entry = join(work, 'main.asm');
    await writeFile(entry, 'main:\n  nop\n  ret\n', 'utf8');

    const cases: Array<{ readonly args: readonly string[]; readonly message: string }> = [
      { args: ['--badflag', entry], message: 'Unknown option "--badflag"' },
      { args: ['--removed-syntax-warn', entry], message: 'Unknown option "--removed-syntax-warn"' },
      { args: ['--output'], message: '--output expects a value' },
      { args: ['--output=', entry], message: '--output expects a value' },
      { args: ['--type=', entry], message: '--type expects a value' },
      { args: ['--include=', entry], message: '--include expects a value' },
      { args: ['--aliases=', entry], message: '--aliases expects a value' },
      { args: ['--case-style=camel', entry], message: 'Unsupported --case-style "camel"' },
    ];

    for (const item of cases) {
      const result = await runCli([...item.args]);
      expect(result.code).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('azm:');
      expect(result.stderr).toContain(item.message);
      expect(result.stderr).toContain('azm [options] <entry.asm|entry.z80>');
      expect(result.stderr).toContain('Options:');
    }

    await removeCliWorkDir(work);
  }, 20_000);

  it('accepts uppercase output extensions and prints canonical primary artifact paths', async () => {
    const work = await makeCliWorkDir('azm-cli-upper-ext-');
    const entry = join(work, 'main.asm');
    await writeFile(entry, 'main:\n  nop\n  ret\n', 'utf8');

    const outHexUpper = join(work, 'bundle.HEX');
    const hex = await runCli(['--type', 'hex', '--output', outHexUpper, entry]);
    expect(hex.code).toBe(0);
    expect(normalizePathForCompare(hex.stdout.trim())).toBe(
      normalizePathForCompare(join(work, 'bundle.hex')),
    );
    expect(await exists(join(work, 'bundle.hex'))).toBe(true);

    const outBinUpper = join(work, 'bundle.BIN');
    const bin = await runCli(['--type', 'bin', '--output', outBinUpper, entry]);
    expect(bin.code).toBe(0);
    expect(normalizePathForCompare(bin.stdout.trim())).toBe(
      normalizePathForCompare(join(work, 'bundle.bin')),
    );
    expect(await exists(join(work, 'bundle.bin'))).toBe(true);

    await removeCliWorkDir(work);
  }, 20_000);

  it.each(['foo', 'txt', 'azm', 'asmi'])('rejects .%s entry extensions', async (ext) => {
    const work = await makeCliWorkDir(`azm-cli-source-ext-${ext}-`);
    const entry = join(work, `main.${ext}`);
    await writeFile(entry, 'main:\n  nop\n', 'utf8');

    const result = await runCli(['--nobin', '--nod8m', '--nolist', entry]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`Unsupported entry extension ".${ext}"`);
    expect(result.stderr).toContain('expected .asm, .z80');

    await removeCliWorkDir(work);
  });
});
