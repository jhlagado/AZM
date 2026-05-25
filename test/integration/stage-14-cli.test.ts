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
  const artifactlessArgs = ['--nobin', '--nohex', '--nod8m'];

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
        ['--accept-out', 'MASK:Q', '--nobin', '--nohex', '--nod8m', entry],
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
        [...artifactlessArgs, '--register-care', 'audit', '--contracts', '--interface', iface, '--nobin', '--nohex', '--nod8m', entry],
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
        ['--accept-out=', '--register-care', 'audit', '--nobin', '--nohex', '--nod8m', entry],
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
        ['--rc=', '--nobin', '--nohex', '--nod8m', entry],
        dir,
      );
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--rc expects a value');
    });
  });

  it('warns on direct-call register-care conflicts in warn mode', async () => {
    await withTempDir('azm-next-regcare-conflict-warn-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    ld de,$1000',
          '    call HELPER',
          '    inc de',
          '    ret',
          'HELPER:',
          '    ld de,$2000',
          '    ld (de),a',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const res = await runNextCli(['--rc', 'warn', '--nobin', '--nohex', '--nod8m', entry], dir);
      expect(res.code).toBe(0);
      expect(res.stderr).toContain('CALL HELPER may modify D,E');
    });
  });

  it('errors on direct-call register-care conflicts in error mode', async () => {
    await withTempDir('azm-next-regcare-conflict-error-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    ld de,$1000',
          '    call HELPER',
          '    inc de',
          '    ret',
          'HELPER:',
          '    ld de,$2000',
          '    ld (de),a',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const res = await runNextCli(['--register-care', 'error', '--nobin', '--nohex', '--nod8m', entry], dir);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('CALL HELPER may modify D,E');
    });
  });

  it('warns on unknown direct-call boundaries in strict mode', async () => {
    await withTempDir('azm-next-regcare-unknown-strict-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, ['START:', '    call MISSING_HELPER', '    ret', '.end'].join('\n'), 'utf8');

      const res = await runNextCli(['--rc', 'strict', '--nobin', '--nohex', '--nod8m', entry], dir);
      expect(res.code).toBe(0);
      expect(res.stderr).toContain('MISSING_HELPER');
    });
  });

  it('rewrites source with expects-out hint when --fix confirms direct continuation', async () => {
    await withTempDir('azm-next-regcare-fix-direct-', async (dir) => {
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

      const res = await runNextCli(
        [...artifactlessArgs, '--rc', 'audit', '--fix', entry],
        dir,
      );
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(entry);

      const rewritten = await readFile(entry, 'utf8');
      expect(rewritten).toContain('; expects out A');
    });
  });

  it('rewrites source with expects-out hint when continuation is control-flow reachable', async () => {
    await withTempDir('azm-next-regcare-fix-indirect-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    ld hl,$2000',
          '    call MASK',
          '    inc b',
          '    ld d,a',
          '; Helper prose.',
          'MASK:',
          '    ld a,$80',
          '    ld (hl),a',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const res = await runNextCli([...artifactlessArgs, '--rc', 'audit', '--fix', entry], dir);
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(entry);

      const rewritten = await readFile(entry, 'utf8');
      expect(rewritten).toContain('; expects out A');
    });
  });

  it('uses external interface contracts for known call targets', async () => {
    await withTempDir('azm-next-regcare-cli-external-contract-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'runtime.asmi');
      await writeFile(
        iface,
        ['extern HELPER', 'clobbers DE', 'end'].join('\n'),
        'utf8',
      );
      await writeFile(
        entry,
        [
          'START:',
          '    ld de,$1000',
          '    call HELPER',
          '    inc de',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const res = await runNextCli(
        ['--rc', 'warn', '--interface', iface, '--nobin', '--nohex', '--nod8m', entry],
        dir,
      );

      expect(res.code).toBe(0);
      expect(res.stderr).toContain('CALL HELPER may modify D,E');
      expect(res.stderr).not.toContain('Register-care cannot prove HELPER');
    });
  });

  it('accepts mon3 register-care profile and applies RST service boundary inference', async () => {
    await withTempDir('azm-next-regcare-cli-rst-service-', async (dir) => {
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

      const res = await runNextCli(
        [...artifactlessArgs, '--rc', 'warn', '--reg-profile', 'mon3', entry],
        dir,
      );

      expect(res.code).toBe(0);
      expect(res.stderr).not.toContain('RST_$10 may modify');
    });
  });

});
