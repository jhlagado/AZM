import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmSource } from './current-azm-runner.js';
import { runNextAzmSource } from './next-azm-runner.js';

describe('AZM Next differential alias and storage fixture', () => {
  it('compares a Stage 6 alias-and-storage fixture source against current AZM', async () => {
    const source = await readFile(
      new URL('./fixtures/alias_and_storage.asm', import.meta.url),
      'utf8',
    );

    const current = await runCurrentAzmSource(source);
    const next = runNextAzmSource(source);
    expect(compareRunResults(current, next)).toEqual([]);
  });
});
