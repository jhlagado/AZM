import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { exists, runCli } from '../helpers/cli.js';

describe('cli artifacts', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('writes default sibling artifacts from -o output path', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

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
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-default-out-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

    const res = await runCli([entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(join(work, 'main.hex'));

    expect(await exists(join(work, 'main.hex'))).toBe(true);
    expect(await exists(join(work, 'main.bin'))).toBe(true);
    expect(await exists(join(work, 'main.d8.json'))).toBe(true);
    expect(await exists(join(work, 'main.lst'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('defaults CLI code base to $0100 when no section code base is provided', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-default-code-base-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n  nop\nend\n', 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['-o', outHex, entry]);
    expect(res.code).toBe(0);

    const d8Path = join(work, 'out.d8.json');
    const d8Map = JSON.parse(await readFile(d8Path, 'utf8')) as {
      generator?: { entryAddress?: number; entrySymbol?: string };
      symbols?: Array<{ name: string; kind: string; address?: number }>;
    };
    expect(d8Map.generator?.entrySymbol).toBe('main');
    expect(d8Map.generator?.entryAddress).toBe(0x0100);
    expect(
      d8Map.symbols?.some((s) => s.name === 'main' && s.kind === 'label' && s.address === 0x0100),
    ).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('honors suppression flags', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-suppress-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

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
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-z80-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--asm80', '--nobin', '--nod8m', '--nolist', '-o', outHex, entry]);
    expect(res.code).toBe(0);

    expect(await exists(join(work, 'out.hex'))).toBe(true);
    expect(await exists(join(work, 'out.z80'))).toBe(true);
    expect(await exists(join(work, 'out.asm80'))).toBe(false);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('suppresses hex output for --type bin with --nohex', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-nohex-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

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
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-nohex-hex-type-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--nohex', '--type', 'hex', '-o', outHex, entry]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--type hex requires HEX output to be enabled');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('prints the primary output path for --type bin', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-bin-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

    const outBin = join(work, 'out.bin');
    const res = await runCli(['--type', 'bin', '-o', outBin, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);

    expect(await exists(join(work, 'out.bin'))).toBe(true);
    expect(await exists(join(work, 'out.hex'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('resolves imports from repeated -I include paths', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr11_include_main.zax');
    const includes = join(__dirname, '..', 'fixtures', 'includes');
    const outHex = join(__dirname, '..', 'tmp', 'cli-include', 'out.hex');

    await rm(join(__dirname, '..', 'tmp'), { recursive: true, force: true });

    const res = await runCli([
      '-I',
      join(__dirname, '..', 'fixtures'),
      '-I',
      includes,
      '-o',
      outHex,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outHex);
    expect(await exists(outHex)).toBe(true);

    await rm(join(__dirname, '..', 'tmp'), { recursive: true, force: true });
  }, 20_000);

  it('accepts equals-form long options for output/type/include', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr11_include_main.zax');
    const includes = join(__dirname, '..', 'fixtures', 'includes');
    const outBin = join(__dirname, '..', 'tmp', 'cli-equals', 'out.bin');

    await rm(join(__dirname, '..', 'tmp'), { recursive: true, force: true });

    const res = await runCli([
      `--include=${join(__dirname, '..', 'fixtures')}`,
      `--include=${includes}`,
      '--type=bin',
      `--output=${outBin}`,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);
    expect(await exists(outBin)).toBe(true);
    expect(await exists(join(__dirname, '..', 'tmp', 'cli-equals', 'out.hex'))).toBe(true);

    await rm(join(__dirname, '..', 'tmp'), { recursive: true, force: true });
  }, 20_000);

  it('rejects entry when it is not the last argument', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-entry-last-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

    const res = await runCli([entry, '--nolist']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('must be last');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('returns usage error for unknown options', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-unknown-opt-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n    nop\nend\n', 'utf8');

    const res = await runCli(['--badflag', entry]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unknown option');

    await rm(work, { recursive: true, force: true });
  }, 20_000);
});
