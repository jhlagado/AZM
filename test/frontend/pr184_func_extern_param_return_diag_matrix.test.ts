import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR184_FIXTURE = join(__dirname, '..', 'fixtures', 'pr184_func_extern_param_return_diag_matrix.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  line: number;
  message: string;
};

describe('PR184 parser: func/extern parameter and return diagnostics matrix', () => {
  it.each([
    {
      label: 'param decl',
      id: DiagnosticIds.ParseError,
      line: 1,
      message: 'Invalid parameter declaration: expected <name>: <type>',
    },
    {
      label: 'param type',
      id: DiagnosticIds.ParseError,
      line: 5,
      message: 'Invalid parameter type "[byte]": expected <type>',
    },
    {
      label: 'return reg (func)',
      id: DiagnosticIds.ParseError,
      line: 9,
      message: 'Invalid return register "[word]": expected HL, DE, BC, or AF.',
    },
    {
      label: 'op param decl',
      id: DiagnosticIds.ParseError,
      line: 13,
      message: 'Invalid op parameter declaration: expected <name>: <matcher>',
    },
    {
      label: 'return reg (extern block)',
      id: DiagnosticIds.ParseError,
      line: 19,
      message: 'Invalid return register "[word]": expected HL, DE, BC, or AF.',
    },
  ] satisfies Row[])('$label — explicit expected-shape diagnostics for malformed parameter/return forms', async (row) => {
    const res = await compile(PR184_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      line: row.line,
      message: row.message,
    });
  });

  it('does not fall back to generic unsupported-type diagnostics for the parser matrix fixture', async () => {
    const res = await compile(PR184_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported type in parameter declaration',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported return type',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported extern func return type',
    });
  });
});
