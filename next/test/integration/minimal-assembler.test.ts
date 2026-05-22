import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('minimal flat assembler', () => {
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
    expect(Array.from(result.bytes)).toEqual([0x2a, 0x00, 0x01, 0x00]);
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

  it('assembles the first evidence-backed LD slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
buf     .equ 4000H
        LD B,2
        LD C,A
        LD HL,buf
        LD A,(HL)
        LD (HL),A
        LD A,(BC)
        LD (DE),A
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x06, 0x02, 0x4f, 0x21, 0x00, 0x40, 0x7e, 0x77, 0x0a, 0x12, 0xc9,
    ]);
  });

  it('assembles the first evidence-backed ALU slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
        LD B,2
        LD A,5
        SUB A,B
        SUB 1
        AND $F0
        OR A
        XOR $55
        CP (HL)
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x06, 0x02, 0x3e, 0x05, 0x90, 0xd6, 0x01, 0xe6, 0xf0, 0xb7, 0xee, 0x55, 0xbe, 0xc9,
    ]);
  });

  it('accepts signed imm8 ALU operands and reports out-of-range values', () => {
    const signed = compileNext('CP -1');

    expect(signed.diagnostics).toEqual([]);
    expect(Array.from(signed.bytes)).toEqual([0xfe, 0xff]);

    const result = compileNext(`
        SUB $100
        CP -129
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: '8-bit value out of range: 256.' }),
      expect.objectContaining({ message: '8-bit value out of range: -129.' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('assembles the ADD/ADC/SBC accumulator evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
        ADD A,B
        ADD A,$7F
        ADD A,(HL)
        ADC A,C
        ADC A,$01
        ADC A,(HL)
        SBC A,E
        SBC A,$03
        SBC A,(HL)
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x80, 0xc6, 0x7f, 0x86, 0x89, 0xce, 0x01, 0x8e, 0x9b, 0xde, 0x03, 0x9e, 0xc9,
    ]);
  });

  it('assembles the 16-bit HL arithmetic evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
        ADD HL,BC
        ADD HL,DE
        ADD HL,HL
        ADD HL,SP
        ADC HL,BC
        ADC HL,DE
        ADC HL,HL
        ADC HL,SP
        SBC HL,BC
        SBC HL,DE
        SBC HL,HL
        SBC HL,SP
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x09, 0x19, 0x29, 0x39, 0xed, 0x4a, 0xed, 0x5a, 0xed, 0x6a, 0xed, 0x7a, 0xed, 0x42, 0xed,
      0x52, 0xed, 0x62, 0xed, 0x72, 0xc9,
    ]);
  });

  it('assembles the first core-ops evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
        DI
        EI
        SCF
        CCF
        CPL
        EX DE,HL
        EX (SP),HL
        EXX
        HALT
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xf3, 0xfb, 0x37, 0x3f, 0x2f, 0xeb, 0xe3, 0xd9, 0x76,
    ]);
  });

  it('assembles the IM/RST interrupt-state evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
        IM 0
        IM 1
        IM 2
        RST 0
        RST 8
        RST 16
        RST 24
        RST 32
        RST 40
        RST 48
        RST 56
        RETI
        RETN
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xed, 0x46, 0xed, 0x56, 0xed, 0x5e, 0xc7, 0xcf, 0xd7, 0xdf, 0xe7, 0xef, 0xf7, 0xff, 0xed,
      0x4d, 0xed, 0x45,
    ]);
  });

  it('assembles the conditional control-flow and indirect JP evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
target:
        RET NZ
        RET Z
        RET NC
        RET C
        RET PO
        RET PE
        RET P
        RET M
        JP NZ,target
        JP Z,target
        JP NC,target
        JP C,target
        JP PO,target
        JP PE,target
        JP P,target
        JP M,target
        CALL NZ,target
        CALL Z,target
        CALL NC,target
        CALL C,target
        CALL PO,target
        CALL PE,target
        CALL P,target
        CALL M,target
        JP (HL)
        JP (IX)
        JP (IY)
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xc0, 0xc8, 0xd0, 0xd8, 0xe0, 0xe8, 0xf0, 0xf8, 0xc2, 0x00, 0x01, 0xca, 0x00, 0x01, 0xd2,
      0x00, 0x01, 0xda, 0x00, 0x01, 0xe2, 0x00, 0x01, 0xea, 0x00, 0x01, 0xf2, 0x00, 0x01, 0xfa,
      0x00, 0x01, 0xc4, 0x00, 0x01, 0xcc, 0x00, 0x01, 0xd4, 0x00, 0x01, 0xdc, 0x00, 0x01, 0xe4,
      0x00, 0x01, 0xec, 0x00, 0x01, 0xf4, 0x00, 0x01, 0xfc, 0x00, 0x01, 0xe9, 0xdd, 0xe9, 0xfd,
      0xe9,
    ]);
  });

  it('reports unsupported source lines as diagnostics', () => {
    const result = compileNext('UNKNOWN');

    expect(result.diagnostics).toEqual([
      {
        code: 'AZMN_PARSE',
        column: 1,
        line: 1,
        message: 'unsupported source line: UNKNOWN',
        severity: 'error',
        sourceName: '<memory>',
      },
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });
});
