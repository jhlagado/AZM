import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmSource } from './current-azm-runner.js';
import { runNextAzmSource } from './next-azm-runner.js';

describe('AZM Next differential minimal fixture', () => {
  it('compares a tiny source file against current AZM', async () => {
    const source = `
        ORG 0100H
VALUE   EQU 42
START:
        LD A,VALUE
        RET
`;
    const current = await runCurrentAzmSource(source);
    const next = runNextAzmSource(source);
    expect(compareRunResults(current, next)).toEqual([]);
  });
});
