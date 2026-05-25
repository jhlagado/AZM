import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeD8ProjectFixture } from '../helpers/d8_project_fixture.js';
import { ensureCliBuilt } from '../helpers/cli/build.js';
import {
  exists,
  expectCliArtifacts,
  makeCliWorkDir,
  removeCliWorkDir,
  runCli,
  writeCliMainSource,
} from '../helpers/cli/index.js';

const packageVersion = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly version: string };

async function writeCliIncludeFixture(workName: string, outputName: string) {
  const work = await makeCliWorkDir(`${workName}-`);
  const includes = join(work, 'includes');
  const entry = join(work, 'main.asm');
  const output = join(work, outputName);

  await mkdir(includes, { recursive: true });
  await writeFile(
    entry,
    ['.include "lib.inc"', 'main:', '    call helper', '    ret', ''].join('\n'),
    'utf8',
  );
  await writeFile(
    join(includes, 'lib.inc'),
    ['helper:', '    nop', '    ret', ''].join('\n'),
    'utf8',
  );

  return { work, includes, entry, output };
}

async function withCliMainFixture<T>(
  callback: (fixture: { work: string; entry: string }) => Promise<T>,
): Promise<T> {
  const work = await makeCliWorkDir('azm-cli-');
  const entry = await writeCliMainSource(work);
  try {
    return await callback({ work, entry });
  } finally {
    await removeCliWorkDir(work);
  }
}

