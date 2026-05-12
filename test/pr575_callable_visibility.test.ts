import { describe, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixture = (name: string) => join(__dirname, 'fixtures', name);

describe('PR575 callable visibility', () => {
  it('allows qualified imported function and op references', async () => {
    const res = await compile(fixture('pr575_callable_root_ok.zax'), {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('rejects unqualified imported function and op references', async () => {
    const res = await compile(fixture('pr575_callable_root_unqualified.zax'), {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      message: 'Unsupported instruction: helper',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      message: 'Unsupported instruction: bump',
    });
  });

  it('rejects qualified function and op references without a direct import', async () => {
    const res = await compile(fixture('pr575_callable_root_noimport.zax'), {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      message: 'Unsupported instruction: pr575_callable_dep.helper',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      message: 'Unsupported instruction: pr575_callable_dep.bump',
    });
  });

  it('allows same-module qualified function and op references', async () => {
    const res = await compile(fixture('pr575_callable_self_qualified.zax'), {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('allows same-module qualified private function and op references', async () => {
    const res = await compile(fixture('pr575_callable_self_private_qualified.zax'), {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });
});
