import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmSource } from './current-azm-runner.js';
import { runNextAzmSource } from './next-azm-runner.js';
import {
  KNOWN_UNSUPPORTED_FIXTURE_FILES,
  KNOWN_UNSUPPORTED_FIXTURES,
} from './unsupported-fixtures.js';

const fixtureDir = new URL('../../../test/fixtures/', import.meta.url);
const fixtureFiles = await readdir(fixtureDir).then((files) =>
  files
    .filter((file) => file.toLowerCase().endsWith('.asm'))
    .sort((a, b) => a.localeCompare(b)),
);

describe('AZM Next root fixture corpus', () => {
  const supportedFixtureSet = new Set(
    fixtureFiles
      .filter((file) => !KNOWN_UNSUPPORTED_FIXTURE_FILES.has(file.toLowerCase()))
      .map((file) => file.toLowerCase()),
  );

  it('compares all supported fixture files against current AZM', async () => {
    for (const file of fixtureFiles) {
      if (KNOWN_UNSUPPORTED_FIXTURE_FILES.has(file.toLowerCase())) {
        continue;
      }

      const source = await readFile(new URL(`./${file}`, fixtureDir), 'utf8');
      const current = await runCurrentAzmSource(source);
      const next = await runNextAzmSource(source);
      const differences = compareRunResults(current, next);

      expect(differences, `fixture ${file} should match current AZM`).toEqual([]);
    }
  });

  it('tracks known unsupported root fixtures', () => {
    const unsupportedSet = new Set(
      KNOWN_UNSUPPORTED_FIXTURES.map((entry) => entry.file.toLowerCase()),
    );
    const filesystemUnsupportedSet = new Set(
      fixtureFiles.filter((file) => unsupportedSet.has(file.toLowerCase())),
    );

    expect(new Set(KNOWN_UNSUPPORTED_FIXTURES.map((entry) => entry.file))).toEqual(
      KNOWN_UNSUPPORTED_FIXTURE_FILES,
    );
    expect(filesystemUnsupportedSet).toEqual(unsupportedSet);
    expect(supportedFixtureSet.size + unsupportedSet.size).toEqual(fixtureFiles.length);
    expect(KNOWN_UNSUPPORTED_FIXTURES).toHaveLength(43);
  });
});
