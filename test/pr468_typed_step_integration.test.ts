import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  formatLoweredInstructions,
  flattenLoweredInstructions,
  hasRawOpcode,
} from './helpers/lowered_program.js';

describe('PR468 typed-step integration coverage', () => {
  it('locks the current word mixed-path load/store sequence emitted through typed steps', async () => {
    const { program, diagnostics } = await compilePlacedProgram(
      join(__dirname, 'fixtures', 'pr406_word_mem_to_mem_mixed_reverse.zax'),
    );
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const lines = formatLoweredInstructions(program).map((line) => line.toUpperCase());
    const instrs = flattenLoweredInstructions(program);

    expect(lines).toContain('LD E, (HL)');
    expect(lines).toContain('INC HL');
    expect(lines).toContain('LD D, (HL)');
    expect(hasRawOpcode(instrs, 0xed, 0x53)).toBe(true);
    expect(lines).not.toContain('LD A, (HL)');
  });

  it('locks the current indexed byte template path emitted through typed steps', async () => {
    const { program, diagnostics } = await compilePlacedProgram(
      join(__dirname, 'fixtures', 'pr405_byte_indexed_templates.zax'),
    );
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const lines = formatLoweredInstructions(program).map((line) => line.toUpperCase());
    const instrs = flattenLoweredInstructions(program);

    expect(lines).toContain('PUSH DE');
    expect(lines).toContain('PUSH HL');
    expect(hasRawOpcode(instrs, 0x11)).toBe(true);
    expect(lines).toContain('ADD HL, DE');
    expect(lines).toContain('LD A, (HL)');
    expect(lines).toContain('LD (HL), D');
  });
});
