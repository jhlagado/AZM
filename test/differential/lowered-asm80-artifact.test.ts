import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';

describe('AZM Next differential lowered .z80 artifact boundary', () => {
  it.each(['minimal.asm'])(
    'matches current AZM lowered ASM80 output on %s',
    async (fixture) => {
      const fixturePath = fileURLToPath(new URL(`./fixtures/${fixture}`, import.meta.url));
      const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
      const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

      expect(current.asm80Text).toContain('; AZM lowered ASM80 output');
      expect(next.asm80Text).toBe(current.asm80Text);

      const differences = compareRunResults(current, next, { compareAsm80: true });
      expect(differences).toEqual([]);
    },
  );

  it('emits normal branch text for the fixup slice instead of legacy raw bytes', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/fixup_slice.asm', import.meta.url));
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(compareRunResults(current, next)).toEqual([]);
    expect(next.asm80Text).toBe(
      [
        '; AZM lowered ASM80 output',
        '',
        'ORG $0100',
        'main:',
        'call target',
        'jr done',
        'nop',
        'done:',
        'ret',
        'target:',
        'jr main',
        '',
      ].join('\n'),
    );
  });

  it('emits implicit ORG $00 for standalone lowered output without an explicit origin', async () => {
    const fixturePath = fileURLToPath(new URL('../fixtures/pr4_enum.asm', import.meta.url));
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(next.asm80Text).toBe(current.asm80Text);
    expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
  });

  it('does not emit implicit ORG $00 when a later explicit origin exists', async () => {
    const source = [
      'VALUE EQU 42',
      '        ORG 0100H',
      'main:',
      '        LD A,VALUE',
      '        RET',
      '',
    ].join('\n');
    const current = await runCurrentAzmFixtureFromSource(source);
    const next = await runNextAzmFixtureFromSource(source);

    expect(compareRunResults(current, next)).toEqual([]);
    expect(next.asm80Text).not.toContain('ORG $00');
    expect(next.asm80Text).toContain('VALUE EQU $2A\nORG $0100\nmain:');
  });
});

async function runCurrentAzmFixtureFromSource(source: string) {
  const dir = await mkdtemp(join(tmpdir(), 'azm-current-lowered-'));
  try {
    const entry = join(dir, 'main.asm');
    await writeFile(entry, source, 'utf8');
    return await runCurrentAzmFixture(entry, [], { emitAsm80: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runNextAzmFixtureFromSource(source: string) {
  const dir = await mkdtemp(join(tmpdir(), 'azm-next-lowered-'));
  try {
    const entry = join(dir, 'main.asm');
    await writeFile(entry, source, 'utf8');
    return await runNextAzmFixture(entry, [], { emitAsm80: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
