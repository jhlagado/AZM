import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR264: ea runtime-atom budget matrix', () => {
  it('accepts source ea expressions with at most one runtime atom', async () => {
    const entry = join(__dirname, 'fixtures', 'pr264_runtime_atom_budget_valid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoDiagnostics(res.diagnostics);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
  });

  it('rejects source ea expressions that exceed one runtime atom', async () => {
    const entry = join(__dirname, 'fixtures', 'pr264_runtime_atom_budget_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(2);
    expectDiagnostic(res.diagnostics, {
      message: 'Source ea expression exceeds runtime-atom budget (max 1; found 2).',
      line: 9,
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Source ea expression exceeds runtime-atom budget (max 1; found 2).',
      line: 10,
    });
    expect(res.diagnostics.every((d) => d.column === 3)).toBe(true);
  });
});
