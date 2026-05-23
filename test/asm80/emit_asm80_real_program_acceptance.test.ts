import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';

/**
 * Phase 2: enable these suites (remove .skip) when MON3/Tetro/Pacmo compile with
 * emitAsm80: true without AZMN_ASM80. Until then, track gaps with:
 *   npm run check:asm80-coverage
 */

const CORPORA = [
  {
    name: 'MON3',
    env: 'MON3_SOURCE',
    defaultPath: '/Users/johnhardy/projects/MON3/src/mon3.z80',
    runFlag: 'AZM_RUN_MON3_ASM80_ACCEPTANCE',
  },
  {
    name: 'Tetro',
    env: 'TETRO_SOURCE',
    defaultPath: '/Users/johnhardy/projects/tetro/src/tetro/tetro.z80',
    runFlag: 'AZM_RUN_TETRO_ASM80_ACCEPTANCE',
  },
  {
    name: 'Pacmo',
    env: 'PACMO_SOURCE',
    defaultPath: '/Users/johnhardy/projects/tetro/src/pacmo/pacmo.z80',
    runFlag: 'AZM_RUN_PACMO_ASM80_ACCEPTANCE',
  },
] as const;

for (const corpus of CORPORA) {
  const configured = process.env[corpus.env]?.trim();
  const source =
    configured && configured.length > 0 ? configured : corpus.defaultPath;
  const sourceAvailable = existsSync(source);
  const runAcceptance = process.env[corpus.runFlag] === '1';

  describe.skip(`ASM80 lowered output ${corpus.name} acceptance (Phase 2)`, () => {
    it(`lowers ${corpus.name} without AZMN_ASM80 when ${corpus.runFlag}=1`, async () => {
      if (!sourceAvailable) {
        throw new Error(`${corpus.name} source is unavailable: ${source}`);
      }
      if (!runAcceptance) {
        throw new Error(`set ${corpus.runFlag}=1 to run this check`);
      }

      const result = await compile(
        source,
        {
          emitBin: true,
          emitHex: false,
          emitD8m: false,
          emitListing: false,
          emitAsm80: true,
        },
        { formats: defaultFormatWriters },
      );

      const asm80Errors = result.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === 'error' && diagnostic.code === 'AZMN_ASM80',
      );
      expect(asm80Errors).toEqual([]);

      const asm80 = result.artifacts.find((artifact) => artifact.kind === 'asm80');
      expect(asm80).toBeDefined();
      expect(asm80!.text.length).toBeGreaterThan(0);
    });
  });
}
