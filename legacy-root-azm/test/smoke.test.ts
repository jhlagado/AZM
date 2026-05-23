import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';

/*
 * Ensures Vitest can load the real compiler entry (`compile`) and its module graph,
 * not only type-only pipeline contracts.
 */
describe('smoke', () => {
  it('loads the compiler entry', () => {
    expect(compile).toBeTypeOf('function');
  });
});
