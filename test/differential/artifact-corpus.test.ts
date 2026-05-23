import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';

const artifactFixtures = ['fixup_slice.asm', 'minimal.asm'];

describe('AZM Next differential Listing/D8 artifact corpus', () => {
  it('compares sidecar artifacts for the supported artifact fixture set', async () => {
    for (const file of artifactFixtures) {
      const fixtureUrl = new URL(`./fixtures/${file}`, import.meta.url);
      const fixturePath = fileURLToPath(fixtureUrl);
      const current = await runCurrentAzmFixture(fixturePath, [], { emitSidecars: true });
      const next = await runNextAzmFixture(fixturePath, [], { emitSidecars: true });

      expect(compareRunResults(current, next), `fixture ${file} sidecars should match`).toEqual([]);
    }
  }, 60_000);
});
