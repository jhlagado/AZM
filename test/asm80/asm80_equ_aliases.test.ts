import { describe, expect, it } from 'vitest';

import { compileAsm80Fixture, requireAsm80Artifact, requireBinArtifact } from './helpers.js';

describe('ASM80 ASM EQU aliases', () => {
  it('resolves ASM equates used as absolute memory operands', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-equ-abs-mem-', 'equ-abs-mem.z80', [
      '.org 0100H',
      'BUF: .equ 0900H',
      'ld hl,(BUF)',
      '.binfrom 0100H',
      '.end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x2a, 0x00, 0x09]);
  });

  it('resolves ASM equ aliases to exact labels after DS reservations', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-ds-equ-alias-', 'ds-equ-alias.asm', [
      'org 4000H',
      'ld (GAME_OVER_KEY_GATE_LO),hl',
      'GAME_OVER_KEY_GATE:',
      'ds 2',
      'GAME_OVER_KEY_GATE_LO equ GAME_OVER_KEY_GATE',
      'CODE:',
      'ld hl,(GAME_OVER_KEY_GATE_LO)',
      'TARGET:',
      'db 0',
      'binfrom 4000H',
      'end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([
      0x22,
      0x03,
      0x40,
      0x00,
      0x00,
      0x2a,
      0x03,
      0x40,
      0x00,
    ]);
  });

  it('resolves ASM equ aliases declared before their target label', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-forward-equ-target-', 'forward-equ-target.asm', [
      'org 4000H',
      'ALIAS equ TARGET',
      'ld hl,(ALIAS)',
      'TARGET:',
      'db 0',
      'binfrom 4000H',
      'end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x2a, 0x03, 0x40, 0x00]);
  });

  it('resolves compound ASM equ aliases through forward aliases', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-compound-forward-equ-', 'compound-forward-equ.asm', [
      'org 4000H',
      'ALIAS equ TARGET',
      'ALIAS_PLUS equ ALIAS+1',
      'ld hl,(ALIAS_PLUS)',
      'TARGET:',
      'db 0,0',
      'binfrom 4000H',
      'end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x2a, 0x04, 0x40, 0x00, 0x00]);
  });

  it('resolves repeated aliases inside an ASM equ expression', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-repeated-forward-equ-', 'repeated-forward-equ.asm', [
      'org 4000H',
      'ALIAS equ TARGET',
      'SUM equ ALIAS+ALIAS',
      'dw SUM',
      'TARGET:',
      'db 0AAH',
      'binfrom 4000H',
      'end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x04, 0x80, 0xaa]);
  });

  it('preserves current-location context for deferred ASM equ aliases', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-forward-equ-current-', 'forward-equ-current.asm', [
      'org 4000H',
      'ALIAS equ TARGET+($-$)',
      'ld hl,(ALIAS)',
      'TARGET:',
      'db 0',
      'binfrom 4000H',
      'end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x2a, 0x03, 0x40, 0x00]);
  });

  it('rejects labels that shadow unresolved ASM equ aliases', async () => {
    await expect(
      compileAsm80Fixture('azm-asm80-equ-shadow-', 'equ-shadow.asm', [
        'org 4000H',
        'ALIAS equ TARGET',
        'ld hl,(ALIAS)',
        'ALIAS:',
        'db 0',
        'TARGET:',
        'db 0',
        'binfrom 4000H',
        'end',
      ]),
    ).rejects.toThrow('Duplicate symbol name');
  });

  it('resolves forward ASM equ aliases in word data', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-forward-equ-dw-', 'forward-equ-dw.asm', [
      'org 4000H',
      'ALIAS equ TARGET',
      'dw ALIAS',
      'TARGET:',
      'db 0AAH',
      'binfrom 4000H',
      'end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x02, 0x40, 0xaa]);
  });

  it('keeps forward ASM equ aliases self-contained in emitted asm80', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-forward-equ-asm80-', 'forward-equ-asm80.asm', [
      'org 4000H',
      'ALIAS equ TARGET',
      'dw ALIAS',
      'TARGET:',
      'db 0AAH',
      'binfrom 4000H',
      'end',
    ]);
    const asm80 = requireAsm80Artifact(artifacts);
    expect(asm80.text).toContain('ALIAS EQU $4002');
    expect(asm80.text).toContain('DW ALIAS');
  });

  it('resolves forward ASM equ aliases in byte data', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-forward-equ-db-', 'forward-equ-db.asm', [
      'org 4000H',
      'ALIAS equ TARGET',
      'db ALIAS',
      'TARGET:',
      'db 0AAH',
      'binfrom 4000H',
      'end',
    ]);
    const bin = requireBinArtifact(artifacts);
    expect([...bin.bytes]).toEqual([0x01, 0xaa]);
  });
});
