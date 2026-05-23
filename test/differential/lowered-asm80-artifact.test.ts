import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareRunResults } from './compare-results.js';
import { runCurrentAzmFixture } from './current-azm-runner.js';
import { runNextAzmFixture } from './next-azm-runner.js';

describe('AZM Next differential lowered .z80 artifact boundary', () => {
  it.each(['minimal.asm', 'alias_and_storage.asm', 'enum_and_storage.asm'])(
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

  it('preserves simple symbolic DW operands in normal lowered output', async () => {
    const source = [
      '        ORG 0100H',
      'VALUE   EQU 42',
      'start:',
      '        RET',
      'table:  DW start, VALUE',
      '        DB 0AAH',
      '',
    ].join('\n');
    const current = await runCurrentAzmFixtureFromSource(source);
    const next = await runNextAzmFixtureFromSource(source);

    expect(compareRunResults(current, next)).toEqual([]);
    expect(next.asm80Text).toBe(
      [
        '; AZM lowered ASM80 output',
        '',
        'ORG $0100',
        'VALUE EQU $2A',
        'start:',
        'ret',
        'table:',
        'DW start, $2A',
        'DB $AA',
        '',
      ].join('\n'),
    );
  });

  it('does not emit bytes or advance addresses for zero-length lowered strings', async () => {
    const source = [
      '        ORG 0100H',
      'start:  ISTR ""',
      'empty:  DB ""',
      'after:  DB 1',
      '',
    ].join('\n');
    const current = await runCurrentAzmFixtureFromSource(source);
    const next = await runNextAzmFixtureFromSource(source);

    expect(compareRunResults(current, next)).toEqual([]);
    expect(next.asm80Text).toBe(
      [
        '; AZM lowered ASM80 output',
        '',
        'ORG $0100',
        'start:',
        'empty:',
        'after:',
        'DB $01',
        '',
      ].join('\n'),
    );
  });

  it('matches current AZM lowered ASM80 output for core zero-operand and EX instructions', async () => {
    const fixturePath = fileURLToPath(new URL('../fixtures/pr56_isa_misc.asm', import.meta.url));
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(next.asm80Text).toBe(current.asm80Text);
    expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
  });

  it('covers remaining core zero-operand and EX lowered output forms', async () => {
    const source = [
      '        ORG 0100H',
      "        EX AF,AF'",
      '        EX (SP),IX',
      '        EX (SP),IY',
      '        DAA',
      '        RLCA',
      '        RRCA',
      '        RLA',
      '        RRA',
      '        NEG',
      '        RRD',
      '        RLD',
      '        LDI',
      '        LDIR',
      '        LDD',
      '        LDDR',
      '        CPI',
      '        CPIR',
      '        CPD',
      '        CPDR',
      '        INI',
      '        INIR',
      '        IND',
      '        INDR',
      '        OUTI',
      '        OTIR',
      '        OUTD',
      '        OTDR',
      '        RETI',
      '        RETN',
      '',
    ].join('\n');
    const current = await runCurrentAzmFixtureFromSource(source);
    const next = await runNextAzmFixtureFromSource(source);

    expect(next.asm80Text).toBe(current.asm80Text);
    expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
  });

  it.each([
    ['pr1349_ld_a_indirect_bc.asm', ['ld bc, buf', 'ld a, (bc)']],
    ['pr1349_ld_a_indirect_de.asm', ['ld de, buf', 'ld a, (de)']],
    ['pr1349_ld_a_indirect_hl.asm', ['ld hl, buf', 'ld a, (hl)']],
    ['pr1349_ld_indirect_bc_store.asm', ['ld bc, buf', 'ld (bc), a']],
    ['pr1349_ld_indirect_de_store.asm', ['ld de, buf', 'ld (de), a']],
    ['pr263_case_style_lint.asm', ['ld a, $01', 'ld b, a']],
  ] as const)(
    'emits normal LD register and register-indirect output for %s',
    async (fixture, expectedLines) => {
      const fixturePath = fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url));
      const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
      const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

      expect(compareRunResults(current, next)).toEqual([]);
      expect(next.asm80Text).not.toContain('AZMN_ASM80');
      for (const expected of expectedLines) {
        expect(next.asm80Text).toContain(expected);
      }
    },
  );

  it('emits normal LD absolute-memory text instead of legacy raw bytes', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr786_raw_data_lowering.asm', import.meta.url),
    );
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(compareRunResults(current, next)).toEqual([]);
    expect(next.asm80Text).toContain('ld hl, table\nld a, (table)\nld (table), a\nret');
    expect(next.asm80Text).not.toContain('DB $3A');
    expect(next.asm80Text).not.toContain('DB $32');
  });

  it('emits normal LD absolute-memory text for symbol operands', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr991_comment_preservation.asm', import.meta.url),
    );
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(compareRunResults(current, next)).toEqual([]);
    expect(next.asm80Text).toContain('ld a, (count)\nret');
    expect(next.asm80Text).not.toContain('DB $3A');
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
