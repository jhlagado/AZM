import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmSource } from './current-azm-runner.js';
import { runNextAzmSource } from './next-azm-runner.js';

const fixtureDir = new URL('./fixtures/', import.meta.url);
const fixtureFiles = [
  'minimal.asm',
  'fixup_slice.asm',
  'alias_and_storage.asm',
];

describe('AZM Next differential fixture corpus', () => {
  it('compares a small fixture set against current AZM', async () => {
    for (const file of fixtureFiles) {
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
});
