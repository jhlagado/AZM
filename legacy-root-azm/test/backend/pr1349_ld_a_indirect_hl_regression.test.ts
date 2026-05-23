import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function compileFixture(fixture: string) {
  const entry = join(__dirname, '..', 'fixtures', fixture);
  return compile(entry, {}, { formats: defaultFormatWriters });
}

async function expectFixtureEmitsOpcode(fixture: string, opcode: number): Promise<void> {
  const res = await compileFixture(fixture);
  expect(res.diagnostics).toEqual([]);
  const bin = res.artifacts.find((a) => a.kind === 'bin');
  expect(bin).toBeDefined();
  if (!bin || bin.kind !== 'bin') return;
  expect(bin.bytes.includes(opcode)).toBe(true);
}

describe('PR1349 / PR1350: ld a, (hl) vs absolute-address LD fixup', () => {
  it('compiles cleanly (no AZM300 "Unresolved symbol hl" from emitAbs16LdFixup)', async () => {
    const res = await compileFixture('pr1349_ld_a_indirect_hl.asm');
    expect(res.diagnostics).toEqual([]);
  });

  it.each([
    ['pr1349_ld_a_indirect_hl.asm', 0x7e, 'ld a,(hl)'],
    ['pr1349_ld_a_indirect_bc.asm', 0x0a, 'ld a,(bc)'],
    ['pr1349_ld_a_indirect_de.asm', 0x1a, 'ld a,(de)'],
    ['pr1349_ld_indirect_bc_store.asm', 0x02, 'ld (bc),a'],
    ['pr1349_ld_indirect_de_store.asm', 0x12, 'ld (de),a'],
  ] as const)('compiles %s and emits 0x%02x (%s)', async (fixture, opcode, _mnemonic) => {
    await expectFixtureEmitsOpcode(fixture, opcode);
  });
});
