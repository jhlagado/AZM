import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import {
  expectDiagnostic,
  expectNoDiagnostics,
} from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR272: runtime affine index/offset lowering', () => {
  it('accepts single-atom affine index and ea offset forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr272_runtime_affine_valid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoDiagnostics(res.diagnostics);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
  });

  it('rejects unsupported runtime operators and non-power-of-2 multipliers', async () => {
    const entry = join(__dirname, 'fixtures', 'pr272_runtime_affine_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: 'runtime multiplier must be a power-of-2',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes:
        'is unsupported. Use a single scalar runtime atom with +, -, *, <<',
    });
  });
});
