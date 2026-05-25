import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('real-program parity regressions', () => {
  it('accepts @ entry labels', () => {
    const result = compileNext(`
        .org 0100H
@Start:
        ret
`);
    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0xc9]);
  });

  it('encodes ld (hl), imm and ld r8,(hl)', () => {
    const result = compileNext(`
        .org 0100H
        ld hl,200h
        ld (hl),42
        ld b,(hl)
        ret
`);
    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x21, 0x00, 0x02, 0x36, 0x2a, 0x46, 0xc9,
    ]);
  });

  it('expands multi-character string equates in .db', () => {
    const result = compileNext(`
        .org 0100H
        MSG .equ "AB"
        .db MSG,0
        ret
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.hexText.replace(/\s/g, '')).toContain('414200C9');
  });

  it('sizes forward-referenced string equates in .db for label placement', () => {
    const result = compileNext(`
        .org 0100H
        .db REL_TXT,0
target:
        ret
REL_TXT .equ "2025.16"
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toMatchObject({ target: 0x0108 });
    expect(Array.from(result.bytes.slice(0x0100, 0x0109))).toEqual([
      0x32, 0x30, 0x32, 0x35, 0x2e, 0x31, 0x36, 0x00, 0xc9,
    ]);
  });

  it('rejects label:.equ without space after colon', () => {
    const result = compileNext(`
        .org 0100H
FLAG:.equ 5
        ld a,FLAG
        ret
`);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'Use "FLAG .equ ..." for constants; colon labels mark addresses.' }),
    ]));
  });

  it('resolves symbols case-insensitively for fixups', () => {
    const result = compileNext(`
        .org 0100H
target:
        jr target
APIok:
        jr c,APIOk
        ret
`);
    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x18, 0xfe, 0x38, 0xfe, 0xc9]);
  });

  it('encodes signed 16-bit immediates for ld rr,imm', () => {
    const result = compileNext(`
        .org 0100H
        ld de,-16
        ld hl,0-60h
        ret
`);
    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x11, 0xf0, 0xff, 0x21, 0xa0, 0xff, 0xc9,
    ]);
  });
});
