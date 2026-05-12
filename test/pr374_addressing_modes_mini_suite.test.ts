import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { D8mArtifact } from '../src/formats/types.js';
import { compilePlacedProgram, formatLoweredInstructions } from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const byteMiniSuite = [
  '30_scalar_byte_glob',
  '31_scalar_byte_frame',
  '34_byte_glob_const',
  '35_byte_glob_reg8',
  '36_byte_glob_reg16',
  '37_byte_fvar_const',
  '38_byte_fvar_reg8',
  '39_byte_fvar_reg16',
  '40_byte_glob_fvar',
  '41_byte_fvar_fvar',
  '42_byte_fvar_glob',
  '43_byte_glob_glob',
] as const;

const wordMiniSuite = [
  '32_scalar_word_glob',
  '33_scalar_word_frame',
  '60_word_glob_const',
  '61_word_glob_reg8',
  '62_word_glob_reg16',
  '63_word_fvar_const',
  '64_word_fvar_reg8',
  '65_word_fvar_reg16',
  '66_word_glob_fvar',
  '67_word_fvar_fvar',
  '68_word_fvar_glob',
  '69_word_glob_glob',
] as const;

const miniSuite = [...byteMiniSuite, ...wordMiniSuite];

describe('PR374: addressing mini-suite fixtures stay locked', () => {
  for (const stem of miniSuite) {
    it(`${stem} matches checked-in d8 map fixtures`, async () => {
      const entry = join(__dirname, '..', 'test', 'language-tour', `${stem}.zax`);
      const d8Path = join(__dirname, '..', 'test', 'language-tour', `${stem}.d8.json`);

      const expectedD8Text = await readFile(d8Path, 'utf8');

      const placed = await compilePlacedProgram(entry);
      expect(placed.diagnostics).toEqual([]);
      const instrs = formatLoweredInstructions(placed.program).map((line) => line.toUpperCase());

      const result = await compile(
        entry,
        {
          emitBin: false,
          emitHex: false,
          emitD8m: true,
          emitListing: false,
          defaultCodeBase: 0x0100,
        },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);

      const d8m = result.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');

      expect(d8m).toBeDefined();
      expect(d8m!.json).toEqual(JSON.parse(expectedD8Text));

      const upper = instrs.join('\n');
      expect(upper).not.toMatch(new RegExp('LD\\s+H,\\s+\\(IX', 'i'));
      expect(upper).not.toMatch(new RegExp('LD\\s+L,\\s+\\(IX', 'i'));
      expect(upper).not.toMatch(new RegExp('LD\\s+\\(IX[^\\n]*,\\s+H', 'i'));
      expect(upper).not.toMatch(new RegExp('LD\\s+\\(IX[^\\n]*,\\s+L', 'i'));
    });
  }
});
