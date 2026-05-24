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
    expect(next.asm80Text).toContain('ld a, (count)');
    expect(next.asm80Text).toContain('ret');
    expect(next.asm80Text).not.toContain('DB $3A');
  });

  it('matches current AZM lowered ASM80 output for IM and RST instructions', async () => {
    const fixturePath = fileURLToPath(new URL('../fixtures/pr57_isa_im_rst.asm', import.meta.url));
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(next.asm80Text).toBe(current.asm80Text);
    expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
    expect(next.asm80Text).toContain('im $01\nrst $00\nrst $08\nrst $38\nreti\nretn');
  });

  it('matches current AZM lowered ASM80 output for accumulator ALU instructions', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr123_isa_alu_a_core.asm', import.meta.url),
    );
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(next.asm80Text).toBe(current.asm80Text);
    expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
    expect(next.asm80Text).toContain('add a, b');
    expect(next.asm80Text).toContain('add a, (HL)');
    expect(next.asm80Text).toContain('cp $10');
  });

  it('matches current AZM lowered ASM80 output for HL16 ADC and SBC instructions', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr91_isa_hl16_adc_sbc.asm', import.meta.url),
    );
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(next.asm80Text).toBe(current.asm80Text);
    expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
    expect(next.asm80Text).toContain('adc hl, bc');
    expect(next.asm80Text).toContain('sbc hl, sp');
  });

  it('matches current AZM lowered ASM80 output for CB bit/res/set instructions', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr126_cb_bitops_reg_matrix.asm', import.meta.url),
    );
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(next.asm80Text).toBe(current.asm80Text);
    expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
    expect(next.asm80Text).toContain('bit $00, b');
    expect(next.asm80Text).toContain('set $07, a');
  });

  it('matches current AZM lowered ASM80 output for indexed CB bit/res/set forms', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr113_isa_indexed_bit_setres_dst.asm', import.meta.url),
    );
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(next.asm80Text).toBe(current.asm80Text);
    expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
    expect(next.asm80Text).toContain('set $00, (ix+$01), b');
    expect(next.asm80Text).toContain('res $06, (iy+$7F), l');
  });

  it('emits normal lowered ASM80 text for special registers and index loads', async () => {
    const source = [
      '        ORG 0100H',
      'Monster0:',
      '        LD A,R',
      '        LD IX,Monster0',
      '        RET',
      '',
    ].join('\n');
    const next = await runNextAzmFixtureFromSource(source);

    expect(next.asm80Text).toContain('ld a, r');
    expect(next.asm80Text).toContain('ld ix, Monster0');
  });

  it('formats DS reserve sizes parsed as type-size equate names', async () => {
    const source = [
      '        ORG 0100H',
      'RowCount EQU 8',
      'table:',
      '        DS RowCount',
      '        RET',
      '',
    ].join('\n');
    const next = await runNextAzmFixtureFromSource(source);

    expect(next.asm80Text).toContain('DS $08');
  });

  it('emits normal lowered ASM80 text for stack and conditional return instructions', async () => {
    const source = [
      '        ORG 0100H',
      '        PUSH BC',
      '        POP HL',
      '        RET Z',
      '        RET',
      '',
    ].join('\n');
    const next = await runNextAzmFixtureFromSource(source);

    expect(next.asm80Text).not.toContain('does not yet support');
    expect(next.asm80Text).toContain('push bc');
    expect(next.asm80Text).toContain('pop hl');
    expect(next.asm80Text).toContain('ret z');
  });

  it('formats symbolic branch expressions for lowered output', async () => {
    const source = [
      '        ORG 0100H',
      'BASE:',
      '        NOP',
      'APICall:',
      '        JP APICall-BASE',
      '        RET',
      '',
    ].join('\n');
    const next = await runNextAzmFixtureFromSource(source);

    expect(next.asm80Text).toContain('BASE:');
    expect(next.asm80Text).toContain('APICall:');
    expect(next.asm80Text).toContain('jp APICall-BASE');
  });

  it('emits normal LD (HL) and absolute-memory register forms', async () => {
    const source = [
      '        ORG 0100H',
      'ScanPtr: DW 0',
      'ScanMask: DB 0',
      '        LD HL,(ScanPtr)',
      '        LD (ScanMask),A',
      '        LD (HL),B',
      '        LD C,(HL)',
      '        LD (ScanPtr),HL',
      '        RET',
      '',
    ].join('\n');
    const next = await runNextAzmFixtureFromSource(source);

    expect(next.asm80Text).toContain('ld hl, (ScanPtr)');
    expect(next.asm80Text).toContain('ld (ScanMask), a');
    expect(next.asm80Text).toContain('ld (hl), b');
    expect(next.asm80Text).toContain('ld c, (hl)');
    expect(next.asm80Text).toContain('ld (ScanPtr), hl');
  });

  it('emits normal lowered ASM80 text for CB rotate and shift instructions', async () => {
    const source = [
      '        ORG 0100H',
      '        RLC B',
      '        RRC (HL)',
      '        RL A',
      '        RR C',
      '        SLA D',
      '        SRA E',
      '        SLL L',
      '        SRL H',
      '        RLC (IX+1), B',
      '        SRA (IY+$7F), L',
      '',
    ].join('\n');
    const next = await runNextAzmFixtureFromSource(source);

    expect(next.asm80Text).not.toContain('does not yet support');
    expect(next.asm80Text).toContain('rlc b');
    expect(next.asm80Text).toContain('rrc (HL)');
    expect(next.asm80Text).toContain('rl a');
    expect(next.asm80Text).toContain('sll l');
    expect(next.asm80Text).toContain('rlc (ix+$01), b');
    expect(next.asm80Text).toContain('sra (iy+$7F), l');
  });

  it('emits normal in/out and inc text for op-expanded port substitution', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr1367_op_port_imm_substitution.asm', import.meta.url),
    );
    const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
    const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

    expect(compareRunResults(current, next)).toEqual([]);
    expect(next.asm80Text).not.toContain('AZMN_ASM80');
    expect(next.asm80Text).toContain('PORT_RED EQU $06');
    expect(next.asm80Text).toContain('ld hl, $9000');
    expect(next.asm80Text).toContain('out ($06), a\ninc hl');
    expect(next.asm80Text).toContain('out ($F8), a');
    expect(next.asm80Text).toContain('in a, ($06)');
  });

  it.each(['pr274_type_padding_explicit_ok.asm', 'pr274_type_padding_warning.asm'])(
    'matches current AZM lowered ASM80 output for sizeof-backed DS on %s',
    async (fixture) => {
      const fixturePath = fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url));
      const current = await runCurrentAzmFixture(fixturePath, [], { emitAsm80: true });
      const next = await runNextAzmFixture(fixturePath, [], { emitAsm80: true });

      expect(next.asm80Text).toBe(current.asm80Text);
      expect(compareRunResults(current, next, { compareAsm80: true })).toEqual([]);
      expect(next.asm80Text).toMatch(/DS \$0[58]/);
    },
  );
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
