import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const fixture = join(__dirname, 'fixtures', 'pr354_return_keyword_rejection.zax');

describe('PR354: register-list only return surface', () => {
  it('rejects legacy return keywords (void/long)', async () => {
    const res = await compile(fixture, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      line: 1,
      messageIncludes: 'Legacy return keyword "void"',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      line: 4,
      messageIncludes: 'Legacy return keyword "long"',
    });
    expect(res.diagnostics).toHaveLength(4);
  });
});
