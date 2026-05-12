import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type MatrixRow = {
  label: string;
  fixture: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  messageIncludes: string;
};

describe('PR268: op diagnostics matrix', () => {
  it.each([
    {
      label: 'no-match headline',
      fixture: 'pr268_op_no_match_diagnostics.zax',
      id: DiagnosticIds.OpNoMatchingOverload,
      messageIncludes: 'No matching op overload for "add16"',
    },
    {
      label: 'operand summary',
      fixture: 'pr268_op_no_match_diagnostics.zax',
      id: DiagnosticIds.OpNoMatchingOverload,
      messageIncludes: 'call-site operands: (IX, DE)',
    },
    {
      label: 'overload list header',
      fixture: 'pr268_op_no_match_diagnostics.zax',
      id: DiagnosticIds.OpNoMatchingOverload,
      messageIncludes: 'available overloads:',
    },
    {
      label: 'dst mismatch detail',
      fixture: 'pr268_op_no_match_diagnostics.zax',
      id: DiagnosticIds.OpNoMatchingOverload,
      messageIncludes: 'dst: expects HL, got IX',
    },
  ] satisfies MatrixRow[])('$label — no-match diagnostics with operand summary and overload list', async (row) => {
    const entry = join(__dirname, 'fixtures', row.fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      messageIncludes: row.messageIncludes,
    });
  });

  it.each([
    {
      label: 'arity sentence',
      fixture: 'pr268_op_arity_mismatch_diagnostics.zax',
      id: DiagnosticIds.OpArityMismatch,
      messageIncludes: 'No op overload of "add16" accepts 3 operand(s).',
    },
    {
      label: 'signatures list',
      fixture: 'pr268_op_arity_mismatch_diagnostics.zax',
      id: DiagnosticIds.OpArityMismatch,
      messageIncludes: 'available overloads:',
    },
  ] satisfies MatrixRow[])('$label — arity mismatch diagnostics with available signatures', async (row) => {
    const entry = join(__dirname, 'fixtures', row.fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      messageIncludes: row.messageIncludes,
    });
  });

  it.each([
    {
      label: 'ambiguous headline',
      fixture: 'pr267_op_ambiguous_incomparable.zax',
      id: DiagnosticIds.OpAmbiguousOverload,
      messageIncludes: 'Ambiguous op overload for "choose"',
    },
    {
      label: 'equally specific candidates',
      fixture: 'pr267_op_ambiguous_incomparable.zax',
      id: DiagnosticIds.OpAmbiguousOverload,
      messageIncludes: 'equally specific candidates:',
    },
  ] satisfies MatrixRow[])('$label — ambiguous candidate signatures for incomparable matches', async (row) => {
    const entry = join(__dirname, 'fixtures', row.fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      messageIncludes: row.messageIncludes,
    });
  });

  it.each([
    {
      label: 'cycle headline',
      fixture: 'pr16_op_cycle.zax',
      id: DiagnosticIds.OpExpansionCycle,
      messageIncludes: 'Cyclic op expansion detected for "first".',
    },
    {
      label: 'chain first',
      fixture: 'pr16_op_cycle.zax',
      id: DiagnosticIds.OpExpansionCycle,
      messageIncludes: 'expansion chain: first',
    },
    {
      label: 'chain step',
      fixture: 'pr16_op_cycle.zax',
      id: DiagnosticIds.OpExpansionCycle,
      messageIncludes: '-> second',
    },
  ] satisfies MatrixRow[])('$label — cyclic op expansion chain context', async (row) => {
    const entry = join(__dirname, 'fixtures', row.fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      messageIncludes: row.messageIncludes,
    });
  });

  it.each([
    {
      label: 'invalid expansion site',
      fixture: 'pr270_op_invalid_expansion_diagnostics.zax',
      id: DiagnosticIds.OpInvalidExpansion,
      messageIncludes: 'Invalid op expansion in "clobber_a_with"',
    },
    {
      label: 'expanded instruction echo',
      fixture: 'pr270_op_invalid_expansion_diagnostics.zax',
      id: DiagnosticIds.OpInvalidExpansion,
      messageIncludes: 'expanded instruction: ld A, SP',
    },
    {
      label: 'op definition pointer',
      fixture: 'pr270_op_invalid_expansion_diagnostics.zax',
      id: DiagnosticIds.OpInvalidExpansion,
      messageIncludes: 'op definition:',
    },
    {
      label: 'expansion chain',
      fixture: 'pr270_op_invalid_expansion_diagnostics.zax',
      id: DiagnosticIds.OpInvalidExpansion,
      messageIncludes: 'expansion chain: clobber_a_with',
    },
  ] satisfies MatrixRow[])('$label — invalid op expansion diagnostics with expanded instruction context', async (row) => {
    const entry = join(__dirname, 'fixtures', row.fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      messageIncludes: row.messageIncludes,
    });
  });

  it.each([
    {
      label: 'inner invalid expansion',
      fixture: 'pr270_op_invalid_expansion_nested_chain.zax',
      id: DiagnosticIds.OpInvalidExpansion,
      messageIncludes: 'Invalid op expansion in "bad_inner"',
    },
    {
      label: 'nested chain mid',
      fixture: 'pr270_op_invalid_expansion_nested_chain.zax',
      id: DiagnosticIds.OpInvalidExpansion,
      messageIncludes: 'expansion chain: mid',
    },
    {
      label: 'nested chain step',
      fixture: 'pr270_op_invalid_expansion_nested_chain.zax',
      id: DiagnosticIds.OpInvalidExpansion,
      messageIncludes: '-> bad_inner',
    },
  ] satisfies MatrixRow[])('$label — nested invalid expansion diagnostics with full expansion chain', async (row) => {
    const entry = join(__dirname, 'fixtures', row.fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      messageIncludes: row.messageIncludes,
    });
  });

  it.each([
    {
      label: 'ld A, SP failure',
      fixture: 'pr270_op_invalid_expansion_multi_failure.zax',
      messageIncludes: 'expanded instruction: ld A, SP',
    },
    {
      label: 'ld C, SP failure',
      fixture: 'pr270_op_invalid_expansion_multi_failure.zax',
      messageIncludes: 'expanded instruction: ld C, SP',
    },
  ] as const)('$label — one invalid-expansion diagnostic per failing expanded instruction', async (row) => {
    const entry = join(__dirname, 'fixtures', row.fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const invalids = res.diagnostics.filter((d) => d.id === DiagnosticIds.OpInvalidExpansion);

    expect(invalids).toHaveLength(2);
    expectDiagnostic(invalids, {
      id: DiagnosticIds.OpInvalidExpansion,
      severity: 'error',
      messageIncludes: row.messageIncludes,
    });
  });

  it('does not emit invalid-expansion diagnostics for non-op instruction failures', async () => {
    const entry = join(__dirname, 'fixtures', 'pr270_nonop_invalid_instruction_baseline.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { id: DiagnosticIds.OpInvalidExpansion });
    expectDiagnostic(res.diagnostics, { id: DiagnosticIds.EncodeError, severity: 'error' });
  });
});
