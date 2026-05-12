import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { Asm80Artifact } from '../src/formats/types.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

describe('PR950: text-only include directive', () => {
  it('inlines included text before parsing', async () => {
    const entry = join(__dirname, 'fixtures', 'pr950_include_entry.zax');
    const res = await compile(
      entry,
      { emitAsm80: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expectNoErrors(res.diagnostics);
    const asm = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(asm).toBeDefined();
    expect(asm!.text.toUpperCase()).toMatch(/LD A, \$0*1/);
  });

  it('diagnoses missing includes', async () => {
    const entry = join(__dirname, 'fixtures', 'pr950_missing_include.zax');
    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expectDiagnostic(res.diagnostics, { messageIncludes: 'Failed to resolve include' });
  });

  it('resolves includes via -I search paths', async () => {
    const entry = join(__dirname, 'fixtures', 'pr950_include_searchpath_entry.zax');
    const includeDir = join(__dirname, 'fixtures', 'includes');
    const res = await compile(
      entry,
      { includeDirs: [includeDir], emitAsm80: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expectNoErrors(res.diagnostics);
    const asm = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(asm).toBeDefined();
    expect(asm!.text.toUpperCase()).toMatch(/LD A, \$0*2/);
  });

  it('preserves provenance for included diagnostics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr950_bad_include_entry.zax');
    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expectDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported operand',
      file: join(__dirname, 'fixtures', 'pr950_bad_include.inc'),
    });
  });
});
