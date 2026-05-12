import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';
import {
  compilePlacedProgram,
  formatLoweredInstructions,
  flattenLoweredInstructions,
  isMemIxDisp,
} from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR292 local var initializer completeness', () => {
  it('lowers local scalar value-init at function entry and keeps alias locals slot-free', async () => {
    const entry = join(__dirname, 'fixtures', 'pr292_local_scalar_init_and_alias_positive.zax');
    const { program, diagnostics } = await compilePlacedProgram(entry);
    expectNoErrors(diagnostics);

    const lines = formatLoweredInstructions(program);
    expect(lines).toContain('PUSH IX');
    expect(lines).toContain('LD IX, $00');
    expect(lines).toContain('ADD IX, SP');
    expect(lines).toContain('LD HL, $1234');
    expect(lines.filter((line) => line === 'PUSH HL').length).toBe(2);
    const instrs = flattenLoweredInstructions(program);
    const hasLdRegFromIx = (reg: string, disp: number) =>
      instrs.some(
        (ins) =>
          ins.head.toUpperCase() === 'LD' &&
          ins.operands[0]?.kind === 'reg' &&
          ins.operands[0].name.toUpperCase() === reg &&
          isMemIxDisp(ins.operands[1], disp),
      );
    expect(hasLdRegFromIx('E', -2)).toBe(true);
    expect(hasLdRegFromIx('D', -1)).toBe(true);
  });

  it('rejects non-scalar local value-init declarations with stable diagnostics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr292_local_nonscalar_value_init_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      message:
        'Non-scalar local storage declaration "arr" requires alias form ("arr = rhs").',
    });
  });
});
