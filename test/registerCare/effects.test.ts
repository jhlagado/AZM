import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { getZ80InstructionEffect } from '../../src/z80/effects.js';

function effect(text: string) {
  const diagnostics: Diagnostic[] = [];
  const sf = makeSourceFile('/tmp/effects.z80', text);
  const inst = parseAsmInstruction('/tmp/effects.z80', text, span(sf, 0, text.length), diagnostics);
  if (!inst) throw new Error(`failed to parse ${text}: ${JSON.stringify(diagnostics)}`);
  return getZ80InstructionEffect(inst);
}

describe('Z80 register-care effects', () => {
  it('models LD HL,nn as writing H and L', () => {
    expect(effect('ld hl,$1234')).toMatchObject({ reads: [], writes: ['H', 'L'] });
  });

  it('models LD A,(DE) as reading D,E and writing A', () => {
    expect(effect('ld a,(de)')).toMatchObject({ reads: ['D', 'E'], writes: ['A'] });
  });

  it('models INC B as reading and writing B plus flags except carry', () => {
    expect(effect('inc b')).toMatchObject({
      reads: ['B'],
      writes: ['B', 'sign', 'zero', 'halfCarry', 'parity', 'negative'],
    });
  });

  it('models ADC A,B as reading incoming carry', () => {
    expect(effect('adc a,b')).toMatchObject({
      reads: ['A', 'B', 'carry'],
    });
  });

  it('models SBC A,B as reading incoming carry', () => {
    expect(effect('sbc a,b')).toMatchObject({
      reads: ['A', 'B', 'carry'],
    });
  });

  it('models PUSH DE as reading D,E and pushing two stack bytes', () => {
    expect(effect('push de')).toMatchObject({
      reads: ['D', 'E'],
      writes: ['SPH', 'SPL'],
      stack: { kind: 'push', units: ['D', 'E'] },
    });
  });

  it('models POP HL as writing H,L and popping two stack bytes', () => {
    expect(effect('pop hl')).toMatchObject({
      writes: ['H', 'L', 'SPH', 'SPL'],
      stack: { kind: 'pop', units: ['H', 'L'] },
    });
  });

  it('models CALL target as a call boundary', () => {
    expect(effect('call HELPER')).toMatchObject({ control: { kind: 'call', target: 'HELPER' } });
  });

  it('models conditional CALL target as a call boundary', () => {
    expect(effect('call z,HELPER')).toMatchObject({
      control: { kind: 'call', target: 'HELPER' },
    });
  });

  it('models DJNZ as reading and writing B with a conditional jump', () => {
    expect(effect('djnz LABEL')).toMatchObject({
      reads: ['B'],
      writes: ['B'],
      control: { kind: 'jump', target: 'LABEL', conditional: true },
    });
  });

  it('models RET as a return boundary', () => {
    expect(effect('ret')).toMatchObject({ control: { kind: 'return' } });
  });

  it('models LD (HL),A as reading H,L,A and not writing registers', () => {
    expect(effect('ld (hl),a')).toMatchObject({ reads: ['H', 'L', 'A'], writes: [] });
  });

  it('returns a conservative unknown effect for unsupported instructions', () => {
    expect(effect('exx')).toMatchObject({
      writes: ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'F'],
      stack: { kind: 'unknown' },
      control: { kind: 'unknown' },
    });
  });
});
