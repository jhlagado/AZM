import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('compileNext', () => {
  it('starts with an empty diagnostic result', () => {
    expect(compileNext('')).toEqual({
      bytes: new Uint8Array(),
      diagnostics: [],
      hexText: ':00000001FF\n',
      symbols: {},
    });
  });
});
