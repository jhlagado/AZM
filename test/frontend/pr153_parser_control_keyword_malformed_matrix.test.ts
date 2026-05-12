import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR153 parser: malformed control-keyword matrix', () => {
  it('reports explicit control-keyword diagnostics without unsupported-instruction fallback', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr153_parser_control_keyword_malformed_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: '"repeat" does not take operands',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: '"until" without matching "repeat"',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: '"if" expects a condition code',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: '"while" expects a condition code',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid select selector',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid case value',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: '"else" does not take operands',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: '"select" must contain at least one arm ("case" or "else")',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: '"end" does not take operands',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
