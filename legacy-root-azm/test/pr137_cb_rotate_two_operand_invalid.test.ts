import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import {
  expectDiagnostic,
  expectIndexedRotateShiftSourceDiagnostics,
} from './helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR137: CB rotate/shift invalid two-operand diagnostics', () => {
  it('reports explicit diagnostics for malformed two-operand rotate/shift forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr137_cb_rotate_two_operand_invalid.asm');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectIndexedRotateShiftSourceDiagnostics(res.diagnostics);
    expectDiagnostic(res.diagnostics, { message: 'rl (ix/iy+disp),r expects reg8 destination' });
    expectDiagnostic(res.diagnostics, { message: 'rr (ix/iy+disp),r expects reg8 destination' });
  });

  it('rejects bracket spelling for indexed memory operands', async () => {
    const entry = join(__dirname, 'fixtures', 'pr137_indexed_bracket_syntax_invalid.asm');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Indexed memory operands use (ix+disp)/(iy+disp), not ix[1].',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Indexed memory operands use (ix+disp)/(iy+disp), not iy[-2].',
    });
  });
});
