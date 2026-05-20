import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { exists, runCli } from '../helpers/cli.js';

const MAIN_SOURCE = ['main:', '    nop', '    ret', ''].join('\n');

describe('cli artifacts', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('writes default sibling artifacts from -o output path', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['-o', outHex, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outHex);

    expect(await exists(join(work, 'out.hex'))).toBe(true);
    expect(await exists(join(work, 'out.bin'))).toBe(true);
    expect(await exists(join(work, 'out.d8.json'))).toBe(true);
    expect(await exists(join(work, 'out.lst'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('uses entry stem as default primary output path when -o is omitted', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-default-out-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const res = await runCli([entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(join(work, 'main.hex'));

    expect(await exists(join(work, 'main.hex'))).toBe(true);
    expect(await exists(join(work, 'main.bin'))).toBe(true);
    expect(await exists(join(work, 'main.d8.json'))).toBe(true);
    expect(await exists(join(work, 'main.lst'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('uses flat AZM origin 0 when no ORG is provided', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-default-code-base-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

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

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('honors suppression flags', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-suppress-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--nobin', '--nod8m', '--nolist', '-o', outHex, entry]);
    expect(res.code).toBe(0);

    expect(await exists(join(work, 'out.hex'))).toBe(true);
    expect(await exists(join(work, 'out.bin'))).toBe(false);
    expect(await exists(join(work, 'out.d8.json'))).toBe(false);
    expect(await exists(join(work, 'out.lst'))).toBe(false);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('writes ASM80-compatible lowered source as .z80 when --asm80 is set', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-z80-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--asm80', '--nobin', '--nod8m', '--nolist', '-o', outHex, entry]);
    expect(res.code).toBe(0);

    expect(await exists(join(work, 'out.hex'))).toBe(true);
    expect(await exists(join(work, 'out.z80'))).toBe(true);
    expect(await exists(join(work, 'out.asm80'))).toBe(false);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('suppresses hex output for --type bin with --nohex', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-nohex-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const outBin = join(work, 'out.bin');
    const res = await runCli([
      '--nohex',
      '--nod8m',
      '--nolist',
      '--type',
      'bin',
      '-o',
      outBin,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);

    expect(await exists(join(work, 'out.bin'))).toBe(true);
    expect(await exists(join(work, 'out.hex'))).toBe(false);
    expect(await exists(join(work, 'out.d8.json'))).toBe(false);
    expect(await exists(join(work, 'out.lst'))).toBe(false);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects --type hex when --nohex is set', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-nohex-hex-type-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--nohex', '--type', 'hex', '-o', outHex, entry]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--type hex requires HEX output to be enabled');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('prints the primary output path for --type bin', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-bin-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const outBin = join(work, 'out.bin');
    const res = await runCli(['--type', 'bin', '-o', outBin, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);

    expect(await exists(join(work, 'out.bin'))).toBe(true);
    expect(await exists(join(work, 'out.hex'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('resolves imports from repeated -I include paths', async () => {
    const tmpRoot = join(__dirname, '..', 'tmp');
    const work = join(tmpRoot, 'cli-include');
    const includes = join(work, 'includes');
    const entry = join(work, 'main.azm');
    const outHex = join(work, 'out.hex');

    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(includes, { recursive: true });
    await writeFile(entry, ['.include "lib.inc"', 'main:', '    call helper', '    ret', ''].join('\n'), 'utf8');
    await writeFile(join(includes, 'lib.inc'), ['helper:', '    nop', '    ret', ''].join('\n'), 'utf8');

    const res = await runCli([
      '-I',
      includes,
      '-o',
      outHex,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outHex);
    expect(await exists(outHex)).toBe(true);

    await rm(tmpRoot, { recursive: true, force: true });
  }, 20_000);

  it('accepts equals-form long options for output/type/include', async () => {
    const tmpRoot = join(__dirname, '..', 'tmp');
    const work = join(tmpRoot, 'cli-equals');
    const includes = join(work, 'includes');
    const entry = join(work, 'main.azm');
    const outBin = join(work, 'out.bin');

    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(includes, { recursive: true });
    await writeFile(entry, ['.include "lib.inc"', 'main:', '    call helper', '    ret', ''].join('\n'), 'utf8');
    await writeFile(join(includes, 'lib.inc'), ['helper:', '    nop', '    ret', ''].join('\n'), 'utf8');

    const res = await runCli([
      `--include=${includes}`,
      '--type=bin',
      `--output=${outBin}`,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);
    expect(await exists(outBin)).toBe(true);
    expect(await exists(join(__dirname, '..', 'tmp', 'cli-equals', 'out.hex'))).toBe(true);

    await rm(tmpRoot, { recursive: true, force: true });
  }, 20_000);

  it('rejects entry when it is not the last argument', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-entry-last-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const res = await runCli([entry, '--nolist']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('must be last');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('returns usage error for unknown options', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-cli-unknown-opt-'));
    const entry = join(work, 'main.azm');
    await writeFile(entry, MAIN_SOURCE, 'utf8');

    const res = await runCli(['--badflag', entry]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unknown option');

    await rm(work, { recursive: true, force: true });
  }, 20_000);
});
