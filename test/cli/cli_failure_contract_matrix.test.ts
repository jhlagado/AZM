import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { exists, normalizePathForCompare, runCli } from '../helpers/cli.js';

async function expectNoArtifacts(base: string): Promise<void> {
  expect(await exists(`${base}.hex`)).toBe(false);
  expect(await exists(`${base}.bin`)).toBe(false);
  expect(await exists(`${base}.d8.json`)).toBe(false);
  expect(await exists(`${base}.lst`)).toBe(false);
}

describe('cli failure contract matrix', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('returns code 1 for missing entry file and writes no artifacts', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-missing-entry-'));
    const missingEntry = join(work, 'missing.asm');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');

    const res = await runCli(['-o', outHex, missingEntry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[AZM001]');
    expect(res.stderr).toContain('Failed to read entry file');
    expect(res.stderr).not.toContain('azm [options] <entry.asm|entry.z80>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for parser diagnostics and does not print CLI usage text', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-parser-error-'));
    const entry = join(work, 'broken.asm');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');
    await writeFile(entry, 'func main(: void\nend\n', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[AZM100]');
    expect(res.stderr).toContain('error:');
    expect(res.stderr).not.toContain('azm [options] <entry.asm|entry.z80>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for ASM80 include parser diagnostics at the included file', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-asm80-include-error-'));
    const entry = join(work, 'entry.z80');
    const child = join(work, 'child.z80');
    const outBin = join(work, 'out.bin');
    const base = join(work, 'out');
    await writeFile(
      entry,
      ['.org 0100H', '.include "child.z80"', '.binfrom 0100H'].join('\n'),
      'utf8',
    );
    await writeFile(child, ['.db 1', '.db BAD+'].join('\n'), 'utf8');

    const res = await runCli(['--nolist', '--nohex', '--nod8m', '-t', 'bin', '-o', outBin, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain(`${child}:2:1`);
    expect(res.stderr).toContain('[AZM100]');
    expect(res.stderr).toContain('Invalid imm expression: BAD+');
    expect(res.stderr).not.toContain(`${entry}:3:1`);
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for ASM80 include encoder diagnostics at the included file', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-asm80-include-encode-error-'));
    const entry = join(work, 'entry.z80');
    const child = join(work, 'child.z80');
    const outBin = join(work, 'out.bin');
    const base = join(work, 'out');
    await writeFile(
      entry,
      ['.org 0100H', '.include "child.z80"', '.binfrom 0100H'].join('\n'),
      'utf8',
    );
    await writeFile(child, 'ld a,300\n', 'utf8');

    const res = await runCli(['--nolist', '--nohex', '--nod8m', '-t', 'bin', '-o', outBin, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain(`${child}:1:1`);
    expect(res.stderr).toContain('[AZM200]');
    expect(res.stderr).toContain('ld A, n expects imm8');
    expect(res.stderr).not.toContain(`${entry}:2:1`);
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for encoder diagnostics and writes no artifacts', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-encode-error-'));
    const entry = join(work, 'encode-error.asm');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');
    await writeFile(entry, 'main:\n  ld a, 300\n  ret\n', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[AZM200]');
    expect(res.stderr).toContain('ld A, n expects imm8');
    expect(res.stderr).not.toContain('azm [options] <entry.asm|entry.z80>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for empty entry modules and writes no artifacts', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-empty-entry-'));
    const entry = join(work, 'empty.asm');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');
    await writeFile(entry, '', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[AZM400]');
    expect(res.stderr).toContain('Program contains no declarations or instruction streams.');
    expect(res.stderr).not.toContain('azm [options] <entry.asm|entry.z80>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 2 for CLI parse errors and always includes usage text', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-usage-errors-'));
    const entry = join(work, 'main.asm');
    await writeFile(entry, 'main:\n  nop\n  ret\n', 'utf8');

    const cases: Array<{ args: string[]; message: string }> = [
      { args: ['--badflag', entry], message: 'Unknown option' },
      { args: ['--legacy-syntax-warn', entry], message: 'Unknown option "--legacy-syntax-warn"' },
      { args: ['--output'], message: '--output expects a value' },
      { args: ['--output=', entry], message: '--output expects a value' },
      { args: ['--type=', entry], message: '--type expects a value' },
      { args: ['--include=', entry], message: '--include expects a value' },
    ];

    for (const c of cases) {
      const res = await runCli(c.args);
      expect(res.code).toBe(2);
      expect(res.stdout).toBe('');
      expect(res.stderr).toContain('azm:');
      expect(res.stderr).toContain(c.message);
      expect(res.stderr).toContain('azm [options] <entry.asm|entry.z80>');
      expect(res.stderr).toContain('Options:');
    }

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('accepts uppercase output extensions and prints canonical primary artifact path', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-upper-ext-'));
    const entry = join(work, 'main.asm');
    await writeFile(entry, 'main:\n  nop\n  ret\n', 'utf8');

    const outHexUpper = join(work, 'bundle.HEX');
    const resHex = await runCli(['--type', 'hex', '--output', outHexUpper, entry]);
    expect(resHex.code).toBe(0);
    expect(normalizePathForCompare(resHex.stdout.trim())).toBe(
      normalizePathForCompare(join(work, 'bundle.hex')),
    );
    expect(await exists(join(work, 'bundle.hex'))).toBe(true);

    const outBinUpper = join(work, 'bundle.BIN');
    const resBin = await runCli(['--type', 'bin', '--output', outBinUpper, entry]);
    expect(resBin.code).toBe(0);
    expect(normalizePathForCompare(resBin.stdout.trim())).toBe(
      normalizePathForCompare(join(work, 'bundle.bin')),
    );
    expect(await exists(join(work, 'bundle.bin'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  });
});
