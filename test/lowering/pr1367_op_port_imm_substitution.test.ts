import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR1367: op imm8 substitution into PortImm8 (in/out immediate port)', () => {
  it('compiles ops that use out (p), a and in a, (p) with imm8 parameters', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1367_op_port_imm_substitution.zax');
    const res = await compile(entry, { emitListing: false, emitAsm80: false }, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a) => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin || bin.kind !== 'bin') return;
    const bytes = bin.bytes;
    expect(bytes.includes(0xd3)).toBe(true);
    expect(bytes.includes(0x06)).toBe(true);
    expect(bytes.includes(0xf8)).toBe(true);
    expect(bytes.includes(0xdb)).toBe(true);
  });
});
