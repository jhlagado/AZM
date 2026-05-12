import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  hasRawOpcode,
  isMemIxDisp,
  isMemName,
  isReg,
} from './helpers/lowered_program.js';

const compileLowered = async (entry: string) => {
  const res = await compilePlacedProgram(entry);
  expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return flattenLoweredInstructions(res.program);
};

describe('PR406: indexed word EAW matrix coverage', () => {
  it('uses EAW_GLOB_FVAR for global base + frame word index', async () => {
    const instrs = await compileLowered(
      join(__dirname, '..', 'test', 'language-tour', '66_word_glob_fvar.zax'),
    );
    expect(hasRawOpcode(instrs, 0x11)).toBe(true); // LD DE, nn
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isMemIxDisp(ins.operands[1], 4),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isMemIxDisp(ins.operands[1], 5),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'HL'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'DE'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'A') && isMemName(ins.operands[1], 'HL'),
      ),
    ).toBe(false);
  });

  it('uses EAW_FVAR_FVAR for frame base + frame word index', async () => {
    const instrs = await compileLowered(
      join(__dirname, '..', 'test', 'language-tour', '67_word_fvar_fvar.zax'),
    );

    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isMemIxDisp(ins.operands[1], 4),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isMemIxDisp(ins.operands[1], 5),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ex' && isReg(ins.operands[0], 'DE') && isReg(ins.operands[1], 'HL'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isMemIxDisp(ins.operands[1], 6),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isMemIxDisp(ins.operands[1], 7),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'HL'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemName(ins.operands[0], 'HL') && isReg(ins.operands[1], 'E'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemName(ins.operands[0], 'HL') && isReg(ins.operands[1], 'D'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'A') && isMemName(ins.operands[1], 'HL'),
      ),
    ).toBe(false);
  });

  it('uses EAW_FVAR_GLOB for frame base + global word index', async () => {
    const instrs = await compileLowered(
      join(__dirname, '..', 'test', 'language-tour', '68_word_fvar_glob.zax'),
    );

    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isMemIxDisp(ins.operands[1], 4),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isMemIxDisp(ins.operands[1], 5),
      ),
    ).toBe(true);
    expect(hasRawOpcode(instrs, 0x2a)).toBe(true); // LD HL, (nn)
    expect(
      instrs.some(
        (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'HL'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'DE'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'A') && isMemName(ins.operands[1], 'HL'),
      ),
    ).toBe(false);
  });

  it('uses EAW_GLOB_GLOB for global base + global word index', async () => {
    const instrs = await compileLowered(
      join(__dirname, '..', 'test', 'language-tour', '69_word_glob_glob.zax'),
    );

    expect(hasRawOpcode(instrs, 0x11)).toBe(true); // LD DE, nn
    expect(hasRawOpcode(instrs, 0x2a)).toBe(true); // LD HL, (nn)
    expect(
      instrs.some(
        (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'HL'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'DE'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemName(ins.operands[0], 'HL') && isReg(ins.operands[1], 'E'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isMemName(ins.operands[0], 'HL') && isReg(ins.operands[1], 'D'),
      ),
    ).toBe(true);
    expect(
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'A') && isMemName(ins.operands[1], 'HL'),
      ),
    ).toBe(false);
  });
});
