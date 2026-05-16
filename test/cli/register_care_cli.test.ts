import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { exists, runCli } from '../helpers/cli.js';

describe('register-care cli', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('writes a register-care report artifact in audit mode', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-'));
    const entry = join(work, 'main.z80');
    await writeFile(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--register-care',
      'audit',
      '--emit-register-report',
      entry,
    ]);
    expect(res.code).toBe(0);

    const reportPath = join(work, 'main.regcare.txt');
    expect(await exists(reportPath)).toBe(true);
    await expect(readFile(reportPath, 'utf8')).resolves.toContain('AZM Register-Care Report');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('writes a register-care interface artifact when requested', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-interface-'));
    const entry = join(work, 'main.z80');
    await writeFile(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--register-care',
      'audit',
      '--emit-register-interface',
      entry,
    ]);
    expect(res.code).toBe(0);

    const interfacePath = join(work, 'main.azmi');
    expect(await exists(interfacePath)).toBe(true);
    await expect(readFile(interfacePath, 'utf8')).resolves.toContain(
      '; AZM register-care interface',
    );

    await rm(work, { recursive: true, force: true });
  }, 20_000);
});
