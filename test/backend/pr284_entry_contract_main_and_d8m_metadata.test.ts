import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { D8mArtifact } from '../../src/formats/types.js';
import { expectDiagnostic, expectNoErrors } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR284: entry contract requires main and emits D8 metadata', () => {
  it('fails when requireMain is enabled and no main function exists', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr284_require_main_missing.zax');
    const res = await compile(entry, { requireMain: true }, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Program must define a callable "main" entry function.',
    });
    expect(res.artifacts).toEqual([]);
  });

  it('emits generator entry metadata in d8 map when main exists', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1_minimal.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();

    const generator = d8m!.json['generator'] as
      | { tool?: string; entrySymbol?: string; entryAddress?: number }
      | undefined;
    expect(generator).toBeDefined();
    expect(generator?.tool).toBe('zax');
    expect(generator?.entrySymbol).toBe('main');
    expect(generator?.entryAddress).toBe(0);
  });
});
