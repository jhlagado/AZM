import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmSource } from './current-azm-runner.js';
import { runNextAzmSource } from './next-azm-runner.js';

describe.skip('AZM Next differential minimal fixture', () => {
  it('compares a tiny source file against current AZM', () => {
    const source = `
        ORG 0100H
VALUE   EQU 42
START:
        LD A,VALUE
        RET
`;
    const current = runCurrentAzmSource(source);
    const next = runNextAzmSource(source);
    expect(compareRunResults(current, next)).toEqual([]);
  });
});