describe('cli artifacts', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('writes default sibling artifacts from -o output path', async () => {
    await withCliMainFixture(async ({ work, entry }) => {
      const outHex = join(work, 'out.hex');
      const res = await runCli(['-o', outHex, entry]);
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(outHex);

      await expectCliArtifacts(work, 'out', { hex: true, bin: true, 'd8.json': true });
    });
  }, 20_000);

  it('uses entry stem as default primary output path when -o is omitted', async () => {
    await withCliMainFixture(async ({ work, entry }) => {
      const res = await runCli([entry]);
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(join(work, 'main.hex'));

      await expectCliArtifacts(work, 'main', { hex: true, bin: true, 'd8.json': true });
    });
  }, 20_000);

  it('uses flat AZM origin 0 when no ORG is provided', async () => {
    await withCliMainFixture(async ({ work, entry }) => {
      const outHex = join(work, 'out.hex');
      const res = await runCli(['-o', outHex, entry]);
      expect(res.code).toBe(0);

      const d8Path = join(work, 'out.d8.json');
      const d8Map = JSON.parse(await readFile(d8Path, 'utf8')) as {
        generator?: { entryAddress?: number; entrySymbol?: string };
        symbols?: Array<{ name: string; kind: string; address?: number }>;
      };
      expect(d8Map.generator?.entrySymbol).toBe('main');
      expect(d8Map.generator?.entryAddress).toBe(0x0000);
      expect(
        d8Map.symbols?.some((s) => s.name === 'main' && s.kind === 'label' && s.address === 0x0000),
      ).toBe(true);
    });
  }, 20_000);

  it('writes D8 generator inputs and project-relative source keys with --source-root', async () => {
    const work = await makeCliWorkDir('azm-cli-d8-root-');
    const fixture = await writeD8ProjectFixture(work);

    const res = await runCli(['--source-root', fixture.project, '-o', fixture.hex, fixture.entry]);
    expect(res.code).toBe(0);

    const d8Map = JSON.parse(await readFile(join(fixture.build, 'pacmo.d8.json'), 'utf8')) as {
      generator?: {
        name?: string;
        tool?: string;
        version?: string;
        inputs?: Record<string, string>;
      };
      files?: Record<string, unknown>;
      symbols?: Array<{
        name: string;
        kind: string;
        file?: string;
        address?: number;
        value?: number;
      }>;
    };
    expect(d8Map.generator).toMatchObject({
      name: 'azm',
      tool: 'azm',
      version: packageVersion.version,
      inputs: {
        entry: 'src/pacmo/pacmo.z80',
        hex: 'build/pacmo.hex',
      },
    });
    expect(Object.keys(d8Map.files ?? {}).sort()).toEqual([
      'src/pacmo/movement.asm',
      'src/pacmo/pacmo.z80',
      'src/shared/constants.asm',
    ]);
    expect(Object.keys(d8Map.files ?? {}).some((key) => key.startsWith('build/'))).toBe(false);

    const symbols = d8Map.symbols ?? [];
    const colorRed = symbols.find((symbol) => symbol.name === 'ColorRed');
    expect(colorRed).toMatchObject({
      kind: 'constant',
      value: 1,
      file: 'src/shared/constants.asm',
    });
    expect(colorRed).not.toHaveProperty('address');
    expect(symbols.find((symbol) => symbol.name === 'main')).toMatchObject({
      kind: 'label',
      address: 2,
      file: 'src/pacmo/pacmo.z80',
    });

    await removeCliWorkDir(work);
  }, 20_000);

  it('honors suppression flags', async () => {
    await withCliMainFixture(async ({ work, entry }) => {
      const outHex = join(work, 'out.hex');
      const res = await runCli(['--nobin', '--nod8m', '-o', outHex, entry]);
      expect(res.code).toBe(0);

      await expectCliArtifacts(work, 'out', {
        hex: true,
        bin: false,
        'd8.json': false,
      });
    });
  }, 20_000);

  it('writes ASM80-compatible lowered source as .z80 when --asm80 is set', async () => {
    await withCliMainFixture(async ({ work, entry }) => {
      const outHex = join(work, 'out.hex');
      const res = await runCli(['--asm80', '--nobin', '--nod8m', '-o', outHex, entry]);
      expect(res.code).toBe(0);

      await expectCliArtifacts(work, 'out', { hex: true, z80: true, asm80: false });
    });
  }, 20_000);

  it('suppresses hex output for --type bin with --nohex', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outBin = join(work, 'out.bin');
    const res = await runCli([
      '--nohex',
      '--nod8m',
      '--type',
      'bin',
      '-o',
      outBin,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);

    await expectCliArtifacts(work, 'out', { bin: true, hex: false, 'd8.json': false });

    await removeCliWorkDir(work);
  }, 20_000);

  it('rejects --type hex when --nohex is set', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--nohex', '--type', 'hex', '-o', outHex, entry]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--type hex requires HEX output to be enabled');

    await removeCliWorkDir(work);
  }, 20_000);

  it('prints the primary output path for --type bin', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outBin = join(work, 'out.bin');
    const res = await runCli(['--type', 'bin', '-o', outBin, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);

    await expectCliArtifacts(work, 'out', { bin: true, hex: true });

    await removeCliWorkDir(work);
  }, 20_000);

  it('resolves imports from repeated -I include paths', async () => {
    const {
      work,
      includes,
      entry,
      output: outHex,
    } = await writeCliIncludeFixture('azm-cli-include', 'out.hex');

    const res = await runCli(['-I', includes, '-o', outHex, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outHex);
    expect(await exists(outHex)).toBe(true);

    await removeCliWorkDir(work);
  }, 20_000);

  it('accepts equals-form long options for output/type/include', async () => {
    const {
      work,
      includes,
      entry,
      output: outBin,
    } = await writeCliIncludeFixture('azm-cli-equals', 'out.bin');

    const res = await runCli([`--include=${includes}`, '--type=bin', `--output=${outBin}`, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);
    expect(await exists(outBin)).toBe(true);
    expect(await exists(join(work, 'out.hex'))).toBe(true);

    await removeCliWorkDir(work);
  }, 20_000);

  it('rejects entry when it is not the last argument', async () => {
    await withCliMainFixture(async ({ entry }) => {
      const res = await runCli([entry, '--nohex']);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('must be last');
    });
  }, 20_000);

  it('rejects removed --nolist option', async () => {
    await withCliMainFixture(async ({ entry }) => {
      const res = await runCli(['--nolist', entry]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('Unknown option "--nolist"');
    });
  }, 20_000);

  it('returns usage error for unknown options', async () => {
    await withCliMainFixture(async ({ entry }) => {
      const res = await runCli(['--badflag', entry]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('Unknown option');
    });
  }, 20_000);
});
