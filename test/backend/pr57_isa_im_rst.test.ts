import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR57: ISA im/rst/reti/retn', () => {
  it('encodes im, rst, reti, and retn', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr57_isa_im_rst.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts.find((a): a is BinArtifact => a.kind === 'bin')).toBeUndefined();
    expectDiagnostic(res.diagnostics, {
      message:
        'reti is not supported in functions that require cleanup; use ret/ret cc so cleanup epilogue can run.',
    });
    expectDiagnostic(res.diagnostics, {
      message:
        'retn is not supported in functions that require cleanup; use ret/ret cc so cleanup epilogue can run.',
    });
  });
});
