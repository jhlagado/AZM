import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type CorpusManifest = {
  curatedCases: Array<{ name: string; source: string; kind: string }>;
  negativeCases: Array<{ name: string; source: string; kind: string }>;
  opcodeHexDir: string;
  mirrorDir: string;
};

async function readManifest(): Promise<CorpusManifest> {
  const path = join(__dirname, 'fixtures', 'corpus', 'manifest.json');
  return JSON.parse(await readFile(path, 'utf8')) as CorpusManifest;
}

describe('PR453: codegen corpus workflow', () => {
  it('documents the supported regeneration command and ownership', async () => {
    const [workflowDoc, indexDoc] = await Promise.all([
      readFile(join(__dirname, '..', 'docs', 'reference', 'codegen-corpus-workflow.md'), 'utf8'),
      readFile(join(__dirname, '..', 'test', 'codegen-corpus', 'INDEX.md'), 'utf8'),
    ]);

    expect(workflowDoc).toContain('npm run regen:codegen-corpus');
    expect(workflowDoc).toContain('test/fixtures/corpus/manifest.json');
    expect(workflowDoc).toContain('test/language-tour/30+');
    expect(indexDoc).toContain('npm run regen:codegen-corpus');
    expect(indexDoc).toContain('docs/reference/codegen-corpus-workflow.md');
  });

  it('uses explicit mixed-source manifest entries and keeps artifacts present', async () => {
    const manifest = await readManifest();
    const curatedNames = manifest.curatedCases.map((entry) => entry.name).sort();

    for (const entry of manifest.curatedCases) {
      expect(entry.source.endsWith('.zax')).toBe(true);
      expect(entry.kind.length).toBeGreaterThan(0);
      await access(join(__dirname, '..', entry.source));
      await access(join(__dirname, '..', manifest.opcodeHexDir, `${entry.name}.hex`));
      await access(join(__dirname, '..', manifest.mirrorDir, `${entry.name}.zax`));
      await access(join(__dirname, '..', manifest.mirrorDir, `${entry.name}.bin`));
      await access(join(__dirname, '..', manifest.mirrorDir, `${entry.name}.hex`));
      await access(join(__dirname, '..', manifest.mirrorDir, `${entry.name}.z80`));
    }

    const opcodeHexNames = (await readdir(join(__dirname, '..', manifest.opcodeHexDir)))
      .filter((name) => name.endsWith('.hex'))
      .map((name) => name.slice(0, -4))
      .sort();

    expect(opcodeHexNames).toEqual(curatedNames);

    for (const entry of manifest.negativeCases) {
      expect(entry.source.endsWith('.zax')).toBe(true);
      expect(entry.kind.length).toBeGreaterThan(0);
      await access(join(__dirname, '..', entry.source));
      await access(join(__dirname, '..', manifest.mirrorDir, `${entry.name}.zax`));
    }
  });
});
