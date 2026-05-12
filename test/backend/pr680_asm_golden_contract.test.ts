import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { HexArtifact } from '../../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type CorpusEntry = {
  name: string;
  source: string;
  kind: string;
};

type CorpusManifest = {
  curatedCases: CorpusEntry[];
  negativeCases: CorpusEntry[];
  goldenZ80Dir: string;
  opcodeHexDir: string;
  mirrorDir: string;
};

async function readManifest(): Promise<CorpusManifest> {
  const path = join(__dirname, '..', 'fixtures', 'corpus', 'manifest.json');
  return JSON.parse(await readFile(path, 'utf8')) as CorpusManifest;
}

describe('PR680: asm80 golden contract coverage for curated corpus', () => {
  it('matches emitted hex bytes to checked-in corpus opcode goldens', async () => {
    const manifest = await readManifest();

    for (const entry of manifest.curatedCases) {
      const sourcePath = join(__dirname, '..', '..', entry.source);
      const expectedHexPath = join(
        __dirname,
        '..',
        '..',
        manifest.opcodeHexDir,
        `${entry.name}.hex`,
      );
      const expectedHex = await readFile(expectedHexPath, 'utf8');

      const result = await compile(
        sourcePath,
        {
          emitBin: false,
          emitHex: true,
          emitD8m: false,
          emitListing: false,
          emitAsm80: false,
        },
        { formats: defaultFormatWriters },
      );
      expect(result.diagnostics).toEqual([]);

      const hex = result.artifacts.find(
        (artifact): artifact is HexArtifact => artifact.kind === 'hex',
      );
      expect(hex).toBeDefined();
      expect(hex!.text).toBe(expectedHex);
    }
  });
});
