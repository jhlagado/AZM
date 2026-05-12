import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR278: optional raw-call typed-target warnings', () => {
  it('is off by default and preserves baseline behavior', async () => {
    const entry = join(__dirname, 'fixtures', 'pr278_raw_call_typed_target_warning.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoDiagnostic(res.diagnostics, {
      id: DiagnosticIds.RawCallTypedTargetWarning,
      severity: 'warning',
    });
  });

  it('warns when raw call/call cc targets typed callable symbols', async () => {
    const entry = join(__dirname, 'fixtures', 'pr278_raw_call_typed_target_warning.zax');
    const res = await compile(
      entry,
      { rawTypedCallWarnings: true },
      { formats: defaultFormatWriters },
    );

    const warnings = res.diagnostics.filter(
      (d) => d.id === DiagnosticIds.RawCallTypedTargetWarning,
    );
    expect(warnings).toHaveLength(2);
    expectDiagnostic(warnings, {
      id: DiagnosticIds.RawCallTypedTargetWarning,
      severity: 'warning',
      messageIncludes: '"callee_typed"',
    });
    expectDiagnostic(warnings, {
      id: DiagnosticIds.RawCallTypedTargetWarning,
      severity: 'warning',
      messageIncludes: '"ext_ping"',
    });
  });
});
