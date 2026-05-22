import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRootPath = process.cwd();

async function runLocalCli(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const runner = `
    import { runCli } from '@jhlagado/azm/cli';
    const argv = JSON.parse(process.env.AZM_ARGS || '[]');
    const code = await runCli(argv);
    process.exit(code);
  `;
  try {
    const child = await execFileAsync(
      process.execPath,
      ['--input-type=module', '--eval', runner, '--', ...args],
      {
        cwd: repoRootPath,
        encoding: 'utf8',
        env: { ...process.env, AZM_ARGS: JSON.stringify(args) },
      },
    );
    return { code: 0, stdout: child.stdout, stderr: child.stderr ?? '' };
  } catch (error) {
    const childError = error as {
      code: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      code: childError.code ?? 1,
      stdout: childError.stdout ?? '',
      stderr: childError.stderr ?? `${childError.message}`,
    };
  }
}

describe('stage 16 package smoke local fallback', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'azm-next-smoke-local-'));
  }, 30_000);

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('asserts local package surface from source entry points', async () => {
    const { compile, defaultFormatWriters } = await import('@jhlagado/azm/compile');
    const { loadProgram } = await import('@jhlagado/azm/tooling');
    const entryPath = join(tempDir, 'main.asm');
    const sourceText = ['        .org 0100H', 'START:', '    ld a,42', '    ret', ''].join('\n');
    await writeFile(entryPath, sourceText, 'utf8');

    const loaded = await loadProgram({ entryFile: entryPath, preloadedText: sourceText });
    const result = await compile(
      entryPath,
      { emitListing: false, emitAsm80: false },
      { formats: defaultFormatWriters },
    );

    const output = {
      loaded: Boolean(loaded.loadedProgram),
      diagnosticsCount: loaded.diagnostics.length + (loaded.loadedProgram ? 0 : 1),
      artifactKinds: result.artifacts.map((artifact: { kind: string }) => artifact.kind),
    } as {
      loaded: boolean;
      diagnosticsCount: number;
      artifactKinds: string[];
    };

    expect(output.loaded).toBe(true);
    expect(output.diagnosticsCount).toBe(0);
    expect(output.artifactKinds).toHaveLength(3);
    expect(output.artifactKinds).toEqual(expect.arrayContaining(['bin', 'hex', 'd8m']));
  });

  it('runs the local CLI entry point for smoke output generation', async () => {
    const entry = join(tempDir, 'smoke.asm');
    const output = join(tempDir, 'smoke.bin');
    await writeFile(
      entry,
      ['        .org 0100H', 'START:', '    ld a,42', '    ret', '.end', ''].join('\n'),
      'utf8',
    );

    const run = await runLocalCli(['--type', 'bin', '--output', output, entry]);
    const bytes = await readFile(output);
    expect(run.code).toBe(0);
    expect(run.stderr).toBe('');
    expect(bytes).toEqual(Buffer.from([0x3e, 0x2a, 0xc9]));
  });
});
