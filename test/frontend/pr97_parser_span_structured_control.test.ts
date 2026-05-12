import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR97 parser spans for structured-control diagnostics', () => {
  it('reports line/column for invalid if condition syntax', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_if_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"if" expects a condition code',
      line: 2,
      column: 5,
    });
  });

  it('reports line/column for invalid while condition syntax', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_while_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"while" expects a condition code',
      line: 2,
      column: 3,
    });
  });

  it('reports line/column for select without arms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_select_no_arms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"select" must contain at least one arm ("case" or "else")',
      line: 3,
      column: 5,
    });
  });

  it('reports line/column for missing until condition', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_until_missing_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"until" expects a condition code',
      line: 4,
      column: 5,
    });
  });

  it('reports line/column for invalid until condition syntax', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_until_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"until" expects a condition code',
      line: 4,
      column: 5,
    });
  });

  it('reports line/column for case outside select', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr30_case_without_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"case" without matching "select"',
      line: 2,
      column: 5,
    });
  });

  it('reports line/column for else outside if/select', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr30_else_without_if_or_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"else" without matching "if" or "select"',
      line: 2,
      column: 5,
    });
  });

  it('reports line/column for missing select selector', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_select_missing_selector.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"select" expects a selector',
      line: 2,
      column: 5,
    });
  });

  it('reports line/column for case without value', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_case_missing_value.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: '"case" expects a value',
      line: 3,
      column: 7,
    });
  });

  it('reports line/column for invalid case value (comma)', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_case_invalid_value_comma.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'Invalid case value',
      line: 3,
      column: 7,
    });
  });

  it('reports line/column for invalid case value list', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'parser_case_invalid_value_list.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'Invalid case value',
      line: 3,
      column: 7,
    });
  });
});
