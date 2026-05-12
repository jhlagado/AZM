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
  it('pins line/column for remaining declaration/control recovery diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures',
      'pr216_parser_remaining_decl_control_recovery_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const spans = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(spans).toEqual([
      { message: 'Unexpected "end" in asm block', line: 2, column: 3 },
      {
        message: 'extern block must contain at least one func declaration',
        line: 5,
        column: 1,
      },
      { message: 'Enum "Empty" must declare at least one member', line: 8, column: 1 },
      {
        message: 'Trailing commas are not permitted in enum member lists',
        line: 10,
        column: 1,
      },
    ]);
  });

  it('pins line/column for empty type/union minimum-shape diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr217_parser_decl_minimum_shape_matrix.zax');
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

  it('pins line/column for unterminated function and op diagnostics at EOF', async () => {
    const funcEntry = join(__dirname, '..', 'fixtures', 'pr217_parser_func_missing_body_eof.zax');
    const funcRes = await compile(funcEntry, {}, { formats: defaultFormatWriters });
    expect(funcRes.diagnostics).toHaveLength(1);
    expectDiagnostic(funcRes.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'Unterminated func "no_body": expected function body',
      line: 1,
      column: 1,
    });

    const opEntry = join(__dirname, '..', 'fixtures', 'pr217_parser_op_missing_end_eof.zax');
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

  it('pins line/column for explicit asm-marker body diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr214_explicit_asm_marker_func_op_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const spans = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(spans).toEqual([
      {
        message: 'Unexpected "asm" in function body (function bodies are implicit)',
        line: 2,
        column: 1,
      },
      { message: 'Unexpected "asm" in op body (op bodies are implicit)', line: 7, column: 1 },
    ]);
  });
});
