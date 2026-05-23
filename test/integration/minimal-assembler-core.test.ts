import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('minimal flat assembler core', () => {
  it('assembles canonical .org, .equ, label, LD A,n, and RET', () => {
    const result = compileNext(`
        .org 0100H
VALUE   .equ 42
START:
        LD A,VALUE
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      START: 0x0100,
      VALUE: 42,
    });
    expect(Array.from(result.bytes)).toEqual([0x3e, 0x2a, 0xc9]);
    expect(result.hexText.trim()).toBe(':030100003E2AC9CB\n:00000001FF');
  });

  it('assembles canonical .db, .dw, .ds, NOP, and numeric immediates', () => {
    const result = compileNext(`
        .org 0200H
START:
        NOP
        .db 1,2
        .dw 1234H
        .ds 2
        LD A,0x7F
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({ START: 0x0200 });
    expect(Array.from(result.bytes)).toEqual([
      0x00, 0x01, 0x02, 0x34, 0x12, 0x00, 0x00, 0x3e, 0x7f, 0xc9,
    ]);
  });

  it('normalizes built-in directive aliases before canonical parsing', () => {
    const result = compileNext(`
        ORG 0100H
VALUE   EQU 42
START:
        DB VALUE
        DW START
        DS 1
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      START: 0x0100,
      VALUE: 42,
    });
    expect(Array.from(result.bytes)).toEqual([0x2a, 0x00, 0x01]);
  });

  it('assembles label plus statement on the same source line', () => {
    const result = compileNext(`
        .org 8000H
result: .db 0
alias:  DB 1
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      alias: 0x8001,
      result: 0x8000,
    });
    expect(Array.from(result.bytes)).toEqual([0x00, 0x01]);
  });

  it('keeps symbols case-sensitive while accepting mixed-case machine vocabulary', () => {
    const result = compileNext(`
        .OrG 0100H
Value   .eQu 1
VALUE   .equ 2
start:
        lD A,Value
        rEt
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      VALUE: 2,
      Value: 1,
      start: 0x0100,
    });
    expect(Array.from(result.bytes)).toEqual([0x3e, 0x01, 0xc9]);
  });

});

