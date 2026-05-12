import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR217 parser: declaration minimum-shape and eof recovery diagnostics', () => {
  it('diagnoses empty type/union declarations with stable declaration-minimum messages', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr217_parser_decl_minimum_shape_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      message: 'Type "EmptyType" must contain at least one field',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Union "EmptyUnion" must contain at least one field',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });

  it('diagnoses function header at eof without body', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr217_parser_func_missing_body_eof.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated func "no_body": expected function body',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });

  it('diagnoses op body missing terminating end at eof', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr217_parser_op_missing_end_eof.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated op "no_end": missing "end"',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
