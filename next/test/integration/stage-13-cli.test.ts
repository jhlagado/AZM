import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { runCli } from '../../src/cli.js';

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runNextCli(args: string[], cwd?: string): Promise<CliRun> {
  const originalCwd = process.cwd();
  const resolvedCwd = cwd ?? originalCwd;

  let stdout = '';
  let stderr = '';
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });
  const stderrSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });

  try {
    process.chdir(resolvedCwd);
    return { code: await runCli(args), stdout, stderr };
  } finally {
    process.chdir(originalCwd);
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('stage 13 CLI façade', () => {
  const packageVersion = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as { readonly version: string };

  it('prints help and version output', async () => {
    expect((await runNextCli(['--help'])).stdout).toContain('azm [options] <entry.asm|entry.z80>');
    expect((await runNextCli(['--version'])).stdout.trim()).toBe(packageVersion.version);
  });

  it('enforces exactly one entry argument and entry-last ordering', async () => {
    await withTempDir('azm-next-cli-empty-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'main:\n  ret\n', 'utf8');
      const none = await runNextCli([], dir);
      expect(none.code).toBe(2);
      expect(none.stderr).toContain('Expected exactly one <entry.asm|entry.z80> argument');

      const second = await runNextCli([entry, `${entry}.z80`], dir);
      expect(second.code).toBe(2);
      expect(second.stderr).toContain('must be last');
    });
  });

  it('rejects missing values for supported option forms', async () => {
    const source = `main:\n  ret\n`;
    await withTempDir('azm-next-cli-missing-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, source, 'utf8');

      const outMissing = await runNextCli(['--output'], dir);
      expect(outMissing.code).toBe(2);
      expect(outMissing.stderr).toContain('--output expects a value');

      const typeMissing = await runNextCli(['--type'], dir);
      expect(typeMissing.code).toBe(2);
      expect(typeMissing.stderr).toContain('--type expects a value');

      const includeMissing = await runNextCli(['-I'], dir);
      expect(includeMissing.code).toBe(2);
      expect(includeMissing.stderr).toContain('-I expects a value');
    });
  });

  it('parses output options and enforces output extension contracts', async () => {
    const source = `main:\n  ret\n`;
    await withTempDir('azm-next-cli-output-contracts-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, source, 'utf8');

      const badType = await runNextCli(['--type=rom', entry], dir);
      expect(badType.code).toBe(2);
      expect(badType.stderr).toContain('Unsupported --type "rom"');

      const badHex = await runNextCli(['--type', 'hex', '-o', join(dir, 'out.bin'), entry], dir);
      expect(badHex.code).toBe(2);
      expect(badHex.stderr).toContain('--output must end with ".hex" when --type is "hex"');

      const noPrimary = await runNextCli(['--type', 'bin', '--nobin', '-o', join(dir, 'out.bin'), entry], dir);
      expect(noPrimary.code).toBe(2);
      expect(noPrimary.stderr).toContain('--type bin requires BIN output to be enabled');
    });
  });

  it('writes default artifacts and prints resolved primary output path', async () => {
    const source = `main:\n  ld a,$2a\n  ret\n`;
    await withTempDir('azm-next-cli-default-artifacts-', async (dir) => {
      const entry = join(dir, 'entry.asm');
      const out = join(dir, 'bundle.hex');
      await writeFile(entry, source, 'utf8');

      const byType = await runNextCli(['--nobin', '--nod8m', '--nolist', '-o', out, entry], dir);
      expect(byType.code).toBe(0);
      expect(byType.stdout.trim()).toBe(normalize(out));
      expect(await exists(out)).toBe(true);
      expect(await exists(join(dir, 'bundle.bin'))).toBe(false);
      expect(await exists(join(dir, 'bundle.d8.json'))).toBe(false);
      expect(await exists(join(dir, 'bundle.lst'))).toBe(false);
    });
  });

  it('writes default artifact set for --type bin and omits nohex/nobin/d8/nolist combinations', async () => {
    const source = `main:\n  ld a,1\n  ret\n`;
    await withTempDir('azm-next-cli-artifacts-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, source, 'utf8');

      const out = join(dir, 'bundle.bin');
      const full = await runNextCli(['-t', 'bin', '--output', out, entry], dir);
      expect(full.code).toBe(0);
      expect(full.stdout.trim()).toBe(normalize(out));
      expect(await exists(out)).toBe(true);
      expect(await exists(join(dir, 'bundle.hex'))).toBe(true);
      expect(await exists(join(dir, 'bundle.d8.json'))).toBe(true);
      expect(await exists(join(dir, 'bundle.lst'))).toBe(true);
    });
  });

  it('propagates compile diagnostics as exit code 1 and writes no artifacts', async () => {
    await withTempDir('azm-next-cli-diagnostics-', async (dir) => {
      const entry = join(dir, 'broken.asm');
      await writeFile(entry, 'main:\n  ld a,UNKNOWN_SYMBOL\n  ret\n', 'utf8');

      const out = join(dir, 'broken.hex');
      const res = await runNextCli(['-o', out, entry], dir);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('error: [AZMN_SYMBOL]');
      expect(await exists(out)).toBe(false);
      expect(await exists(join(dir, 'broken.bin'))).toBe(false);
      expect(await exists(join(dir, 'broken.d8.json'))).toBe(false);
      expect(await exists(join(dir, 'broken.lst'))).toBe(false);
    });
  });

  it('accepts uppercase output extension and canonicalizes the written path', async () => {
    const source = `main:\n  ret\n`;
    await withTempDir('azm-next-cli-upper-ext-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const out = join(dir, 'bundle.HEX');
      await writeFile(entry, source, 'utf8');

      const res = await runNextCli(['--type', 'hex', '-o', out, entry], dir);
      expect(res.code).toBe(0);
      expect(resolve(res.stdout.trim())).toBe(resolve(join(dir, 'bundle.hex')));
      expect(await exists(join(dir, 'bundle.hex'))).toBe(true);
      expect(await exists(out.toLowerCase())).toBe(true);
    });
  });

  it('resolves include paths and produces deterministic artifacts from explicit include flag', async () => {
    await withTempDir('azm-next-cli-include-', async (dir) => {
      const includes = join(dir, 'includes');
      const entry = join(dir, 'main.asm');
      const includeFile = join(includes, 'lib.inc');
      const out = join(dir, 'out.bin');

      await mkdir(includes, { recursive: true });
      await writeFile(includeFile, 'VALUE .equ 7\n', 'utf8');
      await writeFile(entry, '.include "lib.inc"\nmain:\n  ld a,VALUE\n  ret\n', 'utf8');

      const includeRes = await runNextCli(['-I', includes, '--type', 'bin', '-o', out, 'main.asm'], dir);
      expect(includeRes.code).toBe(0);
      expect(await exists(out)).toBe(true);
    });
  });

  it('passes source-root through to D8 metadata file names', async () => {
    await withTempDir('azm-next-cli-source-root-', async (dir) => {
      const sourceRoot = join(dir, 'project');
      const sourceDir = join(sourceRoot, 'src');
      const sourceFile = join(sourceDir, 'main.asm');
      const output = join(dir, 'build', 'game.hex');
      await mkdir(sourceDir, { recursive: true });
      await mkdir(dirname(output), { recursive: true });
      await writeFile(sourceFile, `main:\n  ld a, 1\n  ret\n`, 'utf8');

      const withRoot = await runNextCli(
        ['--source-root', sourceRoot, '-o', output, sourceFile],
        dir,
      );
      expect(withRoot.code).toBe(0);

      const d8Path = join(dir, 'build', 'game.d8.json');
      expect(await exists(d8Path)).toBe(true);
      const d8Json = JSON.parse(await readFile(d8Path, 'utf8')) as {
        generator?: { inputs?: { entry?: string } };
        files?: Record<string, unknown>;
      };

      expect(d8Json.generator?.inputs).toMatchObject({
        entry: 'src/main.asm',
      });
      expect(Object.keys(d8Json.files ?? {}).every((key) => !key.includes('\\'))).toBe(true);
    });
  });

  it('writes lowered .z80 output when --asm80 is used', async () => {
    await withTempDir('azm-next-cli-asm80-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, `main:\n  ld a,1\n  ret\n`, 'utf8');
      const out = join(dir, 'main.hex');
      const res = await runNextCli(
        ['--asm80', '--nobin', '--nod8m', '--nolist', '-o', out, entry],
        dir,
      );

      expect(res.code).toBe(0);
      expect(await exists(join(dir, 'main.z80'))).toBe(true);
      const z80 = await readFile(join(dir, 'main.z80'), 'utf8');
      expect(z80.length).toBeGreaterThan(0);
    });
  });
});
