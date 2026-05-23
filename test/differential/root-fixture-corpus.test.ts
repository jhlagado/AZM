import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';
import {
  KNOWN_UNSUPPORTED_FIXTURE_FILES,
  KNOWN_UNSUPPORTED_FIXTURES,
} from './unsupported-fixtures.js';

const fixtureDir = new URL('../fixtures/', import.meta.url);
const fixtureFiles = await readdir(fixtureDir).then((files) =>
  files.filter((file) => file.toLowerCase().endsWith('.asm')).sort((a, b) => a.localeCompare(b)),
);

describe('AZM Next root fixture corpus', () => {
  const supportedFixtureSet = new Set(
    fixtureFiles
      .filter((file) => !KNOWN_UNSUPPORTED_FIXTURE_FILES.has(file.toLowerCase()))
      .map((file) => file.toLowerCase()),
  );

  it('compares all supported fixture files against current AZM', async () => {
    const includeDirs = [fileURLToPath(new URL('includes/', fixtureDir))];

    for (const file of fixtureFiles) {
      if (KNOWN_UNSUPPORTED_FIXTURE_FILES.has(file.toLowerCase())) {
        continue;
      }

      const fixtureUrl = new URL(`./${file}`, fixtureDir);
      const current = await runCurrentAzmFixture(fileURLToPath(fixtureUrl), includeDirs);
      const next = await runNextAzmFixture(fileURLToPath(fixtureUrl), includeDirs);
      const differences = compareRunResults(current, next);

      expect(differences, `fixture ${file} should match current AZM`).toEqual([]);
    }
  }, 60_000);

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
    expect(KNOWN_UNSUPPORTED_FIXTURES).toHaveLength(0);
  });
});
