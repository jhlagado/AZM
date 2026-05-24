import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ASM80_TEXT_EXCLUDED_FIXTURES } from './asm80-corpus-policy.js';
import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';

/**
 * Root fixtures that must match legacy current AZM lowered ASM80 text byte-for-byte.
 * See `asm80-corpus-policy.ts` for intentional exclusions.
 */
const ASM80_TEXT_PARITY_FIXTURES = [
  'pr4_enum.asm',
  'pr56_isa_misc.asm',
  'pr57_isa_im_rst.asm',
  'pr91_isa_hl16_adc_sbc.asm',
  'pr113_isa_indexed_bit_setres_dst.asm',
  'pr123_isa_alu_a_core.asm',
  'pr126_cb_bitops_reg_matrix.asm',
  'pr274_type_padding_explicit_ok.asm',
  'pr274_type_padding_warning.asm',
] as const;

const excluded = new Set(ASM80_TEXT_EXCLUDED_FIXTURES);
for (const fixture of ASM80_TEXT_PARITY_FIXTURES) {
  if (excluded.has(fixture)) {
    throw new Error(`asm80 parity fixture is also excluded: ${fixture}`);
  }
}

const fixtureDir = new URL('../fixtures/', import.meta.url);
const includeDirs = [fileURLToPath(new URL('includes/', fixtureDir))];

describe('AZM Next root fixture corpus (emitAsm80 parity)', () => {
  it('documents intentional asm80 text exclusions', () => {
    expect(ASM80_TEXT_EXCLUDED_FIXTURES.length).toBeGreaterThan(0);
    expect(ASM80_TEXT_PARITY_FIXTURES).not.toEqual([]);
  });

  it.each(ASM80_TEXT_PARITY_FIXTURES)(
    'matches current AZM lowered ASM80 output on %s',
    async (file) => {
      const fixturePath = fileURLToPath(new URL(`./${file}`, fixtureDir));
      const current = await runCurrentAzmFixture(fixturePath, includeDirs, { emitAsm80: true });
      const next = await runNextAzmFixture(fixturePath, includeDirs, { emitAsm80: true });

      expect(current.exitCode, `current should compile ${file}`).toBe(0);
      expect(next.exitCode, `next should compile ${file}`).toBe(0);
      expect(current.asm80Text).toContain('; AZM lowered ASM80 output');
      expect(next.asm80Text).toBe(current.asm80Text);

      const differences = compareRunResults(current, next, { compareAsm80: true });
      expect(differences, `fixture ${file} asm80 should match current AZM`).toEqual([]);
    },
    30_000,
  );
});
