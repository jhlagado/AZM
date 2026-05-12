import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR173 parser: func/op body interruption recovery', () => {
  it('emits explicit interruption diagnostics and resumes top-level parsing', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr173_func_op_body_interruption_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated func "broken": expected "end" before "const"',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated op "macro": expected "end" before "enum"',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'Unterminated func "ok": missing "end"',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
