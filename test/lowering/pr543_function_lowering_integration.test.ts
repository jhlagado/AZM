import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  formatLoweredInstructions,
  flattenLoweredItems,
  flattenLoweredInstructions,
  hasRawOpcode,
} from '../helpers/lowered_program.js';

describe('PR543 function lowering integration', () => {
  it('keeps implicit-ret function setup stable', async () => {
    const { program, diagnostics } = await compilePlacedProgram(
      join(__dirname, '..', 'fixtures', 'pr14_epilogue_locals.zax'),
    );
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const lines = formatLoweredInstructions(program).map((line) => line.toUpperCase());
    expect(lines).toContain('PUSH IX');
    expect(lines).toContain('LD IX, $00');
    expect(lines).toContain('ADD IX, SP');
    expect(lines).toContain('RET');

    const labels = flattenLoweredItems(program).filter((item) => item.kind === 'label');
    expect(labels.some((label) => label.name === '__zax_epilogue_0')).toBe(true);
  });

  it('keeps explicit ret routed through the synthetic epilogue', async () => {
    const { program, diagnostics } = await compilePlacedProgram(
      join(__dirname, '..', 'fixtures', 'pr543_function_ret_epilogue.zax'),
    );
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const lines = formatLoweredInstructions(program).map((line) => line.toUpperCase());
    expect(lines).toContain('RET');

    const labels = flattenLoweredItems(program).filter((item) => item.kind === 'label');
    expect(labels.some((label) => label.name === '__zax_epilogue_0')).toBe(true);

    const instrs = flattenLoweredInstructions(program);
    expect(hasRawOpcode(instrs, 0xc3)).toBe(true);
  });
});
