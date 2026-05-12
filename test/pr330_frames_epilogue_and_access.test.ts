import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { compilePlacedProgram, flattenLoweredInstructions, isMemIxDisp, operandUsesIx } from './helpers/lowered_program.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

describe('PR330: frame access + synthetic epilogue rules', () => {
  it('loads/stores frame slots without illegal IX+H/L forms and uses DE shuttle', async () => {
    const entry = join(__dirname, 'fixtures', 'pr330_frame_access_positive.zax');
    const { program, diagnostics } = await compilePlacedProgram(entry);
    expectNoErrors(diagnostics);

    const instrs = flattenLoweredInstructions(program);
    const hasLdRegFromIx = (reg: string, disp: number) =>
      instrs.some((ins) => ins.head.toUpperCase() === 'LD' && ins.operands[0]?.kind === 'reg' && ins.operands[0].name.toUpperCase() === reg && isMemIxDisp(ins.operands[1], disp));
    const hasLdIxFromReg = (disp: number, reg: string) =>
      instrs.some((ins) => ins.head.toUpperCase() === 'LD' && isMemIxDisp(ins.operands[0], disp) && ins.operands[1]?.kind === 'reg' && ins.operands[1].name.toUpperCase() === reg);

    expect(hasLdRegFromIx('E', 4)).toBe(true);
    expect(hasLdRegFromIx('D', 5)).toBe(true);
    expect(hasLdIxFromReg(-2, 'E')).toBe(true);
    expect(hasLdIxFromReg(-1, 'D')).toBe(true);

    const hasLdLFromIx = instrs.some((ins) => ins.head.toUpperCase() === 'LD' && ins.operands[0]?.kind === 'reg' && ins.operands[0].name.toUpperCase() === 'L' && ins.operands[1] && operandUsesIx(ins.operands[1]));
    const hasLdHFromIx = instrs.some((ins) => ins.head.toUpperCase() === 'LD' && ins.operands[0]?.kind === 'reg' && ins.operands[0].name.toUpperCase() === 'H' && ins.operands[1] && operandUsesIx(ins.operands[1]));
    expect(hasLdLFromIx).toBe(false);
    expect(hasLdHFromIx).toBe(false);
  });

  it('rejects retn/reti when a framed function requires epilogue cleanup', async () => {
    const entry = join(__dirname, 'fixtures', 'pr330_retn_reti_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      messageIncludes: 'not supported in functions that require cleanup',
    });
  });
});
