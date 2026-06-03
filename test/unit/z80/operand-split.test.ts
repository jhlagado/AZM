import { describe, expect, it } from 'vitest';

import { splitInstructionOperands } from '../../../src/z80/operand-split.js';

describe('splitInstructionOperands', () => {
  it('splits top-level operands without splitting nested expressions or strings', () => {
    expect(splitInstructionOperands('a,(ix+1), "x,y", FUNC(1,2)')).toEqual([
      'a',
      '(ix+1)',
      '"x,y"',
      'FUNC(1,2)',
    ]);
  });

  it('keeps apostrophes inside symbol-like operands out of quote state', () => {
    expect(splitInstructionOperands("label'suffix, a")).toEqual(["label'suffix", 'a']);
  });
});
