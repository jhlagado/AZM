import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import type { Asm80Artifact } from '../../src/outputs/types.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));

function asm80Artifact(
  artifacts: readonly { readonly kind: string }[],
): Asm80Artifact | undefined {
  return artifacts.find((artifact): artifact is Asm80Artifact => artifact.kind === 'asm80');
}

describe('PR950: text-only include directive', () => {
  it('inlines included text before parsing', async () => {
    const entry = join(FIXTURES, 'pr950_include_entry.asm');
    const res = await compile(
      entry,
      { emitAsm80: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const asm = asm80Artifact(res.artifacts);
    expect(asm).toBeDefined();
    expect(asm!.text.toUpperCase()).toMatch(/LD A, \$0*1/);
  });

  it('diagnoses missing includes', async () => {
    const entry = join(FIXTURES, 'pr950_missing_include.asm');
    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );

    expectDiagnostic(res.diagnostics, {
      messageIncludes: 'Failed to resolve include',
    });
  });

  it('resolves includes via includeDirs search paths', async () => {
    const entry = join(FIXTURES, 'pr950_include_searchpath_entry.asm');
    const includeDir = join(FIXTURES, 'includes');
    const res = await compile(
      entry,
      {
        includeDirs: [includeDir],
        emitAsm80: true,
        emitBin: false,
        emitHex: false,
        emitListing: false,
        emitD8m: false,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const asm = asm80Artifact(res.artifacts);
    expect(asm).toBeDefined();
    expect(asm!.text.toUpperCase()).toMatch(/LD A, \$0*2/);
  });

  it('preserves provenance for included diagnostics', async () => {
    const entry = join(FIXTURES, 'pr950_bad_include_entry.asm');
    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );

    expectDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported operand',
      sourceName: join(FIXTURES, 'pr950_bad_include.inc'),
    });
  });
});
