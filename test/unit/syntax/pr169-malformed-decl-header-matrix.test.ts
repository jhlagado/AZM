import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../../src/api-compile.js';
import { defaultFormatWriters } from '../../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../../helpers/diagnostics/index.js';

const PR169_FIXTURE = fileURLToPath(
  new URL('../../fixtures/pr169_malformed_decl_header_matrix.asm', import.meta.url),
);

describe('PR169 parser: malformed declaration header diagnostics matrix', () => {
  it('emits declaration-specific diagnostics for malformed enum headers', async () => {
    const res = await compile(PR169_FIXTURE, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      code: 'AZMN_PARSE',
      message: 'Invalid enum member name "9bad": expected <identifier>.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
