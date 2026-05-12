import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compilePlacedProgram, flattenLoweredItems } from '../helpers/lowered_program.js';

describe('PR544 program lowering integration', () => {
  it('keeps top-level declaration traversal stable', async () => {
    const res = await compilePlacedProgram(join(__dirname, '..', 'fixtures', 'pr544_program_lowering.zax'));
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const items = flattenLoweredItems(res.program);
    const labels = new Set(
      items.filter((item) => item.kind === 'label').map((item) => item.name.toLowerCase()),
    );
    const consts = new Set(
      items.filter((item) => item.kind === 'const').map((item) => item.name.toLowerCase()),
    );
    expect(labels.has('helper')).toBe(true);
    expect(labels.has('main')).toBe(true);

    const symbols = res.program.symbols ?? [];
    const symbolNames = new Set(symbols.map((sym) => sym.name.toLowerCase()));
    const hasName = (name: string) =>
      labels.has(name.toLowerCase()) || consts.has(name.toLowerCase()) || symbolNames.has(name.toLowerCase());
    expect(hasName('arr')).toBe(true);
    expect(hasName('K')).toBe(true);
  });
});
