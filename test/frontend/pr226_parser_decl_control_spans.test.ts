import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR226 parser declaration/control span matrix', () => {
  it('pins line/column for empty type/union minimum-shape diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr217_parser_decl_minimum_shape_matrix.asm');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const spans = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(spans).toEqual([
      { message: 'Type "EmptyType" must contain at least one field', line: 1, column: 1 },
      { message: 'Union "EmptyUnion" must contain at least one field', line: 4, column: 1 },
    ]);
  });

  it('pins line/column for unterminated op diagnostics at EOF', async () => {
    const opEntry = join(__dirname, '..', 'fixtures', 'pr217_parser_op_missing_end_eof.asm');
    const opRes = await compile(opEntry, {}, { formats: defaultFormatWriters });
    expect(opRes.diagnostics).toHaveLength(1);
    expectDiagnostic(opRes.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'Unterminated op "no_end": missing "end"',
      line: 1,
      column: 1,
    });
  });

});
