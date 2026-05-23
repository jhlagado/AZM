import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureCliBuilt } from '../helpers/cli/build.js';
import { exists, normalizePathForCompare, runCli } from '../helpers/cli/index.js';

async function expectNoArtifacts(base: string): Promise<void> {
  expect(await exists(`${base}.hex`)).toBe(false);
  expect(await exists(`${base}.bin`)).toBe(false);
  expect(await exists(`${base}.d8.json`)).toBe(false);
  expect(await exists(`${base}.lst`)).toBe(false);
}

async function makeFailureWorkDir(prefix: string, entryName: string, outputName = 'out.hex') {
  const work = await mkdtemp(join(tmpdir(), prefix));
  const entry = join(work, entryName);
  const output = join(work, outputName);
  return { work, entry, output, base: join(work, 'out') };
}

async function makeAsm80IncludeFailureFixture(prefix: string, childSource: string) {
  const { work, entry, output, base } = await makeFailureWorkDir(prefix, 'entry.z80', 'out.bin');
  const child = join(work, 'child.z80');
  await writeFile(
    entry,
    ['.org 0100H', '.include "child.z80"', '.binfrom 0100H'].join('\n'),
    'utf8',
  );
  await writeFile(child, childSource, 'utf8');
  return { work, entry, child, output, base };
}

async function expectCompileFailureWithoutUsage(
  res: Awaited<ReturnType<typeof runCli>>,
  base: string,
  checks: string[],
): Promise<void> {
  expect(res.code).toBe(1);
  expect(res.stdout).toBe('');
  for (const check of checks) expect(res.stderr).toContain(check);
  expect(res.stderr).not.toContain('azm [options] <entry.asm|entry.z80>');
  await expectNoArtifacts(base);
}

async function expectIncludedFileFailure(params: {
  res: Awaited<ReturnType<typeof runCli>>;
  entry: string;
  child: string;
  base: string;
  childLocation: string;
  entryLocation: string;
  checks: string[];
}): Promise<void> {
  const { res, entry, child, base, childLocation, entryLocation, checks } = params;
  expect(res.code).toBe(1);
  expect(res.stdout).toBe('');
  expect(res.stderr).toContain(`${child}:${childLocation}`);
  for (const check of checks) expect(res.stderr).toContain(check);
  expect(res.stderr).not.toContain(`${entry}:${entryLocation}`);
  await expectNoArtifacts(base);
}

describe('cli failure contract matrix', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('returns code 1 for missing entry file and writes no artifacts', async () => {
    const { work, entry, output, base } = await makeFailureWorkDir(
      'azm-cli-missing-entry-',
      'missing.asm',
    );

    const res = await runCli(['-o', output, entry]);
    await expectCompileFailureWithoutUsage(res, base, ['[AZM001]', 'Failed to read entry file']);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for source diagnostics and does not print CLI usage text', async () => {
    const { work, entry, output, base } = await makeFailureWorkDir(
      'azm-cli-parser-error-',
      'broken.asm',
    );
    await writeFile(entry, '???\n', 'utf8');

    const res = await runCli(['-o', output, entry]);
    await expectCompileFailureWithoutUsage(res, base, ['[AZM200]', 'error:']);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for ASM80 include parser diagnostics at the included file', async () => {
    const { work, entry, child, output, base } = await makeAsm80IncludeFailureFixture(
      'azm-cli-asm80-include-error-',
      ['.db 1', '.db BAD+'].join('\n'),
    );

    const res = await runCli(['--nolist', '--nohex', '--nod8m', '-t', 'bin', '-o', output, entry]);

    await expectIncludedFileFailure({
      res,
      entry,
      child,
      base,
      childLocation: '2:1',
      entryLocation: '3:1',
      checks: ['[AZM100]', 'Invalid imm expression: BAD+'],
    });

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for ASM80 include encoder diagnostics at the included file', async () => {
    const { work, entry, child, output, base } = await makeAsm80IncludeFailureFixture(
      'azm-cli-asm80-include-encode-error-',
      'ld a,300\n',
    );

    const res = await runCli(['--nolist', '--nohex', '--nod8m', '-t', 'bin', '-o', output, entry]);

    await expectIncludedFileFailure({
      res,
      entry,
      child,
      base,
      childLocation: '1:1',
      entryLocation: '2:1',
      checks: ['[AZM200]', 'ld A, n expects imm8'],
    });

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for encoder diagnostics and writes no artifacts', async () => {
    const { work, entry, output, base } = await makeFailureWorkDir(
      'azm-cli-encode-error-',
      'encode-error.asm',
    );
    await writeFile(entry, 'main:\n  ld a, 300\n  ret\n', 'utf8');

    const res = await runCli(['-o', output, entry]);
    await expectCompileFailureWithoutUsage(res, base, ['[AZM200]', 'ld A, n expects imm8']);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for empty entry source and writes no artifacts', async () => {
    const { work, entry, output, base } = await makeFailureWorkDir(
      'azm-cli-empty-entry-',
      'empty.asm',
    );
    await writeFile(entry, '', 'utf8');

    const res = await runCli(['-o', output, entry]);
    await expectCompileFailureWithoutUsage(res, base, [
      '[AZM400]',
      'Program contains no declarations or instruction streams.',
    ]);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 2 for CLI parse errors and always includes usage text', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-usage-errors-'));
    const entry = join(work, 'main.asm');
    await writeFile(entry, 'main:\n  nop\n  ret\n', 'utf8');

    const cases: Array<{ args: string[]; message: string }> = [
      { args: ['--badflag', entry], message: 'Unknown option' },
      { args: ['--removed-syntax-warn', entry], message: 'Unknown option "--removed-syntax-warn"' },
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
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-upper-ext-'));
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
