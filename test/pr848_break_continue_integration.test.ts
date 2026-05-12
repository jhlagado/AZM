import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('#848 break/continue structured control', () => {
  it('diagnoses break outside any enclosing loop', async () => {
    const entry = join(__dirname, 'fixtures', 'pr848_break_outside_loop.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      message: '"break" is only valid inside "while" or "repeat"',
    });
  });

  it('lowers while-loop break and continue through the innermost loop targets', async () => {
    const entry = join(__dirname, 'fixtures', 'pr848_while_break_continue.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(Array.from(bin!.bytes)).toEqual([
      0xdd, 0xe5, 0xdd, 0x21, 0x00, 0x00, 0xdd, 0x39, 0xf5, 0xc5, 0xd5, 0xe5, 0xca,
      0x18, 0x00, 0xc2, 0x15, 0x00, 0xc3, 0x18, 0x00, 0xc3, 0x0c, 0x00, 0xe1, 0xd1,
      0xc1, 0xf1, 0xdd, 0xf9, 0xdd, 0xe1, 0xc9,
    ]);
  });

  it('routes repeat-loop continue to the until-condition check', async () => {
    const entry = join(__dirname, 'fixtures', 'pr848_repeat_continue_check.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(Array.from(bin!.bytes)).toEqual([
      0xdd, 0xe5, 0xdd, 0x21, 0x00, 0x00, 0xdd, 0x39, 0xf5, 0xc5, 0xd5, 0xe5, 0x00,
      0xc3, 0x10, 0x00, 0xca, 0x0c, 0x00, 0xe1, 0xd1, 0xc1, 0xf1, 0xdd, 0xf9, 0xdd,
      0xe1, 0xc9,
    ]);
  });

  it('keeps nested break targeting the innermost loop only', async () => {
    const entry = join(__dirname, 'fixtures', 'pr848_nested_loop_escape.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(Array.from(bin!.bytes)).toEqual([
      0xdd, 0xe5, 0xdd, 0x21, 0x00, 0x00, 0xdd, 0x39, 0xf5, 0xc5, 0xd5, 0xe5, 0xca,
      0x19, 0x00, 0xc3, 0x15, 0x00, 0xc2, 0x0f, 0x00, 0x00, 0xc3, 0x19, 0x00, 0xe1,
      0xd1, 0xc1, 0xf1, 0xdd, 0xf9, 0xdd, 0xe1, 0xc9,
    ]);
  });
});
