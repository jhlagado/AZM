import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR271: op stack-policy alignment (optional mode)', () => {
  it('is off by default and preserves baseline diagnostics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr271_op_stack_policy_delta_warn.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);
  });

  it('warn mode reports non-zero static op stack delta at stack-slot call sites', async () => {
    const entry = join(__dirname, 'fixtures', 'pr271_op_stack_policy_delta_warn.zax');
    const res = await compile(entry, { opStackPolicy: 'warn' }, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.OpStackPolicyRisk,
      severity: 'warning',
      messageIncludes: 'non-zero static stack delta (-2)',
    });
  });

  it('warn mode reports untracked SP mutation risk in op body summaries', async () => {
    const entry = join(__dirname, 'fixtures', 'pr271_op_stack_policy_untracked_warn.zax');
    const res = await compile(entry, { opStackPolicy: 'warn' }, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.OpStackPolicyRisk,
      severity: 'warning',
      messageIncludes: 'may mutate SP in an untracked way (static body analysis)',
    });
  });

  it('error mode upgrades stack-policy risks to errors', async () => {
    const entry = join(__dirname, 'fixtures', 'pr271_op_stack_policy_delta_warn.zax');
    const res = await compile(entry, { opStackPolicy: 'error' }, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.OpStackPolicyRisk,
      severity: 'error',
    });
    expect(res.artifacts).toEqual([]);
  });
});
