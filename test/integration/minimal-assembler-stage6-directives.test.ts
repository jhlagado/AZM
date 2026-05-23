import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('minimal flat assembler stage 6 directives', () => {
  it('assembles the first Stage 6 string directive slice', () => {
    const result = compileNext(`
        .org 0100H
cstr_label:
        .cstr "OK"
pstr_label:
        .pstr "OK"
istr_label:
        .istr "OK"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      cstr_label: 0x0100,
      pstr_label: 0x0103,
      istr_label: 0x0106,
    });
    expect(Array.from(result.bytes)).toEqual([0x4f, 0x4b, 0x00, 0x02, 0x4f, 0x4b, 0x4f, 0xcb]);
  });

  it('normalizes built-in aliases for Stage 6 string directives', () => {
    const result = compileNext(`
        ORG 0200H
name:   CSTR "A"
        PSTR "B"
        ISTR "C"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({ name: 0x0200 });
    expect(Array.from(result.bytes)).toEqual([0x41, 0x00, 0x01, 0x42, 0xc3]);
  });

  it('reports non-string operands for Stage 6 string directives', () => {
    const result = compileNext(`
        .cstr 1
        .pstr label
        .istr "A","B"
        .cstr 'A'
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: '.cstr expects one quoted string' }),
      expect.objectContaining({ message: '.pstr expects one quoted string' }),
      expect.objectContaining({ message: '.istr expects one quoted string' }),
      expect.objectContaining({ message: '.cstr expects one quoted string' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('keeps Stage 6 string directive backslash escapes literal like current AZM', () => {
    const result = compileNext(`
        .cstr "\\n"
        .pstr "\\0"
        .istr "\\""
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x6e, 0x00, 0x01, 0x30, 0xa2]);
  });

  it('assembles Stage 6 DB string fragments and string-character expressions', () => {
    const result = compileNext(`
        .org 0100H
msg:    .db "A,B",0
diff:   .db "a"-"A"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      diff: 0x0104,
      msg: 0x0100,
    });
    expect(Array.from(result.bytes)).toEqual([0x41, 0x2c, 0x42, 0x00, 0x20]);
  });

  it('assembles Stage 6 DS fill values and ALIGN padding', () => {
    const result = compileNext(`
        .org 0101H
        .db 0AAH
        .align 4
aligned:
        .db 055H
        .ds 2,0EEH
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({ aligned: 0x0104 });
    expect(Array.from(result.bytes)).toEqual([0xaa, 0x00, 0x00, 0x55, 0xee, 0xee]);
  });

  it('honors Stage 6 END while still accepting post-END binary range controls', () => {
    const result = compileNext(`
        .org 0082H
        .db 07EH
        .end
        .db 0FFH
        .binfrom 0080H
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x00, 0x00, 0x7e]);
  });

  it('treats Stage 6 BINTO as inclusive and pads through the requested range', () => {
    const result = compileNext(`
        .org 4000H
        .db 1
        .binto 4003H
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x01, 0x00, 0x00, 0x00]);
    expect(result.hexText.trim()).toBe(':0440000001000000BB\n:00000001FF');
  });

  it('places Stage 6 multiple ORG blocks by address rather than source order', () => {
    const result = compileNext(`
        .org 0100H
table:  .db 1
        .org 0000H
start:  NOP
        .binfrom 0000H
        .binto 0100H
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      start: 0x0000,
      table: 0x0100,
    });
    expect(result.bytes.length).toBe(0x101);
    expect(result.bytes[0]).toBe(0x00);
    expect(result.bytes[0x100]).toBe(0x01);
  });

  it('emits Stage 6 large selected image ranges as valid multi-record HEX', () => {
    const result = compileNext(`
        .org 4000H
        .db 1
        .binto 4100H
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.bytes.length).toBe(0x101);
    expect(result.hexText.split('\n').filter(Boolean)).toHaveLength(18);
    expect(result.hexText.startsWith(':1040000001000000000000000000000000000000AF\n')).toBe(true);
    expect(result.hexText).toContain(':0141000000BE\n');
    expect(result.hexText.endsWith(':00000001FF\n')).toBe(true);
  });

  it('trims trailing reserve-only Stage 6 DS storage from the default binary range', () => {
    const result = compileNext(`
        .org 4000H
        .db 0AAH
RAM_START:
        .ds 4
RAM_END:
        .end
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      RAM_END: 0x4005,
      RAM_START: 0x4001,
    });
    expect(Array.from(result.bytes)).toEqual([0xaa]);
  });

  it('omits uninitialized DS storage from Stage 6 HEX record grouping', () => {
    const result = compileNext(`
enum Mode Read, Write, Append
enum Count None, One, Two

SELECTED .equ Mode.Write + Count.Two

main:
        LD A,Mode.Append
        LD B,SELECTED
        LD C,Mode.Append + 1
        LD HL,(Mode.Append + 1)
TILES:
        .db Mode.Read,Mode.Write,Mode.Append
        .dw Mode.Append + 1
SCRATCH:
        .ds Count.Two
AFTER:
        .db Count.One
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.hexText.trim()).toBe(
      ':0E0000003E0206030E032A0300000102030065\n:0100100001EE\n:00000001FF',
    );
    expect(Array.from(result.bytes)).toEqual([
      0x3e, 0x02, 0x06, 0x03, 0x0e, 0x03, 0x2a, 0x03, 0x00, 0x00, 0x01, 0x02, 0x03, 0x00, 0x00,
      0x00, 0x01,
    ]);
  });

});

