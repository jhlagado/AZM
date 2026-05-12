import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR157 parser: malformed export matrix', () => {
  it('reports explicit export diagnostics for malformed/unsupported export forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr157_export_malformed_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    expect(res.diagnostics.filter((d) => d.message === 'Invalid export statement')).toHaveLength(2);
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export is only permitted on const/type/union/enum/func/op declarations',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on import statements',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Unterminated union "U": expected "end" before "globals"',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Union "U" must contain at least one field',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on globals declarations',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on legacy "var" declarations (use "globals")',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on section directives',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on align directives',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on extern declarations',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on data declarations',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on bin declarations',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'export not supported on hex declarations',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
