import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR254 parser: module var removal', () => {
  it('diagnoses top-level var blocks as removed syntax', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr254_module_var_renamed_globals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: `Legacy "var ... end" storage blocks are removed; use direct declarations inside named data sections.`,
      line: 1,
      column: 1,
    });
  });
});
