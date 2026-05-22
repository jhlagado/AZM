import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { runCli } from '../../src/cli.js';

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function runNextCli(args: string[], cwd?: string): Promise<CliRun> {
  const resolvedCwd = cwd ?? process.cwd();
  const originalCwd = process.cwd();

  let stdout = '';
  let stderr = '';
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
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


async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('stage 14 register-care CLI facade', () => {
  const artifactlessArgs = ['--nobin', '--nohex', '--nod8m', '--nolist'];

  it('rejects malformed --accept-out values', async () => {
    await withTempDir('azm-next-regcare-accept-bad-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      const res = await runNextCli(['--rc', 'audit', '--accept-out', 'MASK:A,', entry], dir);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('Invalid --accept-out value "MASK:A,"');
    });
  });

  it('rejects malformed --accept-out when register-care is not explicitly enabled', async () => {
    await withTempDir('azm-next-regcare-accept-off-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      const res = await runNextCli(
        ['--accept-out', 'MASK:Q', '--nobin', '--nohex', '--nod8m', '--nolist', entry],
        dir,
      );
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('Invalid --accept-out value "MASK:Q" (unknown carrier)');
    });
  });

  it('rejects malformed register-care interface contracts', async () => {
    await withTempDir('azm-next-regcare-interface-bad-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'bad.asmi');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      await writeFile(iface, ['extern MON', 'clobbers Q', 'end'].join('\n'), 'utf8');
      const res = await runNextCli([
        ...artifactlessArgs,
        '--rc',
        'audit',
        '--interface',
        iface,
        entry,
      ], dir);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('invalid register-care interface line "clobbers Q"');
    });
  });

  it('rejects register-care interface file without .asmi extension', async () => {
    await withTempDir('azm-next-regcare-interface-ext-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'bad.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      await writeFile(iface, ['extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');
      const res = await runNextCli(
        [...artifactlessArgs, '--register-care', 'audit', '--interface', iface, entry],
        dir,
      );
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Register-care interface files must use the .asmi extension');
    });
  });

  it('allows care-only invocation when --register-care is set with primary outputs disabled', async () => {
    await withTempDir('azm-next-regcare-care-only-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      const res = await runNextCli(
        [...artifactlessArgs, '--register-care', 'audit', entry],
        dir,
      );
      expect(res.code).toBe(0);
      expect(res.stderr).toBe('');
    });
  });

  it('rewrites source file when --contracts is enabled', async () => {
    await withTempDir('azm-next-regcare-contracts-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'mon3.asmi');
      await writeFile(
        iface,
        ['extern MASK', 'out A', 'end'].join('\n'),
        'utf8',
      );
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

      const res = await runNextCli(
        [...artifactlessArgs, '--register-care', 'audit', '--contracts', '--interface', iface, '--nobin', '--nohex', '--nod8m', '--nolist', entry],
        dir,
      );

      expect(res.code).toBe(0);
      expect(res.stderr).toBe('');
      expect(res.stdout.trim()).toBe(entry);

      const rewritten = await readFile(entry, 'utf8');
      expect(rewritten).toContain(';!      out       A');
    });
  });

  it('rejects --accept-out with equals missing value', async () => {
    await withTempDir('azm-next-regcare-accept-eq-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      const res = await runNextCli(
        ['--accept-out=', '--register-care', 'audit', '--nobin', '--nohex', '--nod8m', '--nolist', entry],
        dir,
      );
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('--accept-out expects a value');
    });
  });

  it('rejects --register-care with equals missing value', async () => {
    await withTempDir('azm-next-regcare-rc-eq-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      const res = await runNextCli(
        ['--rc=', '--nobin', '--nohex', '--nod8m', '--nolist', entry],
        dir,
      );
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('--rc expects a value');
    });
  });
});
