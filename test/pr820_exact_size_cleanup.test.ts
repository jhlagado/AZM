import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compilePlacedProgram, formatLoweredInstructions } from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR820 exact-size cleanup', () => {
  it('lowers nested exact-size record indexing through the exact scale path', async () => {
    const entry = join(__dirname, 'fixtures', 'pr820_exact_nested_indexing.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    expect(text).toContain('PUSH DE');
    expect(text).toContain('LD D, H');
    expect(text).toContain('LD E, L');
    expect(text).toContain('ADD HL, HL');
    expect(text).toContain('ADD HL, DE');
    expect(text).toContain('POP DE');
    expect(text).toContain('LD DE, $03');
    expect((text.match(/ADD HL, DE/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
