import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile, defaultFormatWriters } from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('stage 3 visible-op diagnostic parity slice', () => {
  it('reports no-match diagnostics with overload locations and mismatch details', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr268_op_no_match_diagnostics.asm');
    const result = await compile(entry, {}, { formats: defaultFormatWriters });
    const message = result.diagnostics[0]?.message ?? '';

    expect(message).toContain('No matching op overload for "add16" with provided operands.');
    expect(message).toContain('call-site operands: (IX, DE)');
    expect(message).toContain('available overloads:');
    expect(message).toContain(`add16(dst HL, src reg16) (${entry}:1) ; dst: expects HL, got IX`);
    expect(message).toContain(`add16(dst DE, src reg16) (${entry}:5) ; dst: expects DE, got IX`);
  });

  it('reports ambiguous overload diagnostics with candidate locations', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr267_op_ambiguous_incomparable.asm');
    const result = await compile(entry, {}, { formats: defaultFormatWriters });
    const message = result.diagnostics[0]?.message ?? '';

    expect(message).toContain('Ambiguous op overload for "choose" (2 matches).');
    expect(message).toContain('call-site operands: (HL, BC)');
    expect(message).toContain('equally specific candidates:');
    expect(message).toContain(`choose(dst HL, src reg16) (${entry}:1)`);
    expect(message).toContain(`choose(dst reg16, src BC) (${entry}:5)`);
  });

  it('reports cyclic op expansion diagnostics with declaration locations in the chain', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr16_op_cycle.asm');
    const result = await compile(entry, {}, { formats: defaultFormatWriters });
    const message = result.diagnostics[0]?.message ?? '';

    expect(message).toContain('Cyclic op expansion detected for "first".');
    expect(message).toContain(
      `expansion chain: first (${entry}:1) -> second (${entry}:5) -> first (${entry}:1)`,
    );
  });
});