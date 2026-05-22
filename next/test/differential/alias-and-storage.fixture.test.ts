import { describe, it, expect } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmSource } from './current-azm-runner.js';
import { runNextAzmSource } from './next-azm-runner.js';

describe('AZM Next differential alias and storage fixture', () => {
  it('compares a Stage 6 storage slice source against current AZM', async () => {
    const source = `
        ORG 0100H
TITLE:  CSTR "OK"
        PSTR "Z"
        ISTR "A"
Count EQU 2
        .db Count
        .align 4
        .ds 2, 0EEH
        .end
`;

    const current = await runCurrentAzmSource(source);
    const next = runNextAzmSource(source);
    expect(compareRunResults(current, next)).toEqual([]);
  });
});
