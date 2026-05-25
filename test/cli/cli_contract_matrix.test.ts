import { beforeAll, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureCliBuilt } from '../helpers/cli/build.js';
import {
  expectCliArtifacts,
  makeCliWorkDir,
  removeCliWorkDir,
  runCli,
  writeCliMainSource,
} from '../helpers/cli/index.js';

describe('cli contract matrix', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('rejects missing values for documented value flags', async () => {
    const output = await runCli(['--output']);
    expect(output.code).toBe(2);
    expect(output.stderr).toContain('--output expects a value');

    const type = await runCli(['--type']);
    expect(type.code).toBe(2);
    expect(type.stderr).toContain('--type expects a value');

    const include = await runCli(['--include']);
    expect(include.code).toBe(2);
    expect(include.stderr).toContain('--include expects a value');

    const caseStyle = await runCli(['--case-style']);
    expect(caseStyle.code).toBe(2);
    expect(caseStyle.stderr).toContain('--case-style expects a value');

    const aliases = await runCli(['--aliases']);
    expect(aliases.code).toBe(2);
    expect(aliases.stderr).toContain('--aliases expects a value');
  });

  it('loads project directive aliases from --aliases JSON files', async () => {
    const work = await makeCliWorkDir('azm-cli-aliases-');
    const entry = join(work, 'main.asm');
    const aliases = join(work, 'azm.aliases.json');

    await writeFile(
      aliases,
      JSON.stringify({
        extends: 'azm',
        directiveAliases: {
          DEFB: '.db',
          DEFW: '.dw',
          DEFS: '.ds',
        },
      }),
      'utf8',
    );
    await writeFile(
      entry,
      ['        ORG 0100H', 'main:', '        DEFB 1', '        DEFW main', '        DEFS 1', ''].join(
        '\n',
      ),
      'utf8',
    );

    const result = await runCli(['--aliases', aliases, '--type', 'bin', entry]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(join(work, 'main.bin'));
    await expectCliArtifacts(work, 'main', { bin: true, hex: true, 'd8.json': true });

    await removeCliWorkDir(work);
  }, 20_000);

  it('rejects project aliases that collide with built-in directive aliases', async () => {
    const work = await makeCliWorkDir('azm-cli-alias-conflict-');
    const entry = await writeCliMainSource(work);
    const aliases = join(work, 'azm.aliases.json');

    await writeFile(
      aliases,
      JSON.stringify({
        extends: 'azm',
        directiveAliases: {
          DB: '.dw',
        },
      }),
      'utf8',
    );

    const result = await runCli(['--aliases', aliases, entry]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Directive alias "DB" conflicts with the AZM baseline');

    await removeCliWorkDir(work);
  }, 20_000);
});
