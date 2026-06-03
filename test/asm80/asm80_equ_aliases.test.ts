import { describe, expect, it } from 'vitest';

import { requireAsm80Artifact } from './asm80-artifact-helper.js';
import { requireBinArtifact } from './bin-artifact-helper.js';
import { compileAsm80Fixture } from './compile-fixture.js';

describe('ASM80 ASM EQU aliases', () => {
  it('resolves ASM equates used as absolute memory operands', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-equ-abs-mem-', 'equ-abs-mem.z80', [
      '.org 0100H',
      'BUF .equ 0900H',
      'ld hl,(BUF)',
      '.binfrom 0100H',
      '.end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x2a, 0x00, 0x09]);
  });

  it('resolves ASM EQU aliases to exact labels after DS reservations', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-DS-EQU-alias-', 'DS-EQU-alias.asm', [
      'ORG 4000H',
      'ld (GAME_OVER_KEY_GATE_LO),hl',
      'GAME_OVER_KEY_GATE:',
      'DS 2',
      'GAME_OVER_KEY_GATE_LO EQU GAME_OVER_KEY_GATE',
      'CODE:',
      'ld hl,(GAME_OVER_KEY_GATE_LO)',
      'TARGET:',
      'DB 0',
      'BINFROM 4000H',
      'END',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x22, 0x03, 0x40, 0x00, 0x00, 0x2a, 0x03, 0x40, 0x00]);
  });

  it('resolves ASM EQU aliases declared before their target label', async () => {
    const artifacts = await compileAsm80Fixture(
      'azm-asm80-forward-EQU-target-',
      'forward-EQU-target.asm',
      ['ORG 4000H', 'ALIAS EQU TARGET', 'ld hl,(ALIAS)', 'TARGET:', 'DB 0', 'BINFROM 4000H', 'END'],
    );
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x2a, 0x03, 0x40, 0x00]);
  });

  it('resolves compound ASM EQU aliases through forward aliases', async () => {
    const artifacts = await compileAsm80Fixture(
      'azm-asm80-compound-forward-EQU-',
      'compound-forward-EQU.asm',
      [
        'ORG 4000H',
        'ALIAS EQU TARGET',
        'ALIAS_PLUS EQU ALIAS+1',
        'ld hl,(ALIAS_PLUS)',
        'TARGET:',
        'DB 0,0',
        'BINFROM 4000H',
        'END',
      ],
    );
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x2a, 0x04, 0x40, 0x00, 0x00]);
  });

  it('resolves repeated aliases inside an ASM EQU expression', async () => {
    const artifacts = await compileAsm80Fixture(
      'azm-asm80-repeated-forward-EQU-',
      'repeated-forward-EQU.asm',
      [
        'ORG 4000H',
        'ALIAS EQU TARGET',
        'SUM EQU ALIAS+ALIAS',
        'DW SUM',
        'TARGET:',
        'DB 0AAH',
        'BINFROM 4000H',
        'END',
      ],
    );
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x04, 0x80, 0xaa]);
  });

  it('preserves current-location context for deferred ASM EQU aliases', async () => {
    const artifacts = await compileAsm80Fixture(
      'azm-asm80-forward-EQU-current-',
      'forward-EQU-current.asm',
      [
        'ORG 4000H',
        'ALIAS EQU TARGET+($-$)',
        'ld hl,(ALIAS)',
        'TARGET:',
        'DB 0',
        'BINFROM 4000H',
        'END',
      ],
    );
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x2a, 0x03, 0x40, 0x00]);
  });

  it('rejects labels that shadow unresolved ASM EQU aliases', async () => {
    await expect(
      compileAsm80Fixture('azm-asm80-EQU-shadow-', 'EQU-shadow.asm', [
        'ORG 4000H',
        'ALIAS EQU TARGET',
        'ld hl,(ALIAS)',
        'ALIAS:',
        'DB 0',
        'TARGET:',
        'DB 0',
        'BINFROM 4000H',
        'END',
      ]),
    ).rejects.toThrow(/duplicate symbol/i);
  });

  it('resolves forward ASM EQU aliases in word data', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-forward-EQU-DW-', 'forward-EQU-DW.asm', [
      'ORG 4000H',
      'ALIAS EQU TARGET',
      'DW ALIAS',
      'TARGET:',
      'DB 0AAH',
      'BINFROM 4000H',
      'END',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x02, 0x40, 0xaa]);
  });

  it('keeps forward ASM EQU aliases self-contained in emitted asm80', async () => {
    const artifacts = await compileAsm80Fixture(
      'azm-asm80-forward-EQU-asm80-',
      'forward-EQU-asm80.asm',
      ['ORG 4000H', 'ALIAS EQU TARGET', 'DW ALIAS', 'TARGET:', 'DB 0AAH', 'BINFROM 4000H', 'END'],
    );
    const asm80 = requireAsm80Artifact(artifacts);
    expect(asm80.text).toContain('ALIAS EQU TARGET');
    expect(asm80.text).toMatch(/DW (ALIAS|\$4002)/);
  });

  it('resolves forward ASM EQU aliases in byte data', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-forward-EQU-DB-', 'forward-EQU-DB.asm', [
      'ORG 4000H',
      'ALIAS EQU TARGET',
      'DB ALIAS',
      'TARGET:',
      'DB 0AAH',
      'BINFROM 4000H',
      'END',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x01, 0xaa]);
  });
});
