import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadBinInput, loadHexInput, parseIntelHex } from '../src/lowering/inputAssets.js';

describe('PR473: input asset helpers', () => {
  it('resolves and loads bin inputs through include dirs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zax-pr473-bin-'));
    const srcDir = join(root, 'src');
    const includeDir = join(root, 'assets');
    await mkdir(srcDir);
    await mkdir(includeDir);

    const ownerFile = join(srcDir, 'main.zax');
    const assetPath = join(includeDir, 'blob.bin');
    await writeFile(ownerFile, 'export func main(): AF, BC, DE, HL\nend\n', 'utf8');
    await writeFile(assetPath, Buffer.from([0xaa, 0xbb, 0xcc]));

    const diagnostics: string[] = [];
    const blob = loadBinInput(ownerFile, 'blob.bin', [includeDir], (_file, message) =>
      diagnostics.push(message),
    );

    expect(diagnostics).toEqual([]);
    expect(blob).toEqual(Buffer.from([0xaa, 0xbb, 0xcc]));
  });

  it('loads and parses Intel HEX inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zax-pr473-hex-'));
    const srcDir = join(root, 'src');
    const includeDir = join(root, 'assets');
    await mkdir(srcDir);
    await mkdir(includeDir);

    const ownerFile = join(srcDir, 'main.zax');
    const assetPath = join(includeDir, 'blob.hex');
    await writeFile(ownerFile, 'export func main(): AF, BC, DE, HL\nend\n', 'utf8');
    await writeFile(assetPath, ':020010001234A8\n:00000001FF\n', 'utf8');

    const diagnostics: string[] = [];
    const parsed = loadHexInput(ownerFile, 'blob.hex', [includeDir], (_file, message) =>
      diagnostics.push(message),
    );

    expect(diagnostics).toEqual([]);
    expect(parsed).toBeDefined();
    expect(parsed!.minAddress).toBe(0x10);
    expect(Array.from(parsed!.bytes.entries())).toEqual([
      [0x10, 0x12],
      [0x11, 0x34],
    ]);
  });

  it('rejects malformed Intel HEX records', () => {
    const diagnostics: string[] = [];
    const parsed = parseIntelHex('owner.zax', ':020010001234A9', (_file, message) =>
      diagnostics.push(message),
    );

    expect(parsed).toBeUndefined();
    expect(diagnostics).toEqual([expect.stringContaining('checksum mismatch')]);
  });
});
