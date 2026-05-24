import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { runNextAzmFixture } from './next-azm-runner.js';

describe('AZM promoted lowered .z80 artifact boundary', () => {
  it.each(['minimal.asm', 'alias_and_storage.asm', 'enum_and_storage.asm'])(
    'emits lowered ASM80 output on %s',
    async (fixture) => {
      const fixturePath = fileURLToPath(new URL(`./fixtures/${fixture}`, import.meta.url));
      const asm80Text = await runLoweredFixture(fixturePath);

      expect(asm80Text).toContain('; AZM lowered ASM80 output');
      expect(asm80Text).not.toContain('AZMN_ASM80');
    },
  );

  it('emits normal branch text for the fixup slice', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/fixup_slice.asm', import.meta.url));
    const asm80Text = await runLoweredFixture(fixturePath);

    expect(asm80Text).toBe(
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
    const asm80Text = await runLoweredFixture(fixturePath);

    expect(asm80Text).toContain('ORG $00');
  });

  it('does not emit implicit ORG $00 when a later explicit origin exists', async () => {
    const asm80Text = await runLoweredSource([
      'VALUE EQU 42',
      '        ORG 0100H',
      'main:',
      '        LD A,VALUE',
      '        RET',
      '',
    ]);

    expect(asm80Text).not.toContain('ORG $00');
    expect(asm80Text).toContain('VALUE EQU $2A\nORG $0100\nmain:');
  });

  it('preserves simple symbolic DW operands in normal lowered output', async () => {
    const asm80Text = await runLoweredSource([
      '        ORG 0100H',
      'VALUE   EQU 42',
      'start:',
      '        RET',
      'table:  DW start, VALUE',
      '        DB 0AAH',
      '',
    ]);

    expect(asm80Text).toBe(
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
    const asm80Text = await runLoweredSource([
      '        ORG 0100H',
      'start:  ISTR ""',
      'empty:  DB ""',
      'after:  DB 1',
      '',
    ]);

    expect(asm80Text).toBe(
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

  it.each([
    ['pr56_isa_misc.asm', ['di', 'ei', 'ex de, hl', 'ex (sp), hl', 'exx']],
    ['pr57_isa_im_rst.asm', ['im $01', 'rst $00', 'rst $08', 'rst $38', 'reti', 'retn']],
    ['pr123_isa_alu_a_core.asm', ['add a, b', 'add a, (HL)', 'cp $10']],
    ['pr91_isa_hl16_adc_sbc.asm', ['adc hl, bc', 'sbc hl, sp']],
    ['pr126_cb_bitops_reg_matrix.asm', ['bit $00, b', 'set $07, a']],
    ['pr113_isa_indexed_bit_setres_dst.asm', ['set $00, (ix+$01), b', 'res $06, (iy+$7F), l']],
  ] as const)('emits normal lowered ASM80 text for %s', async (fixture, expectedLines) => {
    const fixturePath = fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url));
    const asm80Text = await runLoweredFixture(fixturePath);

    for (const expected of expectedLines) {
      expect(asm80Text).toContain(expected);
    }
  });

  it.each([
    ['pr1349_ld_a_indirect_bc.asm', ['ld bc, buf', 'ld a, (bc)']],
    ['pr1349_ld_a_indirect_de.asm', ['ld de, buf', 'ld a, (de)']],
    ['pr1349_ld_a_indirect_hl.asm', ['ld hl, buf', 'ld a, (hl)']],
    ['pr1349_ld_indirect_bc_store.asm', ['ld bc, buf', 'ld (bc), a']],
    ['pr1349_ld_indirect_de_store.asm', ['ld de, buf', 'ld (de), a']],
    ['pr263_case_style_lint.asm', ['ld a, $01', 'ld b, a']],
  ] as const)('emits normal LD register and register-indirect output for %s', async (fixture, expectedLines) => {
    const fixturePath = fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url));
    const asm80Text = await runLoweredFixture(fixturePath);

    for (const expected of expectedLines) {
      expect(asm80Text).toContain(expected);
    }
  });

  it('emits normal LD absolute-memory text', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr786_raw_data_lowering.asm', import.meta.url),
    );
    const asm80Text = await runLoweredFixture(fixturePath);

    expect(asm80Text).toContain('ld hl, table\nld a, (table)\nld (table), a\nret');
    expect(asm80Text).not.toContain('DB $3A');
    expect(asm80Text).not.toContain('DB $32');
  });

  it('emits normal LD absolute-memory text for symbol operands', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr991_comment_preservation.asm', import.meta.url),
    );
    const asm80Text = await runLoweredFixture(fixturePath);

    expect(asm80Text).toContain('ld a, (count)');
    expect(asm80Text).toContain('ret');
    expect(asm80Text).not.toContain('DB $3A');
  });

  it('emits normal lowered ASM80 text for special registers and index loads', async () => {
    const asm80Text = await runLoweredSource([
      '        ORG 0100H',
      'Monster0:',
      '        LD A,R',
      '        LD IX,Monster0',
      '        RET',
      '',
    ]);

    expect(asm80Text).toContain('ld a, r');
    expect(asm80Text).toContain('ld ix, Monster0');
  });

  it('formats DS reserve sizes parsed as type-size equate names', async () => {
    const asm80Text = await runLoweredSource([
      '        ORG 0100H',
      'RowCount EQU 8',
      'table:',
      '        DS RowCount',
      '        RET',
      '',
    ]);

    expect(asm80Text).toContain('DS $08');
  });

  it('emits normal lowered ASM80 text for stack and conditional return instructions', async () => {
    const asm80Text = await runLoweredSource([
      '        ORG 0100H',
      '        PUSH BC',
      '        POP HL',
      '        RET Z',
      '        RET',
      '',
    ]);

    expect(asm80Text).not.toContain('does not yet support');
    expect(asm80Text).toContain('push bc');
    expect(asm80Text).toContain('pop hl');
    expect(asm80Text).toContain('ret z');
  });

  it('formats symbolic branch expressions for lowered output', async () => {
    const asm80Text = await runLoweredSource([
      '        ORG 0100H',
      'BASE:',
      '        NOP',
      'APICall:',
      '        JP APICall-BASE',
      '        RET',
      '',
    ]);

    expect(asm80Text).toContain('BASE:');
    expect(asm80Text).toContain('APICall:');
    expect(asm80Text).toContain('jp APICall-BASE');
  });

  it('emits normal LD (HL) and absolute-memory register forms', async () => {
    const asm80Text = await runLoweredSource([
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
    ]);

    expect(asm80Text).toContain('ld hl, (ScanPtr)');
    expect(asm80Text).toContain('ld (ScanMask), a');
    expect(asm80Text).toContain('ld (hl), b');
    expect(asm80Text).toContain('ld c, (hl)');
    expect(asm80Text).toContain('ld (ScanPtr), hl');
  });

  it('emits normal lowered ASM80 text for CB rotate and shift instructions', async () => {
    const asm80Text = await runLoweredSource([
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
    ]);

    expect(asm80Text).not.toContain('does not yet support');
    expect(asm80Text).toContain('rlc b');
    expect(asm80Text).toContain('rrc (HL)');
    expect(asm80Text).toContain('rl a');
    expect(asm80Text).toContain('sll l');
    expect(asm80Text).toContain('rlc (ix+$01), b');
    expect(asm80Text).toContain('sra (iy+$7F), l');
  });

  it('emits normal in/out and inc text for op-expanded port substitution', async () => {
    const fixturePath = fileURLToPath(
      new URL('../fixtures/pr1367_op_port_imm_substitution.asm', import.meta.url),
    );
    const asm80Text = await runLoweredFixture(fixturePath);

    expect(asm80Text).toContain('PORT_RED EQU $06');
    expect(asm80Text).toContain('ld hl, $9000');
    expect(asm80Text).toContain('out ($06), a\ninc hl');
    expect(asm80Text).toContain('out ($F8), a');
    expect(asm80Text).toContain('in a, ($06)');
  });

  it.each(['pr274_type_padding_explicit_ok.asm', 'pr274_type_padding_warning.asm'])(
    'emits sizeof-backed DS on %s',
    async (fixture) => {
      const fixturePath = fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url));
      const asm80Text = await runLoweredFixture(fixturePath);

      expect(asm80Text).toMatch(/DS \$0[58]/);
    },
  );
});

async function runLoweredSource(lines: readonly string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'azm-lowered-'));
  try {
    const entry = join(dir, 'main.asm');
    await writeFile(entry, lines.join('\n'), 'utf8');
    return await runLoweredFixture(entry);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runLoweredFixture(entryFile: string): Promise<string> {
  const result = await runNextAzmFixture(entryFile, [], { emitAsm80: true });
  expect(result.exitCode).toBe(0);
  expect(result.asm80Text).toBeDefined();
  expect(result.asm80Text).toContain('; AZM lowered ASM80 output');
  expect(result.asm80Text).not.toContain('AZMN_ASM80');
  return result.asm80Text!;
}
