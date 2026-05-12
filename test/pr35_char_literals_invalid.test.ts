import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR35 char literals (invalid)', () => {
  it('diagnoses invalid char literal escape', async () => {
    const entry = join(__dirname, 'fixtures', 'pr35_char_literals_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: "Invalid imm expression: '\\z'",
    });
  });
});
