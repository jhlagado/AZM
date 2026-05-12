import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  findLoweredBlock,
  findRawAbs16Target,
  flattenLoweredInstructions,
  formatLoweredInstructions,
  hasRawOpcode,
  isMemIxDisp,
  isReg,
} from './helpers/lowered_program.js';

const compileLowered = async (entry: string) => {
  const res = await compilePlacedProgram(entry);
  expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return {
    ...res,
    instrs: flattenLoweredInstructions(res.program, res.map),
    text: formatLoweredInstructions(res.program).join('\n').toUpperCase(),
  };
};

describe('PR406: word scalar accessors', () => {
  it('uses direct global word accessors for BC/DE', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_global_scalar_accessors.zax');
    const lowered = await compileLowered(entry);

    expect(
      findLoweredBlock(lowered.program, {
        kind: 'section',
        section: 'code',
        name: 'main',
        origin: 0x0100,
      }),
    ).toBeDefined();
    expect(findRawAbs16Target(lowered, { opcode: 0xed, opcode2: 0x4b, target: 'glob_w' })).toBeDefined();
    expect(findRawAbs16Target(lowered, { opcode: 0xed, opcode2: 0x5b, target: 'glob_w' })).toBeDefined();
    expect(findRawAbs16Target(lowered, { opcode: 0xed, opcode2: 0x43, target: 'glob_w' })).toBeDefined();
    expect(findRawAbs16Target(lowered, { opcode: 0xed, opcode2: 0x53, target: 'glob_w' })).toBeDefined();
  });

  it('uses direct frame word accessors for BC/DE', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_frame_scalar_accessors.zax');
    const { instrs } = await compileLowered(entry);

    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'C') && isMemIxDisp(ins.operands[1], -2),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'B') && isMemIxDisp(ins.operands[1], -1),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isMemIxDisp(ins.operands[1], -2),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isMemIxDisp(ins.operands[1], -1),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemIxDisp(ins.operands[0], -2) && isReg(ins.operands[1], 'C'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemIxDisp(ins.operands[0], -1) && isReg(ins.operands[1], 'B'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemIxDisp(ins.operands[0], -2) && isReg(ins.operands[1], 'E'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemIxDisp(ins.operands[0], -1) && isReg(ins.operands[1], 'D'),
      ),
    ).toBe(true);
  });

  it('uses scalar word accessors for typed call arguments', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_call_scalar_arg.zax');
    const { text, instrs } = await compileLowered(entry);

    expect(hasRawOpcode(instrs, 0x2a)).toBe(true); // LD HL, (nn)
    expect(text).toContain('PUSH HL');
    expect(text).toContain('EX DE, HL');
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isMemIxDisp(ins.operands[1], -2),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isMemIxDisp(ins.operands[1], -1),
      ),
    ).toBe(true);
  });

  it('uses scalar word accessors for scalar mem-to-mem moves', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_mem_to_mem_scalar.zax');
    const { text, instrs } = await compileLowered(entry);

    expect(hasRawOpcode(instrs, 0xed, 0x5b)).toBe(true); // LD DE, (nn)
    expect(hasRawOpcode(instrs, 0xed, 0x53)).toBe(true); // LD (nn), DE
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemIxDisp(ins.operands[0], -2) && isReg(ins.operands[1], 'E'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemIxDisp(ins.operands[0], -1) && isReg(ins.operands[1], 'D'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isMemIxDisp(ins.operands[1], -2),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isMemIxDisp(ins.operands[1], -1),
      ),
    ).toBe(true);
    expect(text).not.toContain('LD A, (HL)');
  });
});
