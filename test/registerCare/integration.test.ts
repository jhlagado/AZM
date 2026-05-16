import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { RegisterCareReportArtifact } from '../../src/formats/types.js';

describe('register-care integration', () => {
  it('emits a register-care report artifact in audit mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterReport: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('AZM Register-Care Report');
    expect(report?.text).toContain('Mode: audit');
  });
});
