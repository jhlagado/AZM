import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstructions,
  hasRawOpcode,
} from './helpers/lowered_program.js';

const compileLowered = async (entry: string) => {
  const res = await compilePlacedProgram(entry);
  expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const lines = formatLoweredInstructions(res.program).map((line) => line.toUpperCase());
  return {
    instrs: flattenLoweredInstructions(res.program),
    lines,
    text: lines.join('\n'),
  };
};

describe('PR896 := scalar path-to-path lowering', () => {
  it('lowers byte, word, and @path storage transfers end-to-end', async () => {
    const entry = join(__dirname, 'fixtures', 'pr896_assignment_ea_ea.zax');
    const { instrs, lines } = await compileLowered(entry);

    expect(lines.filter((line) => line === 'PUSH AF').length).toBeGreaterThan(0);
    expect(lines.filter((line) => line === 'POP AF').length).toBeGreaterThan(0);
    expect(lines.filter((line) => line === 'PUSH DE').length).toBeGreaterThan(0);
    expect(lines.filter((line) => line === 'POP DE').length).toBeGreaterThan(0);
    expect(lines.filter((line) => line === 'PUSH HL').length).toBeGreaterThan(0);
    expect(lines.filter((line) => line === 'POP HL').length).toBeGreaterThan(0);
    expect(hasRawOpcode(instrs, 0x7e)).toBe(true); // LD A, (HL)
    expect(hasRawOpcode(instrs, 0x77)).toBe(true); // LD (HL), A
    expect(hasRawOpcode(instrs, 0xed, 0x5b)).toBe(true); // LD DE, (nn)
    expect(hasRawOpcode(instrs, 0xed, 0x53)).toBe(true); // LD (nn), DE
  });

  it('avoids preserving HL for direct scalar fast paths', async () => {
    const entry = join(__dirname, 'fixtures', 'pr896_assignment_ea_ea_direct_fastpath.zax');
    const { instrs, lines } = await compileLowered(entry);

    expect(lines.filter((line) => line === 'PUSH HL').length).toBe(1);
    expect(lines.filter((line) => line === 'POP HL').length).toBe(1);
    expect(hasRawOpcode(instrs, 0xed, 0x5b)).toBe(true); // LD DE, (nn)
    expect(hasRawOpcode(instrs, 0xed, 0x53)).toBe(true); // LD (nn), DE
  });

  it('promotes the hidden word transfer pair when either path needs DE', async () => {
    const entry = join(__dirname, 'fixtures', 'pr896_assignment_ea_ea_conflict.zax');
    const { instrs, lines } = await compileLowered(entry);

    expect(lines.filter((line) => line === 'PUSH BC').length).toBeGreaterThan(0);
    expect(lines.filter((line) => line === 'POP BC').length).toBeGreaterThan(0);
    expect(hasRawOpcode(instrs, 0xed, 0x4b)).toBe(true); // LD BC, (nn)
    expect(hasRawOpcode(instrs, 0xed, 0x43)).toBe(true); // LD (nn), BC
  });
});
