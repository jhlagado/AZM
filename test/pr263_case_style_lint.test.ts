import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { expectDiagnostic, expectNoDiagnostic, expectNoErrors, expectNoDiagnostics } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR263: case-style linting', () => {
  it('stays silent by default (caseStyle=off)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr263_case_style_lint.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoDiagnostics(res.diagnostics);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
  });

  it('emits warnings for non-uppercase tokens with --case-style=upper', async () => {
    const entry = join(__dirname, 'fixtures', 'pr263_case_style_lint.zax');
    const res = await compile(entry, { caseStyle: 'upper' }, { formats: defaultFormatWriters });

    const warnings = res.diagnostics.filter((d) => d.severity === 'warning');

    expectNoErrors(res.diagnostics);
    expect(warnings).toHaveLength(5);
    expectDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'mnemonic "ld" should be uppercase',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'register "a" should be uppercase',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'keyword "If" should be uppercase',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'mnemonic "nop" should be uppercase',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'keyword "End" should be uppercase',
    });
  });

  it('ignores label prefixes and hex immediates when linting registers/mnemonics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr264_case_style_label_hex_literal.zax');
    const res = await compile(entry, { caseStyle: 'upper' }, { formats: defaultFormatWriters });

    const warnings = res.diagnostics.filter((d) => d.severity === 'warning');

    expectNoErrors(res.diagnostics);
    expect(warnings).toHaveLength(3);
    expectDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'mnemonic "ld" should be uppercase',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'register "a" should be uppercase',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'mnemonic "ret" should be uppercase',
    });
    expectNoDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'mnemonic "loop:" should be uppercase',
    });
    expectNoDiagnostic(res.diagnostics, {
      severity: 'warning',
      messageIncludes: 'register "af" should be uppercase',
    });
  });
});
