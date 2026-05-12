import { describe, it } from 'vitest';
import { join } from 'node:path';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const flagsFixture = join(__dirname, 'fixtures', 'pr322_return_flags_positive.zax');

describe('PR322: return flags modifier removed', () => {
  it('rejects legacy flags modifier; use AF in return list instead', async () => {
    const res = await compile(
      flagsFixture,
      { emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      line: 4,
      message: 'Invalid return register "HL flags": expected HL, DE, BC, or AF.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      line: 9,
      message: 'Invalid return register "HL flags": expected HL, DE, BC, or AF.',
    });
  });
});
