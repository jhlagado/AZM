import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { exists, runCli } from '../helpers/cli.js';

describe('cli case-style linting', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('prints warnings and still exits 0 when --case-style triggers lint findings', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-case-style-'));
    const entry = join(work, 'main.zax');
    const outBin = join(work, 'bundle.bin');

    await writeFile(
      entry,
      ['export func main()', '  ld a, 1', '  ret', 'end', ''].join('\n'),
      'utf8',
    );

    const res = await runCli(['--type', 'bin', '--case-style=upper', '--output', outBin, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);
    expect(res.stderr).toContain('warning: [ZAX500]');
    expect(res.stderr).toContain('mnemonic "ld" should be uppercase');
    expect(await exists(outBin)).toBe(true);

    await rm(work, { recursive: true, force: true });
  });

  it('does not lint label prefixes or hex immediates as register tokens', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-case-style-label-hex-'));
    const entry = join(work, 'main.zax');
    const outBin = join(work, 'bundle.bin');

    await writeFile(
      entry,
      ['export func main()', '  loop: ld a, $af', '  ret', 'end', ''].join('\n'),
      'utf8',
    );

    const res = await runCli(['--type', 'bin', '--case-style=upper', '--output', outBin, entry]);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain('mnemonic "ld" should be uppercase');
    expect(res.stderr).toContain('register "a" should be uppercase');
    expect(res.stderr).not.toContain('mnemonic "loop:" should be uppercase');
    expect(res.stderr).not.toContain('register "af" should be uppercase');

    await rm(work, { recursive: true, force: true });
  });
});
