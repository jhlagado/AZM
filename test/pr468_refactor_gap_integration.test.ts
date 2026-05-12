import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR468 targeted integration coverage for previously skipped suites', () => {
  it('locks current bin ingestion behavior without relying on outdated exact image bytes', async () => {
    const basic = await compile(
      join(__dirname, 'fixtures', 'pr17_bin_basic.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expectNoDiagnostics(basic.diagnostics);

    const basicBin = basic.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const basicD8m = basic.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(basicBin).toBeDefined();
    expect(basicD8m).toBeDefined();
    expect(Array.from(basicBin!.bytes.slice(-4))).toEqual([0x00, 0xaa, 0xbb, 0xcc]);
    expect(
      (basicD8m!.json.symbols as Array<{ name: string; address: number }>).some(
        (s) => s.name === 'legacy' && s.address === 22,
      ),
    ).toBe(true);

    const code = await compile(
      join(__dirname, 'fixtures', 'pr17_bin_code.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expectNoDiagnostics(code.diagnostics);
    const codeBin = code.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(codeBin).toBeDefined();
    expect(Array.from(codeBin!.bytes.slice(-3))).toEqual([0xaa, 0xbb, 0xcc]);

    const overlap = await compile(
      join(__dirname, 'fixtures', 'pr17_hex_basic.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expect(overlap.artifacts).toEqual([]);
    expect(overlap.diagnostics).toHaveLength(2);
    expectDiagnostic(overlap.diagnostics, { message: 'Byte overlap at address 16.' });
    expectDiagnostic(overlap.diagnostics, { message: 'Byte overlap at address 17.' });
  });

  it('locks current structured-control lowering shape without relying on pre-frame exact byte images', async () => {
    const ifElse = await compile(
      join(__dirname, 'fixtures', 'pr15_if_else.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expectNoDiagnostics(ifElse.diagnostics);
    const ifElseBin = ifElse.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(ifElseBin).toBeDefined();
    const ifElseBytes = Array.from(ifElseBin!.bytes);
    expect(ifElseBytes.slice(0, 3)).toEqual([0xdd, 0xe5, 0xdd]); // framed prologue starts with push ix / ld ix,...
    expect(ifElseBytes).toContain(0xca); // conditional branch
    expect(ifElseBytes).toContain(0xc3); // unconditional jump over else arm
    expect(ifElseBytes).toContain(0x3e); // ld a, imm8 arm body
    expect(ifElseBytes.at(-1)).toBe(0xc9); // ret

    const whileLoop = await compile(
      join(__dirname, 'fixtures', 'pr15_while.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expectNoDiagnostics(whileLoop.diagnostics);
    const whileBin = whileLoop.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(whileBin).toBeDefined();
    const whileBytes = Array.from(whileBin!.bytes);
    expect(whileBytes.slice(0, 3)).toEqual([0xdd, 0xe5, 0xdd]);
    expect(whileBytes).toContain(0xca); // branch to exit
    expect(whileBytes).toContain(0xc3); // back-edge jump
    expect(whileBytes.at(-1)).toBe(0xc9);
  });
});
