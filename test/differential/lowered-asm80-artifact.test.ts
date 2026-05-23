import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';

describe('AZM Next differential lowered .z80 artifact boundary', () => {
  it('captures the current lowered ASM80 mismatch on the minimal fixture', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/minimal.asm', import.meta.url));
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(current.asm80Text).toContain('; AZM lowered ASM80 output');
    expect(next.asm80Text).toContain('; AZM lowered ASM80 output (AZM Next)');

    const differences = compareRunResults(current, next, { compareAsm80: true });
    expect(differences.map((difference) => difference.field)).toEqual(['asm80Text']);
    expect(differences[0]?.expected).toContain('ORG $0100');
    expect(differences[0]?.actual).toContain('ORG 0100H');
  });
});
