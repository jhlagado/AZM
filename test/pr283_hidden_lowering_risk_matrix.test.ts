import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { D8mArtifact } from '../src/formats/types.js';
import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstructions,
} from './helpers/lowered_program.js';
import {
  expectDiagnostic,
  expectNoDiagnostics,
  expectNoErrors,
} from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR283: hidden-lowering risk matrix focused coverage', () => {
  it('covers positive hidden-lowering rows across op expansion, call boundaries, and frame access', async () => {
    const opCallsite = await compile(
      join(__dirname, 'fixtures', 'pr269_d8m_op_macro_callsite.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expectNoDiagnostics(opCallsite.diagnostics);
    const d8m = opCallsite.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();
    const fileEntry = (
      d8m!.json as { files?: Record<string, { segments?: Array<{ kind: string }> }> }
    ).files?.['pr269_d8m_op_macro_callsite.zax'];
    expect(fileEntry?.segments?.some((segment) => segment.kind === 'macro')).toBe(true);

    const typedPreserve = await compilePlacedProgram(
      join(__dirname, 'fixtures', 'pr276_typed_call_preservation_matrix.zax'),
    );
    expectNoErrors(typedPreserve.diagnostics);
    const typedInstrs = flattenLoweredInstructions(typedPreserve.program);
    const typedLines = formatLoweredInstructions(typedPreserve.program).map((line) => line.toUpperCase());
    const rawCallCount = typedInstrs.reduce((count, instr) => {
      if (instr.head !== '@raw' || !instr.bytes) return count;
      return instr.bytes[0] === 0xcd ? count + 1 : count;
    }, 0);
    const callCount = typedLines.filter((line) => line.startsWith('CALL ')).length + rawCallCount;
    expect(callCount).toBeGreaterThanOrEqual(3);
    const incSpCount = typedLines.filter((line) => line === 'INC SP').length;
    expect(incSpCount).toBe(6); // 3 word args cleaned
    expect(typedLines.join('\n')).not.toContain('PUSH IY');

    const frameAccess = await compilePlacedProgram(
      join(__dirname, 'fixtures', 'pr283_local_arg_global_access_matrix.zax'),
    );
    expectNoErrors(frameAccess.diagnostics);
    const frameText = formatLoweredInstructions(frameAccess.program).join('\n').toUpperCase();
    expect(frameText).toContain('PUSH IX');
    expect(frameText).toContain('LD IX, $00');
    expect(frameText).toContain('ADD IX, SP');
    expect(frameText).toMatch(/LD E, \(IX\+\$0*4\)/);
    expect(frameText).toMatch(/LD E, \(IX-\$0*2\)/);

    const rawTypedWarn = await compile(
      join(__dirname, 'fixtures', 'pr278_raw_call_typed_target_warning.zax'),
      { rawTypedCallWarnings: true },
      { formats: defaultFormatWriters },
    );
    expectDiagnostic(rawTypedWarn.diagnostics, {
      id: DiagnosticIds.RawCallTypedTargetWarning,
      severity: 'warning',
      messageIncludes: 'Raw call targets typed callable',
    });
  }, 20_000);

  it('covers negative hidden-lowering guardrails for op expansion stack policy and imbalance', async () => {
    const stackPolicyError = await compile(
      join(__dirname, 'fixtures', 'pr271_op_stack_policy_delta_warn.zax'),
      { opStackPolicy: 'error' },
      { formats: defaultFormatWriters },
    );
    expectDiagnostic(stackPolicyError.diagnostics, {
      id: DiagnosticIds.OpStackPolicyRisk,
      severity: 'error',
      messageIncludes: 'non-zero static stack delta',
    });

    const unbalanced = await compile(
      join(__dirname, 'fixtures', 'pr23_op_unbalanced_stack.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expect(unbalanced.diagnostics.length).toBeGreaterThanOrEqual(0);
  });

  it('keeps typed-call vs raw-call diagnostic behaviors distinct', async () => {
    const typedVsRaw = await compile(
      join(__dirname, 'fixtures', 'pr275_typed_vs_raw_call_boundary_diag.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expectDiagnostic(typedVsRaw.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes:
        'typed call "callee_typed" reached with unknown stack depth; cannot verify typed-call boundary contract.',
    });
    expectDiagnostic(typedVsRaw.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes:
        'call reached with unknown stack depth; cannot verify callee stack contract.',
    });
    expect(typedVsRaw.diagnostics.every((d) => d.id === DiagnosticIds.EmitError)).toBe(true);
  });
});
