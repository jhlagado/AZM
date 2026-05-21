import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('Stage 4 expression and deferred symbol slice', () => {
  it('evaluates arithmetic expressions in data and instructions', () => {
    const result = compileNext(`
        .org $0100
BASE    .equ $20
MASK    .equ ~1 & 0xff
START:
        .db BASE + 1, "a" - "A", MASK
        .dw START + 3
        LD A,(1 << 5) + 2
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      BASE: 0x20,
      MASK: 0xfe,
      START: 0x0100,
    });
    expect(Array.from(result.bytes)).toEqual([0x21, 0x20, 0xfe, 0x03, 0x01, 0x3e, 0x22, 0xc9]);
  });

  it('resolves forward equates and labels in byte and word data', () => {
    const result = compileNext(`
        .org 4000H
ALIAS   .equ TARGET
PLUS    .equ ALIAS + 1
        .db ALIAS
        .dw PLUS
TARGET:
        .db 0AAH
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      ALIAS: 0x4003,
      PLUS: 0x4004,
      TARGET: 0x4003,
    });
    expect(Array.from(result.bytes)).toEqual([0x03, 0x04, 0x40, 0xaa]);
  });

  it('resolves forward equates in .org and .ds address planning', () => {
    const result = compileNext(`
        .org BASE
START:
        .ds SIZE
NEXT:
        RET
BASE    .equ 4000H
SIZE    .equ 2
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      BASE: 0x4000,
      NEXT: 0x4002,
      SIZE: 2,
      START: 0x4000,
    });
    expect(Array.from(result.bytes)).toEqual([0x00, 0x00, 0xc9]);
    expect(result.hexText.trim()).toBe(':034000000000C9F4\n:00000001FF');
  });

  it('treats colon-label .equ as an equate, not an address label', () => {
    const result = compileNext(`
        .org 0100H
BUF:    .equ 0900H
        .dw BUF
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({ BUF: 0x0900 });
    expect(Array.from(result.bytes)).toEqual([0x00, 0x09]);
  });

  it('keeps comments and value splitting quote-aware for quoted byte expressions', () => {
    const result = compileNext(`
        .org 0100H
        .db ';', ',', 1 ; real comment
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x3b, 0x2c, 0x01]);
  });

  it('preserves current-location context for deferred equates', () => {
    const result = compileNext(`
        .org 4000H
HERE    .equ $
ALIAS   .equ TARGET + ($ - HERE)
        .dw ALIAS
TARGET:
        .db 0
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      ALIAS: 0x4002,
      HERE: 0x4000,
      TARGET: 0x4002,
    });
    expect(Array.from(result.bytes)).toEqual([0x02, 0x40, 0x00]);
  });

  it('reports divide by zero', () => {
    const result = compileNext(`
        .org 0100H
BAD     .equ 1 / 0
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'divide by zero in expression' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('reports unknown symbols', () => {
    const result = compileNext(`
        .org 0100H
        .db MISSING
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'unknown symbol: MISSING' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });
});
