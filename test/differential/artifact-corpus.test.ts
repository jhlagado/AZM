import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';

const d8mArtifactFixtures = ['fixup_slice.asm', 'minimal.asm'];
const listingArtifactFixtures = ['alias_and_storage.asm', 'fixup_slice.asm', 'minimal.asm'];

describe('AZM Next differential Listing/D8 artifact corpus', () => {
  it('compares listing artifacts for the supported listing fixture set', async () => {
    for (const file of listingArtifactFixtures) {
      const fixtureUrl = new URL(`./fixtures/${file}`, import.meta.url);
      const fixturePath = fileURLToPath(fixtureUrl);
      const current = await runCurrentAzmFixture(fixturePath, [], { emitSidecars: true });
      const next = await runNextAzmFixture(fixturePath, [], { emitSidecars: true });

      expect(
        compareRunResults(current, next, { compareListing: true }),
        `fixture ${file} listing should match`,
      ).toEqual([]);
    }
  }, 60_000);

  it('compares D8 artifacts for the supported D8 fixture set', async () => {
    for (const file of d8mArtifactFixtures) {
      const fixtureUrl = new URL(`./fixtures/${file}`, import.meta.url);
      const fixturePath = fileURLToPath(fixtureUrl);
      const current = await runCurrentAzmFixture(fixturePath, [], { emitSidecars: true });
      const next = await runNextAzmFixture(fixturePath, [], { emitSidecars: true });

      expect(
        compareRunResults(current, next, { compareD8m: true }),
        `fixture ${file} D8 should match`,
      ).toEqual([]);
    }
  }, 60_000);
});
