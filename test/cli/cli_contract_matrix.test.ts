import { beforeAll, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import {
  exists,
  makeCliWorkDir,
  removeCliWorkDir,
  runCli,
  writeCliMainSource,
} from '../helpers/cli.js';

describe('cli contract matrix', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('prints help text and exits 0', async () => {
    const res = await runCli(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('azm [options] <entry.asm|entry.z80>');
    expect(res.stdout).toContain('--output <file>');
    expect(res.stderr).toBe('');
  });

  it('prints version and exits 0', async () => {
    const res = await runCli(['--version']);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.stderr).toBe('');
  });

  it('requires exactly one entry and enforces entry-last ordering', async () => {
    const resNoEntry = await runCli([]);
    expect(resNoEntry.code).toBe(2);
    expect(resNoEntry.stderr).toContain('Expected exactly one <entry.asm|entry.z80> argument');

    const work = await makeCliWorkDir('azm-cli-multi-entry-');
    const entryA = await writeCliMainSource(work);
    const entryB = join(work, 'b.asm');
    await writeFile(entryB, ['other:', '  nop', '  ret', ''].join('\n'), 'utf8');

    const resMultiple = await runCli([entryA, entryB]);
    expect(resMultiple.code).toBe(2);
    expect(resMultiple.stderr).toContain('must be last');

    await removeCliWorkDir(work);
  });

  it('rejects missing values for --output/--type/--include/--case-style/--aliases', async () => {
    const outMissing = await runCli(['--output']);
    expect(outMissing.code).toBe(2);
    expect(outMissing.stderr).toContain('--output expects a value');

    const typeMissing = await runCli(['--type']);
    expect(typeMissing.code).toBe(2);
    expect(typeMissing.stderr).toContain('--type expects a value');

    const includeMissing = await runCli(['--include']);
    expect(includeMissing.code).toBe(2);
    expect(includeMissing.stderr).toContain('--include expects a value');

    const caseStyleMissing = await runCli(['--case-style']);
    expect(caseStyleMissing.code).toBe(2);
    expect(caseStyleMissing.stderr).toContain('--case-style expects a value');

    const aliasesMissing = await runCli(['--aliases']);
    expect(aliasesMissing.code).toBe(2);
    expect(aliasesMissing.stderr).toContain('--aliases expects a value');
  }, 20_000);

  it(
    'rejects unsupported type tokens and output/type extension mismatches',
    async () => {
      const work = await makeCliWorkDir('azm-cli-type-');
      const entry = await writeCliMainSource(work);

      const unsupported = await runCli(['--type=rom', entry]);
      expect(unsupported.code).toBe(2);
      expect(unsupported.stderr).toContain('Unsupported --type "rom"');

      const badHexExt = await runCli(['--type', 'hex', '-o', join(work, 'out.bin'), entry]);
      expect(badHexExt.code).toBe(2);
      expect(badHexExt.stderr).toContain('--output must end with ".hex"');

      const badBinExt = await runCli(['--type', 'bin', '-o', join(work, 'out.hex'), entry]);
      expect(badBinExt.code).toBe(2);
      expect(badBinExt.stderr).toContain('--output must end with ".bin"');

      await removeCliWorkDir(work);
    },
    15_000,
  );

  it('rejects suppression of the selected primary output type', async () => {
    const work = await makeCliWorkDir('azm-cli-primary-suppress-');
    const entry = await writeCliMainSource(work);

    const noBin = await runCli(['--type', 'bin', '--nobin', '-o', join(work, 'out.bin'), entry]);
    expect(noBin.code).toBe(2);
    expect(noBin.stderr).toContain('--type bin requires BIN output to be enabled');

    const noHex = await runCli(['--type', 'hex', '--nohex', '-o', join(work, 'out.hex'), entry]);
    expect(noHex.code).toBe(2);
    expect(noHex.stderr).toContain('--type hex requires HEX output to be enabled');

    await removeCliWorkDir(work);
  });

  it('uses entry stem as default primary output for --type bin and writes siblings', async () => {
    const work = await makeCliWorkDir('azm-cli-default-bin-');
    const entry = await writeCliMainSource(work);

    const res = await runCli(['--type', 'bin', entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(join(work, 'main.bin'));

    expect(await exists(join(work, 'main.bin'))).toBe(true);
    expect(await exists(join(work, 'main.hex'))).toBe(true);
    expect(await exists(join(work, 'main.d8.json'))).toBe(true);
    expect(await exists(join(work, 'main.lst'))).toBe(true);

    await removeCliWorkDir(work);
  }, 20_000);

  it('returns exit code 1 and no artifacts when diagnostics contain errors', async () => {
    const work = await makeCliWorkDir('azm-cli-error-exit-');
    const entry = join(work, 'broken.asm');
    await writeFile(entry, ['main:', '  ld a,UNKNOWN_SYMBOL', '  ret', ''].join('\n'), 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['-o', outHex, entry]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('error:');

    expect(await exists(join(work, 'out.hex'))).toBe(false);
    expect(await exists(join(work, 'out.bin'))).toBe(false);
    expect(await exists(join(work, 'out.d8.json'))).toBe(false);
    expect(await exists(join(work, 'out.lst'))).toBe(false);

    await removeCliWorkDir(work);
  }, 20_000);

  it('rejects retired --type-padding-warn', async () => {
    const res = await runCli(['--type-padding-warn']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unknown option "--type-padding-warn"');
  });

  it('rejects retired --raw-typed-call-warn', async () => {
    const res = await runCli(['--raw-typed-call-warn']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unknown option "--raw-typed-call-warn"');
  });
});
