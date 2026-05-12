import { describe, it, expect } from 'vitest';
import {
  EA_GLOB_CONST,
  EA_GLOB_REG,
  EA_FVAR_CONST,
  EA_GLOB_GLOB,
  EA_FVAR_GLOB,
  EA_FVAR_FVAR,
  TEMPLATE_S_HL,
  EAW_GLOB_CONST,
  EAW_FVAR_CONST,
  TEMPLATE_L_ABC,
  TEMPLATE_LW_HL,
  LOAD_REG_GLOB,
  STORE_REG_GLOB,
  STORE_RP_EA,
  LOAD_BASE_GLOB,
  LOAD_IDX_CONST,
  CALC_EA,
  LOAD_RP_FVAR,
  STORE_RP_FVAR,
  renderStepPipeline,
} from '../src/lowering/steps';

const asm = renderStepPipeline;

describe('addressing-model step library', () => {
  it('EA_GLOB_CONST matches doc (byte)', () => {
    const p = EA_GLOB_CONST('glob_b', 2);
    expect(asm(p)).toEqual(['ld de, glob_b', 'ld hl, $0002', 'add hl, de']);
  });

  it('EA_GLOB_REG (byte) zero-extends reg8', () => {
    const p = EA_GLOB_REG('glob_b', 'c');
    expect(asm(p)).toEqual(['ld de, glob_b', 'ld h, 0', 'ld l, c', 'add hl, de']);
  });

  it('LOAD_REG_GLOB uses AF borrow for non-A byte globals', () => {
    expect(asm(LOAD_REG_GLOB('A', 'glob_b'))).toEqual(['ld a, (glob_b)']);
    expect(asm(LOAD_REG_GLOB('B', 'glob_b'))).toEqual([
      'push af',
      'ld a, (glob_b)',
      'ld B, a',
      'pop af',
    ]);
  });

  it('STORE_REG_GLOB uses AF borrow for non-A byte globals', () => {
    expect(asm(STORE_REG_GLOB('A', 'glob_b'))).toEqual(['ld (glob_b), a']);
    expect(asm(STORE_REG_GLOB('B', 'glob_b'))).toEqual([
      'push af',
      'ld a, B',
      'ld (glob_b), a',
      'pop af',
    ]);
  });

  it('EA_FVAR_CONST folds small disps', () => {
    const p = EA_FVAR_CONST(-4, 2);
    expect(asm(p)).toEqual(['ld e, (ix-$02)', 'ld d, (ix-$01)', 'ld hl, $0000', 'add hl, de']);
  });

  it('EAW_GLOB_CONST scales by two', () => {
    const p = EAW_GLOB_CONST('glob_w', 3);
    expect(asm(p)).toEqual(['ld de, glob_w', 'ld hl, $0003', 'add hl, hl', 'add hl, de']);
  });

  it('EAW_FVAR_CONST folds scaled const when possible', () => {
    const p = EAW_FVAR_CONST(-6, 1);
    expect(asm(p)).toEqual([
      'ld e, (ix-$04)',
      'ld d, (ix-$03)',
      'ld hl, $0000',
      'add hl, hl',
      'add hl, de',
    ]);
  });

  it('word frame access uses DE shuttle for HL', () => {
    expect(asm(LOAD_RP_FVAR('HL', -2))).toEqual([
      'ex de, hl',
      'ld e, (ix-$02)',
      'ld d, (ix-$01)',
      'ex de, hl',
    ]);
    expect(asm(STORE_RP_FVAR('HL', -2))).toEqual([
      'ex de, hl',
      'ld (ix-$02), e',
      'ld (ix-$01), d',
      'ex de, hl',
    ]);
  });

  it('L-ABC template wraps EA with saves/restores', () => {
    const p = TEMPLATE_L_ABC('a', [
      ...LOAD_BASE_GLOB('glob_b'),
      ...LOAD_IDX_CONST(1),
      ...CALC_EA(),
    ]);
    expect(asm(p)).toEqual([
      'push de',
      'push hl',
      'ld de, glob_b',
      'ld hl, $0001',
      'add hl, de',
      'ld a, (hl)',
      'pop hl',
      'pop de',
    ]);
  });

  it('LW-HL template preserves DE', () => {
    const p = TEMPLATE_LW_HL(EAW_GLOB_CONST('glob_w', 0));
    expect(asm(p)).toEqual([
      'push de',
      'ld de, glob_w',
      'ld hl, $0000',
      'add hl, hl',
      'add hl, de',
      'ld e, (hl)',
      'inc hl',
      'ld d, (hl)',
      'ld lo(HL), e',
      'ld hi(HL), d',
      'pop de',
    ]);
  });

  it('STORE_RP_EA omits self-moves for DE', () => {
    expect(asm(STORE_RP_EA('DE'))).toEqual(['ld (hl), e', 'inc hl', 'ld (hl), d']);
    expect(asm(STORE_RP_EA('BC'))).toEqual([
      'ld e, lo(BC)',
      'ld d, hi(BC)',
      'ld (hl), e',
      'inc hl',
      'ld (hl), d',
    ]);
  });

  it('EA_GLOB_GLOB uses glob index (byte)', () => {
    const p = EA_GLOB_GLOB('base', 'idx');
    expect(asm(p)).toEqual(['ld de, base', 'ld hl, (idx)', 'add hl, de']);
  });

  it('EA_FVAR_GLOB mixes frame base with glob index (byte)', () => {
    const p = EA_FVAR_GLOB(-8, 'idx');
    expect(asm(p)).toEqual(['ld e, (ix-$08)', 'ld d, (ix-$07)', 'ld hl, (idx)', 'add hl, de']);
  });

  it('EA_FVAR_FVAR indexes frame base by frame idx (byte)', () => {
    const p = EA_FVAR_FVAR(-4, -10);
    expect(asm(p)).toEqual([
      'ld e, (ix-$04)',
      'ld d, (ix-$03)',
      'ex de, hl',
      'ld e, (ix-$0a)',
      'ld d, (ix-$09)',
      'ex de, hl',
      'add hl, de',
    ]);
  });

  it('S-HL stores via saved value and EA in HL', () => {
    const p = TEMPLATE_S_HL('H', EA_GLOB_CONST('glob', 1));
    expect(asm(p)).toEqual([
      'push de',
      'push hl',
      'ld de, glob',
      'ld hl, $0001',
      'add hl, de',
      'pop de',
      'ld (hl), D',
      'pop de',
    ]);
  });
});
