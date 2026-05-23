import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';
import { KNOWN_UNSUPPORTED_FIXTURE_FILES } from './unsupported-fixtures.js';

const rootFixtureDir = new URL('../fixtures/', import.meta.url);
const rootFixtureFiles = await readdir(rootFixtureDir).then((files) =>
  files.filter((file) => file.toLowerCase().endsWith('.asm')).sort((a, b) => a.localeCompare(b)),
);
const d8mArtifactFixtures = ['fixup_slice.asm', 'minimal.asm'];
const listingArtifactFixtures = ['alias_and_storage.asm', 'fixup_slice.asm', 'minimal.asm'];

const rootListingArtifactMismatchFixtures = new Set<string>([]);

const rootD8ArtifactMismatchFixtures = new Set([
  'pr1349_ld_a_indirect_bc.asm',
  'pr1349_ld_a_indirect_de.asm',
  'pr1349_ld_a_indirect_hl.asm',
  'pr1349_ld_indirect_bc_store.asm',
  'pr1349_ld_indirect_de_store.asm',
  'pr274_type_padding_explicit_ok.asm',
  'pr274_type_padding_warning.asm',
  'pr713_packed_top_level_arrays.asm',
  'pr786_raw_data_lowering.asm',
  'pr991_comment_preservation.asm',
  'pr1367_op_port_imm_substitution.asm',
]);

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

  it('classifies listing artifacts across the supported root fixture set', async () => {
    const includeDirs = [fileURLToPath(new URL('includes/', rootFixtureDir))];
    const observedMismatches: string[] = [];
    const nonListingDifferences: string[] = [];

    for (const file of supportedRootFixtures()) {
      const fixtureUrl = new URL(`./${file}`, rootFixtureDir);
      const current = await runCurrentAzmFixture(fileURLToPath(fixtureUrl), includeDirs, {
        emitSidecars: true,
      });
      const next = await runNextAzmFixture(fileURLToPath(fixtureUrl), includeDirs, {
        emitSidecars: true,
      });
      const differences = compareRunResults(current, next, { compareListing: true });
      const listingDifference = differences.find(
        (difference) => difference.field === 'listingText',
      );

      if (listingDifference) observedMismatches.push(file.toLowerCase());
      nonListingDifferences.push(
        ...differences
          .filter((difference) => difference.field !== 'listingText')
          .map((difference) => `${file}:${difference.field}`),
      );
    }

    expect(nonListingDifferences).toEqual([]);
    expect(new Set(observedMismatches)).toEqual(rootListingArtifactMismatchFixtures);
  }, 60_000);

  it('classifies D8 artifacts across the supported root fixture set', async () => {
    const includeDirs = [fileURLToPath(new URL('includes/', rootFixtureDir))];
    const observedMismatches: string[] = [];
    const nonD8Differences: string[] = [];

    for (const file of supportedRootFixtures()) {
      const fixtureUrl = new URL(`./${file}`, rootFixtureDir);
      const current = await runCurrentAzmFixture(fileURLToPath(fixtureUrl), includeDirs, {
        emitSidecars: true,
      });
      const next = await runNextAzmFixture(fileURLToPath(fixtureUrl), includeDirs, {
        emitSidecars: true,
      });
      const differences = compareRunResults(current, next, { compareD8m: true });
      const d8Difference = differences.find((difference) => difference.field === 'd8mJson');

      if (d8Difference) observedMismatches.push(file.toLowerCase());
      nonD8Differences.push(
        ...differences
          .filter((difference) => difference.field !== 'd8mJson')
          .map((difference) => `${file}:${difference.field}`),
      );
    }

    expect(nonD8Differences).toEqual([]);
    expect(new Set(observedMismatches)).toEqual(rootD8ArtifactMismatchFixtures);
  }, 60_000);

  it('keeps root artifact mismatch lists tied to supported fixtures', () => {
    const supportedFixtures = new Set(supportedRootFixtures().map((file) => file.toLowerCase()));

    expect(rootListingArtifactMismatchFixtures.size).toBe(0);
    expect(rootD8ArtifactMismatchFixtures.size).toBe(11);
    for (const file of rootListingArtifactMismatchFixtures) {
      expect(supportedFixtures.has(file)).toBe(true);
    }
    for (const file of rootD8ArtifactMismatchFixtures) {
      expect(supportedFixtures.has(file)).toBe(true);
    }
  });
});

function supportedRootFixtures(): string[] {
  return rootFixtureFiles.filter(
    (file) => !KNOWN_UNSUPPORTED_FIXTURE_FILES.has(file.toLowerCase()),
  );
}
