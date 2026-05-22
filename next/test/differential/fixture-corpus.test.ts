import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmSource } from './current-azm-runner.js';
import { runNextAzmSource } from './next-azm-runner.js';
import {
  KNOWN_UNSUPPORTED_FIXTURE_FILES,
  KNOWN_UNSUPPORTED_FIXTURES,
} from './unsupported-fixtures.js';

const fixtureDir = new URL('./fixtures/', import.meta.url);
const fixtureFiles = await readdir(fixtureDir).then((files) =>
  files.filter((file) => file.toLowerCase().endsWith('.asm')).sort((a, b) => a.localeCompare(b)),
);

describe('AZM Next differential fixture corpus', () => {
  it('compares all supported fixture files against current AZM', async () => {
    for (const file of fixtureFiles) {
      if (KNOWN_UNSUPPORTED_FIXTURE_FILES.has(file.toLowerCase())) {
        continue;
      }

      if (!file.toLowerCase().endsWith('.asm')) {
        continue;
      }

      const source = await readFile(new URL(`./${file}`, fixtureDir), 'utf8');
      const current = await runCurrentAzmSource(source);
      const next = runNextAzmSource(source);
      const differences = compareRunResults(current, next);
      expect(differences, `fixture ${file} should match current AZM`).toEqual([]);
    }
  });

  it('tracks known unsupported fixtures for later reconciliation', () => {
    expect(new Set(KNOWN_UNSUPPORTED_FIXTURES.map((entry) => entry.file))).toEqual(
      KNOWN_UNSUPPORTED_FIXTURE_FILES,
    );
    expect(KNOWN_UNSUPPORTED_FIXTURES).toContainEqual(
      expect.objectContaining({
        file: 'enum_and_storage.asm',
      }),
    );
  });
});
