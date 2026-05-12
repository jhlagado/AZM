import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { expectDiagnostic, expectNoDiagnostics, expectNoErrors } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('#738 select case ranges/groups', () => {
  it('supports grouped case ranges for reg8 selector dispatch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr738_select_case_range_group_reg8.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    const bytes = [...bin!.bytes];
    const cpImmCount = bytes.filter((byte) => byte === 0xfe).length;
    expect(cpImmCount).toBe(5);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('folds grouped range dispatch when selector is compile-time immediate', async () => {
    const constEntry = join(__dirname, 'fixtures', 'pr738_select_const_range_folded.zax');
    const runtimeEntry = join(__dirname, 'fixtures', 'pr738_select_case_range_group_reg8.zax');
    const constRes = await compile(constEntry, {}, { formats: defaultFormatWriters });
    const runtimeRes = await compile(runtimeEntry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(constRes.diagnostics);
    expectNoDiagnostics(runtimeRes.diagnostics);

    const constBin = constRes.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const runtimeBin = runtimeRes.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(constBin).toBeDefined();
    expect(runtimeBin).toBeDefined();

    expect([...constBin!.bytes].filter((byte) => byte === 0xfe)).toHaveLength(0);
    expect(constBin!.bytes.length).toBeLessThan(runtimeBin!.bytes.length);
    expect(constBin!.bytes[constBin!.bytes.length - 1]).toBe(0xc9);
  });

  it('diagnoses overlapping case ranges in select', async () => {
    const entry = join(__dirname, 'fixtures', 'pr738_select_case_range_overlap.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: 'Duplicate case value 3.',
    });
  });

  it('warns and clips partially unreachable reg8 case ranges', async () => {
    const entry = join(__dirname, 'fixtures', 'pr738_select_reg8_range_clip_warning.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitWarning,
      severity: 'warning',
      messageIncludes: 'reachable portion 250..255 is used',
    });

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    const cpImmCount = [...bin!.bytes].filter((byte) => byte === 0xfe).length;
    expect(cpImmCount).toBe(1);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('supports 16-bit selector range dispatch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr738_select_reg16_range_dispatch.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    const cpImmCount = [...bin!.bytes].filter((byte) => byte === 0xfe).length;
    expect(cpImmCount).toBe(4);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });
});
