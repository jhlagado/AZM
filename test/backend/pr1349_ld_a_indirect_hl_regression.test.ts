import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR1349 / PR1350: ld a, (hl) vs absolute-address LD fixup', () => {
  it('compiles cleanly (no ZAX300 "Unresolved symbol hl" from emitAbs16LdFixup)', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1349_ld_a_indirect_hl.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
  });

  it('emits opcode 0x7e (ld a,(hl)) in the binary image', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1349_ld_a_indirect_hl.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a) => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin || bin.kind !== 'bin') return;
    expect(bin.bytes.includes(0x7e)).toBe(true);
  });
});

describe('Issue #1356: ld a, (bc) / ld a, (de) vs absolute-address LD fixup', () => {
  it.each([
    ['pr1349_ld_a_indirect_bc.zax', 0x0a, 'ld a,(bc)'],
    ['pr1349_ld_a_indirect_de.zax', 0x1a, 'ld a,(de)'],
  ] as const)('compiles %s and emits 0x%02x (%s)', async (fixture, opcode, _mnemonic) => {
    const entry = join(__dirname, '..', 'fixtures', fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a) => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin || bin.kind !== 'bin') return;
    expect(bin.bytes.includes(opcode)).toBe(true);
  });
});

describe('Issue #1356: ld (bc), a / ld (de), a vs absolute-address LD fixup', () => {
  it.each([
    ['pr1349_ld_indirect_bc_store.zax', 0x02, 'ld (bc),a'],
    ['pr1349_ld_indirect_de_store.zax', 0x12, 'ld (de),a'],
  ] as const)('compiles %s and emits 0x%02x (%s)', async (fixture, opcode, _mnemonic) => {
    const entry = join(__dirname, '..', 'fixtures', fixture);
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a) => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin || bin.kind !== 'bin') return;
    expect(bin.bytes.includes(opcode)).toBe(true);
  });
});
