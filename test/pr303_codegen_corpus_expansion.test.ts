import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { HexArtifact } from '../src/formats/types.js';

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
  opcodeHexDir: string;
  mirrorDir: string;
};

async function readManifest(): Promise<CorpusManifest> {
  const path = join(__dirname, 'fixtures', 'corpus', 'manifest.json');
  return JSON.parse(await readFile(path, 'utf8')) as CorpusManifest;
}

describe('PR303: curated codegen corpus expansion', () => {
  it('adds the first scalar language-tour slice from 30+ to the curated manifest', async () => {
    const manifest = await readManifest();
    const languageTourEntries = new Map(
      manifest.curatedCases
        .filter((entry) => entry.kind === 'language-tour')
        .map((entry) => [entry.name, entry.source]),
    );

    expect(languageTourEntries.get('30_scalar_byte_glob')).toBe(
      'test/language-tour/30_scalar_byte_glob.zax',
    );
    expect(languageTourEntries.get('31_scalar_byte_frame')).toBe(
      'test/language-tour/31_scalar_byte_frame.zax',
    );
    expect(languageTourEntries.get('32_scalar_word_glob')).toBe(
      'test/language-tour/32_scalar_word_glob.zax',
    );
    expect(languageTourEntries.get('33_scalar_word_frame')).toBe(
      'test/language-tour/33_scalar_word_frame.zax',
    );
  });

  it('keeps regenerated hex in sync with the expanded curated manifest', async () => {
    const manifest = await readManifest();

    for (const entry of manifest.curatedCases) {
      const entryPath = join(__dirname, '..', entry.source);
      const mirrorBase = join(__dirname, '..', manifest.mirrorDir, entry.name);
      const opcodeHexPath = join(__dirname, '..', manifest.opcodeHexDir, `${entry.name}.hex`);

      const [mirrorSource, sourceText, expectedHex] = await Promise.all([
        readFile(`${mirrorBase}.zax`, 'utf8'),
        readFile(entryPath, 'utf8'),
        readFile(opcodeHexPath, 'utf8'),
      ]);

      expect(mirrorSource).toBe(sourceText);

      const res = await compile(entryPath, { emitHex: true }, { formats: defaultFormatWriters });
      expect(res.diagnostics).toEqual([]);

      const hex = res.artifacts.find((a): a is HexArtifact => a.kind === 'hex');

      expect(hex).toBeDefined();
      expect(hex!.text).toBe(expectedHex);
    }
  });
});
