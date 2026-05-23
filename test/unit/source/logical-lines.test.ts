import { describe, expect, it } from 'vitest';

import { scanLogicalLines } from '../../../src/source/logical-lines.js';
import { createSourceFile } from '../../../src/source/source-file.js';

describe('scanLogicalLines', () => {
  it('keeps line numbers and strips trailing newlines', () => {
    const source = createSourceFile('main.asm', 'START:\n  NOP ; comment\n\n');
    expect(scanLogicalLines(source)).toEqual([
      { sourceName: 'main.asm', line: 1, text: 'START:' },
      { sourceName: 'main.asm', line: 2, text: '  NOP ; comment' },
      { sourceName: 'main.asm', line: 3, text: '' },
    ]);
  });
});
