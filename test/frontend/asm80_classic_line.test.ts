import { describe, expect, it } from 'vitest';

import { buildDirectiveAliasPolicy } from '../../src/frontend/directiveAliases.js';
import { parseClassicLine } from '../../src/frontend/asm80/classicLine.js';

const azmAliases = buildDirectiveAliasPolicy('azm');

describe('classic ASM80 logical line parser', () => {
  it('parses labels, directives, raw data, and instructions', () => {
    const lines = [
      'boot:',
      'kCPI:   cpi',
      'KEYB:   .equ 00H',
      'MCB_RTC .equ 40H',
      '        .org BASE_ADDR+08H',
      '        .db "Enter ",0',
      '        .dw DATA_FROM',
      '        ds 2,0',
      '        .binfrom 0C000H',
      '        .binto 0C010H',
      '        END',
      '        set 4,(hl)',
    ].map((text, index) => parseClassicLine('/classic.z80', text, index + 1, 0, azmAliases));

    expect(lines).toEqual([
      { kind: 'label', name: 'boot' },
      { kind: 'instruction', label: 'kCPI', head: 'cpi', operandText: '' },
      { kind: 'equ', name: 'KEYB', exprText: '00H' },
      { kind: 'equ', name: 'MCB_RTC', exprText: '40H' },
      { kind: 'org', exprText: 'BASE_ADDR+08H' },
      { kind: 'rawData', directive: 'db', valuesText: '"Enter ",0' },
      { kind: 'rawData', directive: 'dw', valuesText: 'DATA_FROM' },
      { kind: 'rawData', directive: 'ds', valuesText: '2,0' },
      { kind: 'binfrom', exprText: '0C000H' },
      { kind: 'binto', exprText: '0C010H' },
      { kind: 'end' },
      { kind: 'instruction', head: 'set', operandText: '4,(hl)' },
    ]);
  });

  it('parses undotted ASM80 data and placement directives', () => {
    const lines = ['ORG 4000H', 'DB "OK"', 'DW START', 'DS 3', 'BINFROM 4000H', 'BINTO 4004H'].map(
      (text, index) => parseClassicLine('/classic.z80', text, index + 1, 0, azmAliases),
    );

    expect(lines).toEqual([
      { kind: 'org', exprText: '4000H' },
      { kind: 'rawData', directive: 'db', valuesText: '"OK"' },
      { kind: 'rawData', directive: 'dw', valuesText: 'START' },
      { kind: 'rawData', directive: 'ds', valuesText: '3' },
      { kind: 'binfrom', exprText: '4000H' },
      { kind: 'binto', exprText: '4004H' },
    ]);
  });

  it('ignores semicolon comments outside quoted strings', () => {
    expect(parseClassicLine('/classic.z80', 'msg: .db "A;B",0 ; comment', 1, 0)).toEqual({
      kind: 'rawData',
      label: 'msg',
      directive: 'db',
      valuesText: '"A;B",0',
    });
  });

  it('preserves AF prime suffix while stripping trailing comments', () => {
    expect(parseClassicLine('/classic.z80', "ex af,af'           ;start saving registers", 1, 0)).toEqual({
      kind: 'instruction',
      head: 'ex',
      operandText: "af,af'",
    });
  });

  it('parses leading-dot local labels', () => {
    expect(parseClassicLine('/classic.z80', '.loop:', 1, 0)).toEqual({
      kind: 'label',
      name: '.loop',
    });
  });

  it('does not accept undotted directives without an alias policy', () => {
    expect(parseClassicLine('/classic.z80', 'DB 1', 1, 0)).toEqual({
      kind: 'instruction',
      head: 'db',
      operandText: '1',
    });
  });

  it('normalizes only the directive head and preserves payload text', () => {
    const aliases = buildDirectiveAliasPolicy('azm', [{ directiveAliases: { BYTE: '.db' } }]);

    expect(parseClassicLine('/classic.z80', 'msg: BYTE xor a', 1, 0, aliases)).toEqual({
      kind: 'rawData',
      label: 'msg',
      directive: 'db',
      valuesText: 'xor a',
    });
  });
});
