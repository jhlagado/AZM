import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { compilePlacedProgram, formatLoweredInstructions } from '../helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR508: extracted runtime-immediate helpers', () => {
  it('preserves runtime-affine scaling and immediate materialization in lowering', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr272_runtime_affine_valid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([]);
  });

  it('preserves byte call-arg zero-extension materialization', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr405_byte_call_scalar_arg.zax');
    const { program, diagnostics } = await compilePlacedProgram(entry);
    expect(diagnostics).toEqual([]);
    const lines = formatLoweredInstructions(program).map((line) => line.toUpperCase());
    expect(lines).toContain('LD H, $00');
    expect(lines).toContain('PUSH HL');
  });
});
