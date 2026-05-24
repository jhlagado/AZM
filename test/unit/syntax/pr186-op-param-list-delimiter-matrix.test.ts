import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../../src/api-compile.js';
import { defaultFormatWriters } from '../../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../../helpers/diagnostics/index.js';

const PR186_FIXTURE = fileURLToPath(
  new URL('../../fixtures/pr186_op_param_list_delimiter_matrix.asm', import.meta.url),
);

describe('PR186 parser: op parameter list delimiter diagnostics matrix', () => {
  it('emits explicit diagnostics for trailing/empty op parameter entries', async () => {
    const res = await compile(PR186_FIXTURE, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      code: 'AZMN_PARSE',
      message: 'Invalid op parameter list: trailing or empty entries are not permitted.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid op parameter declaration: expected <name> <matcher>',
    });
  });
});
