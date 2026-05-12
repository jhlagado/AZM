import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR176 parser: mixed keyword-shaped line recovery parity', () => {
  it('reports declaration-specific malformed lines across extern/data/function var blocks', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr176_mixed_keyword_shaped_line_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message:
        'Invalid extern func declaration line "data x: byte": expected func <name>(...): <retType> at <imm16>',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message:
        'Invalid data declaration line "op x: byte = [1]": expected <name>: <type> = <initializer>',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'Invalid var declaration line "extern y: byte": expected <name>: <type>',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
