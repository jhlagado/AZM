import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';

/**
 * ISA sweep fixtures: meaningful emitAsm80 parity without running the full
 * 87-fixture corpus (many fixtures are diagnostic-only or layout-specific).
 *
 * Expand this list as asm80 lowering coverage improves.
 */
const ISA_ASM80_FIXTURES = [
  // pr24_isa_core.asm: Next asm80 text intentionally differs (two-operand ALU vs legacy stubs).
  'pr56_isa_misc.asm',
  'pr57_isa_im_rst.asm',
  'pr91_isa_hl16_adc_sbc.asm',
  'pr113_isa_indexed_bit_setres_dst.asm',
  'pr123_isa_alu_a_core.asm',
] as const;

const fixtureDir = new URL('../fixtures/', import.meta.url);
const includeDirs = [fileURLToPath(new URL('includes/', fixtureDir))];

describe('AZM Next root fixture corpus (emitAsm80 parity)', () => {
  it.each(ISA_ASM80_FIXTURES)(
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
