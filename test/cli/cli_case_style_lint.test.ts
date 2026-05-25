import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { ensureCliBuilt } from '../helpers/cli/build.js';
import {
  exists,
  makeCliWorkDir,
  removeCliWorkDir,
  runCli,
} from '../helpers/cli/index.js';
import { writeFile } from 'node:fs/promises';

describe('cli case-style linting', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('prints warnings and still exits 0 when --case-style triggers lint findings', async () => {
    const work = await makeCliWorkDir('azm-cli-case-style-');
    const entry = join(work, 'main.asm');
    const outBin = join(work, 'bundle.bin');

    await writeFile(entry, ['main:', '  ld a, 1', '  ret', ''].join('\n'), 'utf8');

    const result = await runCli(['--type', 'bin', '--case-style=upper', '--output', outBin, entry]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(outBin);
    expect(result.stderr).toContain('warning: [AZMN_CASE_STYLE]');
    expect(result.stderr).toContain('mnemonic "ld" should be uppercase');
    expect(result.stderr).toContain('register "a" should be uppercase');
    expect(await exists(outBin)).toBe(true);

    await removeCliWorkDir(work);
  }, 20_000);

  it('does not lint label prefixes or hex immediates as register tokens', async () => {
    const work = await makeCliWorkDir('azm-cli-case-style-label-hex-');
    const entry = join(work, 'main.asm');
    const outBin = join(work, 'bundle.bin');

    await writeFile(entry, ['main:', '  loop: ld a, $af', '  ret', ''].join('\n'), 'utf8');

    const result = await runCli(['--type', 'bin', '--case-style=upper', '--output', outBin, entry]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('mnemonic "ld" should be uppercase');
    expect(result.stderr).toContain('register "a" should be uppercase');
    expect(result.stderr).not.toContain('mnemonic "loop:" should be uppercase');
    expect(result.stderr).not.toContain('register "af" should be uppercase');

    await removeCliWorkDir(work);
  }, 20_000);

  it('does not lint directives, functions, labels, or constants', async () => {
    const work = await makeCliWorkDir('azm-cli-case-style-scope-');
    const entry = join(work, 'main.asm');
    const outBin = join(work, 'bundle.bin');

    await writeFile(
      entry,
      [
        'main:',
        'VALUE .equ sizeof(byte)',
        'Mode .enum Read, Write',
        'Sprite .type',
        'x .byte',
        '.endtype',
        '.db VALUE, Mode.Read',
        '  RET',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = await runCli(['--type', 'bin', '--case-style=lower', '--output', outBin, entry]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('mnemonic "RET" should be lowercase');
    expect(result.stderr).not.toContain('VALUE');
    expect(result.stderr).not.toContain('sizeof');
    expect(result.stderr).not.toContain('Mode');
    expect(result.stderr).not.toContain('.db');

    await removeCliWorkDir(work);
  }, 20_000);
});
