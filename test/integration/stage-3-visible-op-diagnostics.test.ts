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

  it('reports invalid op expansion diagnostics with expanded instruction context', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr270_op_invalid_expansion_diagnostics.asm');
    const result = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = result.diagnostics.map((diagnostic) => diagnostic.message ?? '');

    expect(messages.some((message) => message.includes('Invalid op expansion in "clobber_a_with" at call site.'))).toBe(true);
    expect(messages.some((message) => message.includes('expanded instruction: ld A, SP'))).toBe(true);
    expect(messages.some((message) => message.includes('op definition:'))).toBe(true);
    expect(messages.some((message) => message.includes('expansion chain: clobber_a_with'))).toBe(true);
    expect(messages.some((message) =>
      message.includes('ld expects a supported register/memory/immediate transfer form'),
    )).toBe(true);
  });

  it('reports one invalid-expansion diagnostic per failing expanded instruction', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr270_op_invalid_expansion_multi_failure.asm');
    const result = await compile(entry, {}, { formats: defaultFormatWriters });
    const invalids = result.diagnostics.filter((diagnostic) =>
      diagnostic.message?.includes('Invalid op expansion in "bad_pair" at call site.'),
    );

    expect(invalids).toHaveLength(2);
    expect(invalids.some((diagnostic) => diagnostic.message?.includes('expanded instruction: ld A, SP'))).toBe(true);
    expect(invalids.some((diagnostic) => diagnostic.message?.includes('expanded instruction: ld C, SP'))).toBe(true);
  });

  it('reports nested invalid expansion diagnostics with full expansion chain', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr270_op_invalid_expansion_nested_chain.asm');
    const result = await compile(entry, {}, { formats: defaultFormatWriters });
    const message = result.diagnostics.find((diagnostic) =>
      diagnostic.message?.includes('Invalid op expansion in "bad_inner" at call site.'),
    )?.message;

    expect(message).toContain('expanded instruction: ld A, SP');
    expect(message).toContain('expansion chain: mid');
    expect(message).toContain('-> bad_inner');
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