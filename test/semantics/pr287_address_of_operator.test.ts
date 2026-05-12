import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR287 explicit address-of operator (@place)', () => {
  it('rejects @place outside := with a stable diagnostic', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr287_address_of_positive.zax');
    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
      { formats: defaultFormatWriters },
    );

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: '"@<path>" is only supported with ":=" in this phase.',
    });
  });

  it('rejects invalid @ targets with stable diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr287_address_of_invalid_targets_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(
      res.diagnostics.filter((d) => d.message.startsWith('Invalid address-of target ')).length,
    ).toBe(3);
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid address-of target "@": expected @<place>.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid address-of target "@(3 + 2)": expected @<place>.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid address-of target "@3": expected @<place>.',
    });
  });
});
