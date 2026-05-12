import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR171 parser: function body recovery without explicit asm keyword', () => {
  it('emits explicit interruption diagnostics and continues parsing later declarations', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr171_func_missing_asm_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated func "broken": expected function body before "const"',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated func "also_broken": expected function body before "section"',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'Unterminated func "ok": missing "end"',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
