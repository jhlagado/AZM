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

  it('assembles the INC/DEC/PUSH/POP core-ops evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
        INC B
        INC C
        INC D
        INC E
        INC H
        INC L
        INC A
        INC BC
        INC DE
        INC HL
        INC SP
        INC IX
        INC IY
        INC (HL)
        INC IXH
        INC IXL
        INC IYH
        INC IYL
        DEC B
        DEC C
        DEC D
        DEC E
        DEC H
        DEC L
        DEC A
        DEC BC
        DEC DE
        DEC HL
        DEC SP
        DEC IX
        DEC IY
        DEC (HL)
        DEC IXH
        DEC IXL
        DEC IYH
        DEC IYL
        PUSH BC
        PUSH DE
        PUSH HL
        PUSH AF
        PUSH IX
        PUSH IY
        POP BC
        POP DE
        POP HL
        POP AF
        POP IX
        POP IY
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x04, 0x0c, 0x14, 0x1c, 0x24, 0x2c, 0x3c, 0x03, 0x13, 0x23, 0x33, 0xdd, 0x23, 0xfd, 0x23,
      0x34, 0xdd, 0x24, 0xdd, 0x2c, 0xfd, 0x24, 0xfd, 0x2c, 0x05, 0x0d, 0x15, 0x1d, 0x25, 0x2d,
      0x3d, 0x0b, 0x1b, 0x2b, 0x3b, 0xdd, 0x2b, 0xfd, 0x2b, 0x35, 0xdd, 0x25, 0xdd, 0x2d, 0xfd,
      0x25, 0xfd, 0x2d, 0xc5, 0xd5, 0xe5, 0xf5, 0xdd, 0xe5, 0xfd, 0xe5, 0xc1, 0xd1, 0xe1, 0xf1,
      0xdd, 0xe1, 0xfd, 0xe1,
    ]);
  });

  it('assembles the indexed addressing foundation evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
Disp    .equ 5
        LD A,(IX+Disp)
        LD A,(IX-128+1)
        LD C,(IY-2)
        LD (IX+0),A
        LD (IY+127),L
        LD (IX+3),$44
        ADD A,(IX+1)
        ADC A,(IY+2)
        SBC A,(IX-3)
        SUB (IY+4)
        AND (IX+5)
        OR (IY+6)
        XOR (IX+7)
        CP (IY+8)
        INC (IX+9)
        DEC (IY-10)
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xdd, 0x7e, 0x05, 0xdd, 0x7e, 0x81, 0xfd, 0x4e, 0xfe, 0xdd, 0x77, 0x00, 0xfd, 0x75, 0x7f,
      0xdd, 0x36, 0x03, 0x44, 0xdd, 0x86, 0x01, 0xfd, 0x8e, 0x02, 0xdd, 0x9e, 0xfd, 0xfd, 0x96,
      0x04, 0xdd, 0xa6, 0x05, 0xfd, 0xb6, 0x06, 0xdd, 0xae, 0x07, 0xfd, 0xbe, 0x08, 0xdd, 0x34,
      0x09, 0xfd, 0x35, 0xf6,
    ]);
  });

  it('reports indexed displacement values outside signed disp8 range', () => {
    const result = compileNext(`
        LD A,(IX+128)
        DEC (IY-129)
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'indexed displacement out of range: 128.' }),
      expect.objectContaining({ message: 'indexed displacement out of range: -129.' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('assembles the indexed LD half-register evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        LD IXH,A
        LD IXL,E
        LD A,IXH
        LD B,IXL
        LD IXH,IXL
        LD IYH,A
        LD IYL,E
        LD A,IYH
        LD B,IYL
        LD IYH,IYL
        LD IX,$1234
        LD IY,$2345
        LD SP,HL
        LD SP,IX
        LD SP,IY
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xdd, 0x67, 0xdd, 0x6b, 0xdd, 0x7c, 0xdd, 0x45, 0xdd, 0x65, 0xfd, 0x67, 0xfd, 0x6b, 0xfd,
      0x7c, 0xfd, 0x45, 0xfd, 0x65, 0xdd, 0x21, 0x34, 0x12, 0xfd, 0x21, 0x45, 0x23, 0xf9, 0xdd,
      0xf9, 0xfd, 0xf9,
    ]);
  });

  it('reports unsupported indexed LD half-register forms', () => {
    const result = compileNext(`
        LD H,IXH
        LD IXL,L
        LD IXH,IYH
        LD SP,BC
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message: 'ld with IX*/IY* does not support plain H/L counterpart operands',
      }),
      expect.objectContaining({
        message: 'ld with IX*/IY* does not support plain H/L counterpart operands',
      }),
      expect.objectContaining({
        message: 'ld between IX* and IY* byte registers is not supported',
      }),
      expect.objectContaining({ message: 'ld rr, rr supports SP <- HL/IX/IY only' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('assembles the absolute LD and I/R transfer evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        .org 0100H
Slot    .equ 0900H
Target:
        LD A,(Slot)
        LD (Slot+1),A
        LD HL,(Target)
        LD (Slot+2),HL
        LD BC,(Slot)
        LD (Slot+4),BC
        LD DE,(Slot)
        LD (Slot+6),DE
        LD SP,(Slot)
        LD (Slot+8),SP
        LD IX,(Slot)
        LD (Slot+10),IX
        LD IY,(Slot)
        LD (Slot+12),IY
        LD I,A
        LD A,I
        LD R,A
        LD A,R
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x3a, 0x00, 0x09, 0x32, 0x01, 0x09, 0x2a, 0x00, 0x01, 0x22, 0x02, 0x09, 0xed, 0x4b, 0x00,
      0x09, 0xed, 0x43, 0x04, 0x09, 0xed, 0x5b, 0x00, 0x09, 0xed, 0x53, 0x06, 0x09, 0xed, 0x7b,
      0x00, 0x09, 0xed, 0x73, 0x08, 0x09, 0xdd, 0x2a, 0x00, 0x09, 0xdd, 0x22, 0x0a, 0x09, 0xfd,
      0x2a, 0x00, 0x09, 0xfd, 0x22, 0x0c, 0x09, 0xed, 0x47, 0xed, 0x57, 0xed, 0x4f, 0xed, 0x5f,
    ]);
  });

  it('reports unsupported absolute LD and I/R transfer forms', () => {
    const result = compileNext(`
        LD (Dst),(Src)
        LD I,B
        LD B,R
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'ld does not support memory-to-memory transfers' }),
      expect.objectContaining({ message: 'unsupported LD operands: I,B' }),
      expect.objectContaining({ message: 'unsupported LD operands: B,R' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('assembles the non-indexed CB bit/rotate/shift evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        BIT 3,A
        BIT 0,B
        BIT 7,(HL)
        RES 2,(HL)
        RES 0,B
        SET 7,A
        SET 1,(HL)
        RLC B
        RRC C
        RL D
        RR E
        SLA H
        SRA (HL)
        SLL L
        SLS A
        SRL (HL)
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xcb, 0x5f, 0xcb, 0x40, 0xcb, 0x7e, 0xcb, 0x96, 0xcb, 0x80, 0xcb, 0xff, 0xcb, 0xce, 0xcb,
      0x00, 0xcb, 0x09, 0xcb, 0x12, 0xcb, 0x1b, 0xcb, 0x24, 0xcb, 0x2e, 0xcb, 0x35, 0xcb, 0x37,
      0xcb, 0x3e,
    ]);
  });

  it('reports unsupported non-indexed CB bit/rotate/shift forms', () => {
    const result = compileNext(`
        BIT 8,A
        RES -1,C
        SET 1
        RL
        RL 1
        RR (HL),A
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'bit expects bit index 0..7' }),
      expect.objectContaining({ message: 'res expects bit index 0..7' }),
      expect.objectContaining({ message: 'set expects two operands' }),
      expect.objectContaining({ message: 'rl expects one operand' }),
      expect.objectContaining({ message: 'rl expects reg8 or (hl)' }),
      expect.objectContaining({ message: 'rr two-operand form requires (ix/iy+disp) source' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('assembles the indexed CB result-copy evidence slice through the z80 encoder', () => {
    const result = compileNext(`
Disp    .equ 5
        BIT 2,(IX+Disp)
        BIT 7,(IY-2)
        SET 0,(IX+1),B
        SET 7,(IY-2),A
        RES 3,(IX+0),E
        RES 6,(IY+127),L
        SET 1,(IX+3)
        RES 4,(IY-4)
        RLC (IX+1),B
        RRC (IY+1),C
        RL (IX+1)
        RR (IY+1),E
        SLA (IX+1),H
        SRA (IY+1)
        SLL (IX+1),L
        SLS (IY+1),A
        SRL (IY+1),A
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xdd, 0xcb, 0x05, 0x56, 0xfd, 0xcb, 0xfe, 0x7e, 0xdd, 0xcb, 0x01, 0xc0, 0xfd, 0xcb, 0xfe,
      0xff, 0xdd, 0xcb, 0x00, 0x9b, 0xfd, 0xcb, 0x7f, 0xb5, 0xdd, 0xcb, 0x03, 0xce, 0xfd, 0xcb,
      0xfc, 0xa6, 0xdd, 0xcb, 0x01, 0x00, 0xfd, 0xcb, 0x01, 0x09, 0xdd, 0xcb, 0x01, 0x16, 0xfd,
      0xcb, 0x01, 0x1b, 0xdd, 0xcb, 0x01, 0x24, 0xfd, 0xcb, 0x01, 0x2e, 0xdd, 0xcb, 0x01, 0x35,
      0xfd, 0xcb, 0x01, 0x37, 0xfd, 0xcb, 0x01, 0x3f,
    ]);
  });

  it('reports unsupported indexed CB result-copy forms', () => {
    const result = compileNext(`
        BIT 1,(IX+1),A
        SET 1,(HL),A
        RES 2,(IX+0),IX
        RES 1,(IX+1),IXH
        RES 1,(IX+1),IYH
        SET 2,(IY+1),IYL
        SET 2,(IY+1),IXL
        RLC (IX+1),IXH
        RLC (IX+1),IYH
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'bit expects two operands' }),
      expect.objectContaining({
        message: 'set b,(ix/iy+disp),r requires an indexed memory source',
      }),
      expect.objectContaining({ message: 'res b,(ix/iy+disp),r expects reg8 destination' }),
      expect.objectContaining({
        message: 'res indexed destination must use plain reg8 B/C/D/E/H/L/A',
      }),
      expect.objectContaining({
        message: 'res indexed destination family must match source index base',
      }),
      expect.objectContaining({
        message: 'set indexed destination must use plain reg8 B/C/D/E/H/L/A',
      }),
      expect.objectContaining({
        message: 'set indexed destination family must match source index base',
      }),
      expect.objectContaining({
        message: 'rlc indexed destination must use plain reg8 B/C/D/E/H/L/A',
      }),
      expect.objectContaining({
        message: 'rlc indexed destination family must match source index base',
      }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('reports indexed CB displacement values outside signed disp8 range', () => {
    const result = compileNext(`
        BIT 2,(IX+128)
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'indexed displacement out of range: 128.' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('assembles the remaining ED/I/O and accumulator-rotate evidence slice through the z80 encoder', () => {
    const result = compileNext(`
Port    .equ $12
        DAA
        RLCA
        RRCA
        RLA
        RRA
        NEG
        RRD
        RLD
        LDI
        LDIR
        LDD
        LDDR
        CPI
        CPIR
        CPD
        CPDR
        INI
        INIR
        IND
        INDR
        OUTI
        OTIR
        OUTD
        OTDR
        IN (C)
        IN A,(Port)
        IN B,(C)
        OUT ($34),A
        OUT (C),B
        OUT (C),0
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0x27, 0x07, 0x0f, 0x17, 0x1f, 0xed, 0x44, 0xed, 0x67, 0xed, 0x6f, 0xed, 0xa0, 0xed, 0xb0,
      0xed, 0xa8, 0xed, 0xb8, 0xed, 0xa1, 0xed, 0xb1, 0xed, 0xa9, 0xed, 0xb9, 0xed, 0xa2, 0xed,
      0xb2, 0xed, 0xaa, 0xed, 0xba, 0xed, 0xa3, 0xed, 0xb3, 0xed, 0xab, 0xed, 0xbb, 0xed, 0x70,
      0xdb, 0x12, 0xed, 0x40, 0xd3, 0x34, 0xed, 0x41, 0xed, 0x71,
    ]);
  });

  it('reports unsupported ED/I/O and accumulator-rotate forms', () => {
    const result = compileNext(`
        DAA A
        RLCA A
        NEG A
        LDIR A
        IN
        IN A
        IN A,A
        IN B,(1)
        IN IXH,(C)
        OUT
        OUT (C)
        OUT (C),(HL)
        OUT (1),B
        OUT (C),2
        OUT (C),IXL
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'daa expects no operands' }),
      expect.objectContaining({ message: 'rlca expects no operands' }),
      expect.objectContaining({ message: 'neg expects no operands' }),
      expect.objectContaining({ message: 'ldir expects no operands' }),
      expect.objectContaining({ message: 'in expects one or two operands' }),
      expect.objectContaining({ message: 'in (c) is the only one-operand in form' }),
      expect.objectContaining({ message: 'in expects a port operand (c) or (imm8)' }),
      expect.objectContaining({
        message: 'in a,(n) immediate port form requires destination A',
      }),
      expect.objectContaining({
        message: 'in destination must use plain reg8 B/C/D/E/H/L/A',
      }),
      expect.objectContaining({ message: 'out expects two operands' }),
      expect.objectContaining({ message: 'out expects two operands' }),
      expect.objectContaining({ message: 'out expects a reg8 source' }),
      expect.objectContaining({
        message: 'out (n),a immediate port form requires source A',
      }),
      expect.objectContaining({ message: 'out (c), n immediate form supports n=0 only' }),
      expect.objectContaining({
        message: 'out source must use plain reg8 B/C/D/E/H/L/A',
      }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('reports immediate port values outside imm8 range', () => {
    const result = compileNext(`
        IN A,(256)
        OUT (300),A
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'in a,(n) expects an imm8 port number' }),
      expect.objectContaining({ message: 'out (n),a expects an imm8 port number' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('assembles the indexed 16-bit ADD and remaining EX evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        ADD IX,BC
        ADD IX,DE
        ADD IX,IX
        ADD IX,SP
        ADD IY,BC
        ADD IY,DE
        ADD IY,IY
        ADD IY,SP
        EX AF,AF' ; start saving registers
        EX AF',AF ; restore registers
        EX (SP),IX
        EX IX,(SP)
        EX (SP),IY
        EX IY,(SP)
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xdd, 0x09, 0xdd, 0x19, 0xdd, 0x29, 0xdd, 0x39, 0xfd, 0x09, 0xfd, 0x19, 0xfd, 0x29, 0xfd,
      0x39, 0x08, 0x08, 0xdd, 0xe3, 0xdd, 0xe3, 0xfd, 0xe3, 0xfd, 0xe3,
    ]);
  });

  it('reports unsupported indexed 16-bit ADD and remaining EX forms', () => {
    const result = compileNext(`
        ADD SP,BC
        ADD HL,1
        ADD IX,1
        ADD IY,A
        ADD (HL),A
        EX AF,BC
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'add expects destination A, HL, IX, or IY' }),
      expect.objectContaining({ message: 'add HL, rr expects BC/DE/HL/SP' }),
      expect.objectContaining({
        message: 'add IX, rr supports BC/DE/SP and same-index pair only',
      }),
      expect.objectContaining({
        message: 'add IY, rr supports BC/DE/SP and same-index pair only',
      }),
      expect.objectContaining({ message: 'add expects destination A, HL, IX, or IY' }),
      expect.objectContaining({
        message: 'ex supports "AF, AF\'", "DE, HL", "(SP), HL", "(SP), IX", and "(SP), IY" only',
      }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('assembles the half-index ALU evidence slice through the z80 encoder', () => {
    const result = compileNext(`
        ADD A,IXH
        ADD A,IXL
        ADD A,IYH
        ADD A,IYL
        ADC A,IXH
        ADC A,IYL
        SUB IXH
        SUB IYL
        SBC A,IXL
        AND IXH
        OR IYL
        XOR IXL
        CP IYH
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([
      0xdd, 0x84, 0xdd, 0x85, 0xfd, 0x84, 0xfd, 0x85, 0xdd, 0x8c, 0xfd, 0x8d, 0xdd, 0x94, 0xfd,
      0x95, 0xdd, 0x9d, 0xdd, 0xa4, 0xfd, 0xb5, 0xdd, 0xad, 0xfd, 0xbc,
    ]);
  });

  it('reports the final ADC/SBC malformed-form diagnostic parity cases', () => {
    const result = compileNext(`
        ADC SP,BC
        ADC IX,DE
        ADC (HL),A
        ADC HL,AF
        SBC SP,DE
        SBC IY,BC
        SBC (HL),A
        SBC HL,AF
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'adc expects destination A or HL' }),
      expect.objectContaining({ message: 'adc expects destination A or HL' }),
      expect.objectContaining({ message: 'adc expects destination A or HL' }),
      expect.objectContaining({ message: 'adc HL, rr expects BC/DE/HL/SP' }),
      expect.objectContaining({ message: 'sbc expects destination A or HL' }),
      expect.objectContaining({ message: 'sbc expects destination A or HL' }),
      expect.objectContaining({ message: 'sbc expects destination A or HL' }),
      expect.objectContaining({ message: 'sbc HL, rr expects BC/DE/HL/SP' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

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
      0x3e,
      0x02,
      0x06,
      0x03,
      0x0e,
      0x03,
      0x2a,
      0x03,
      0x00,
      0x00,
      0x01,
      0x02,
      0x03,
      0x00,
      0x00,
      0x00,
      0x01,
    ]);
  });

  it('uses Stage 7 qualified enum members as compile-time constants', () => {
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
    expect(result.symbols).toEqual(
      expect.objectContaining({
        'Count.None': 0,
        'Count.One': 1,
        'Count.Two': 2,
        'Mode.Append': 2,
        'Mode.Read': 0,
        'Mode.Write': 1,
        AFTER: 0x0010,
        SCRATCH: 0x000e,
        SELECTED: 3,
        TILES: 0x0009,
        main: 0x0000,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([
      0x3e, 0x02, 0x06, 0x03, 0x0e, 0x03, 0x2a, 0x03, 0x00, 0x00, 0x01, 0x02, 0x03, 0x00, 0x00,
      0x00, 0x01,
    ]);
  });

  it('keeps Stage 7 enum member names scoped by enum name', () => {
    const result = compileNext(`
enum PlayerState Idle, Running
enum EnemyState Idle, Chasing

        LD A,PlayerState.Idle
        LD B,EnemyState.Chasing
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x3e, 0x00, 0x06, 0x01]);
  });

  it('rejects Stage 7 unqualified enum member references', () => {
    const result = compileNext(`
enum Mode Read, Write, Append
enum Other Write, Done

BAD .equ Write
        LD A,BAD
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'Enum member "Write" must be qualified.' }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('rejects Stage 7 enum namespace collisions', () => {
    const duplicateEnum = compileNext(`
enum Mode Read
enum Mode Write
`);

    expect(duplicateEnum.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate enum name: Mode' }),
    ]);

    const enumEquateCollision = compileNext(`
enum Mode Read
Mode .equ 7
`);

    expect(enumEquateCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate symbol: Mode' }),
    ]);

    const duplicateMember = compileNext(`
enum Mode Read, Read
`);

    expect(duplicateMember.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate enum member name: Read' }),
    ]);

    const caseOnlyCollisions = compileNext(`
enum Mode Read
enum mode Write
mode_label:
mode .equ 7
enum Other Read, read
`);

    expect(caseOnlyCollisions.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate enum name: mode' }),
      expect.objectContaining({ message: 'duplicate symbol: mode' }),
      expect.objectContaining({ message: 'duplicate enum member name: read' }),
    ]);
  });

  it('uses Stage 7 record layout sizes and direct field offsets as constants', () => {
    const result = compileNext(`
.type Sprite
x       .field 1
y       .field 1
timer   .word
ptr     .addr
blob    .field 3
.endtype

SIZE    .equ sizeof(Sprite)
PTR     .equ offset(Sprite, ptr)
BLOB    .equ offset(Sprite, blob)
SCALARS .equ sizeof(byte) + sizeof(word) + sizeof(addr)

main:
        LD HL,SIZE
        LD DE,PTR
        LD BC,BLOB
        LD A,SCALARS
        .db SIZE,PTR,BLOB,SCALARS
        .dw SIZE
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(
      expect.objectContaining({
        BLOB: 6,
        PTR: 4,
        SCALARS: 5,
        SIZE: 9,
        main: 0,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([
      0x21, 0x09, 0x00, 0x11, 0x04, 0x00, 0x01, 0x06, 0x00, 0x3e, 0x05, 0x09, 0x04, 0x06, 0x05,
      0x09, 0x00,
    ]);
  });

  it('does not let Stage 7 type declarations emit bytes or move labels', () => {
    const result = compileNext(`
before:
.type Point
x .byte
y .word
.endtype
after:
        .db sizeof(Point),offset(Point,y)
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(
      expect.objectContaining({
        after: 0,
        before: 0,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([0x03, 0x01]);
  });

  it('uses Stage 7 scalar and named .field layouts as constants', () => {
    const result = compileNext(`
.type Pair
left    .field byte
right   .field addr
.endtype

.type Actor
tile    .byte
pair    .field Pair
timer   .field word
.endtype

PAIR_SIZE    .equ sizeof(Pair)
ACTOR_SIZE   .equ sizeof(Actor)
PAIR_OFFSET  .equ offset(Actor, pair)
RIGHT_OFFSET .equ offset(Actor, pair.right)

main:
        .db PAIR_SIZE,ACTOR_SIZE,PAIR_OFFSET,RIGHT_OFFSET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(
      expect.objectContaining({
        ACTOR_SIZE: 6,
        PAIR_OFFSET: 1,
        PAIR_SIZE: 3,
        RIGHT_OFFSET: 2,
        main: 0,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([0x03, 0x06, 0x01, 0x02]);
  });

  it('uses Stage 7 union layout sizes and nested zero-offset field paths', () => {
    const result = compileNext(`
.type Pair
left    .byte
right   .byte
.endtype

.union Cell
raw     .word
pair    .field Pair
tag     .byte
.endunion

CELL_SIZE    .equ sizeof(Cell)
RAW_OFFSET   .equ offset(Cell, raw)
TAG_OFFSET   .equ offset(Cell, tag)
RIGHT_OFFSET .equ offset(Cell, pair.right)

main:
        .db CELL_SIZE,RAW_OFFSET,TAG_OFFSET,RIGHT_OFFSET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(
      expect.objectContaining({
        CELL_SIZE: 2,
        RAW_OFFSET: 0,
        RIGHT_OFFSET: 1,
        TAG_OFFSET: 0,
        main: 0,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([0x02, 0x00, 0x00, 0x01]);
  });

  it('does not let Stage 7 union declarations emit bytes or move labels', () => {
    const result = compileNext(`
before:
.union View
b .byte
w .word
.endunion
after:
        .db sizeof(View),offset(View,w)
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(
      expect.objectContaining({
        after: 0,
        before: 0,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([0x02, 0x00]);
  });

  it('diagnoses invalid named fields even when only direct offsets use them', () => {
    const selfRecursive = compileNext(`
.type Node
next .field Node
.endtype

BAD .equ offset(Node,next)
`);

    expect(selfRecursive.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'Self-referential field type "Node" has no finite size; use .addr for a pointer field.',
      }),
    ]);

    const mutualRecursive = compileNext(`
.type A
b .field B
.endtype

.type B
a .field A
.endtype

BAD .equ offset(A,b)
`);

    expect(mutualRecursive.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'recursive type: A' })]),
    );

    const unknownNamedType = compileNext(`
.type Holder
missing .field Missing
.endtype

BAD .equ offset(Holder,missing)
`);

    expect(unknownNamedType.diagnostics).toEqual([
      expect.objectContaining({ message: 'unknown type: Missing' }),
    ]);
  });

  it('uses Stage 7 array TypeExpr sizes in sizeof, .field, and offset paths', () => {
    const result = compileNext(`
.type Tri
a       .byte
b       .byte
c       .byte
.endtype

.type Row
cells   .field Tri[4]
tail    .byte
.endtype

TRI_ARRAY .equ sizeof(Tri[4])
THIRD_C   .equ offset(Tri[4], [2].c)
TAIL      .equ offset(Row, tail)

main:
        .db TRI_ARRAY,THIRD_C,TAIL
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(
      expect.objectContaining({
        TAIL: 12,
        THIRD_C: 8,
        TRI_ARRAY: 12,
        main: 0,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([0x0c, 0x08, 0x0c]);
  });

  it('uses Stage 7 TypeExpr shorthand as .ds allocation size', () => {
    const result = compileNext(`
.type Sprite
x       .byte
y       .byte
flags   .byte
.endtype

OneByte:
        .ds byte,$10
Bytes:
        .ds byte[4],$11
OneWord:
        .ds word,$20
Words:
        .ds word[3],$22
OneSprite:
        .ds Sprite,$30
Sprites:
        .ds Sprite[2],$33
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(
      expect.objectContaining({
        Bytes: 1,
        OneByte: 0,
        OneSprite: 13,
        OneWord: 5,
        Sprites: 16,
        Words: 7,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([
      0x10, 0x11, 0x11, 0x11, 0x11, 0x20, 0x20, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x30, 0x30,
      0x30, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
    ]);
  });

  it('folds Stage 7 layout casts to constant instruction addresses', () => {
    const result = compileNext(`
.type Pos
x .byte
y .byte
.endtype

.type Sprite
tile  .byte
pos   .field Pos
flags .byte
.endtype

BASE    .equ 2
SPRITES .equ $2000

main:
        LD HL,<Sprite[16]>SPRITES[BASE + 1].flags
        LD A,(<Sprite[16]>SPRITES[3].flags)
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x21, 0x0f, 0x20, 0x3a, 0x0f, 0x20]);
  });

  it('folds Stage 7 layout casts through array fields', () => {
    const result = compileNext(`
.type Pos
x .byte
y .byte
.endtype

.type Sprite
tile .byte
pos  .field Pos
.endtype

.type World
header  .word
sprites .field Sprite[8]
.endtype

BASE .equ 2
GAME .equ $2000

main:
        LD HL,<World>GAME.sprites[BASE + 1].pos.x
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x21, 0x0c, 0x20]);
  });

  it('uses Stage 7 layout terms inside larger constant expressions', () => {
    const result = compileNext(`
.type Tri
a .byte
b .byte
c .byte
.endtype

BASE .equ $2000

main:
        .db sizeof(Tri[4]) + 1
        .db offset(Tri[4], [2].c) + 1
        LD HL,<Tri[4]>BASE[2].c + 1
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x0d, 0x09, 0x21, 0x09, 0x20]);
  });

  it('rejects Stage 7 layout casts without an explicit path', () => {
    const result = compileNext(`
.type Sprite
x .byte
.endtype

BASE .equ $2000

main:
        LD HL,<Sprite>BASE
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'invalid LD operands: HL,<Sprite>BASE' }),
    ]);
  });

  it('parses quoted byte constants inside Stage 7 layout-cast indexes', () => {
    const result = compileNext(`
.type Tri
a .byte
.endtype

BASE .equ $2000

main:
        LD HL,<Tri[256]>BASE[']'].a
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x21, 0x5d, 0x20]);
  });

  it('reports Stage 8 layout declaration diagnostics at declaration time', () => {
    const unionField = compileNext(`
.union View
bad .field @Node
.endunion
`);

    expect(unionField.diagnostics).toEqual([
      expect.objectContaining({ message: 'invalid .union field declaration' }),
    ]);

    const selfRecursive = compileNext(`
.type Node
next .field Node
value .byte
.endtype
`);

    expect(selfRecursive.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'Self-referential field type "Node" has no finite size; use .addr for a pointer field.',
      }),
    ]);

    const unknownFieldType = compileNext(`
.type Holder
missing .field Missing
.endtype
`);

    expect(unknownFieldType.diagnostics).toEqual([
      expect.objectContaining({ message: 'unknown type: Missing' }),
    ]);

    const independentUnknowns = compileNext(`
.type A
x .field MissingA
.endtype

.type B
y .field MissingB
.endtype
`);

    expect(independentUnknowns.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'unknown type: MissingA' }),
        expect.objectContaining({ message: 'unknown type: MissingB' }),
      ]),
    );
  });

  it('reports Stage 8 runtime register indexes in layout casts clearly', () => {
    const result = compileNext(`
.type Sprite
x .byte
.endtype

SPRITES .equ $2000

main:
        LD HL,<Sprite[16]>SPRITES[HL].x
        LD DE,<Sprite[16]>SPRITES[HL + 1].x
        LD BC,<Sprite[16]>SPRITES[~HL].x
        LD SP,<Sprite[16]>SPRITES[I].x
        LD IX,<Sprite[16]>SPRITES[IXH].x
`);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'runtime register index "HL" is not supported in layout casts',
        }),
        expect.objectContaining({
          message: 'runtime register index "I" is not supported in layout casts',
        }),
        expect.objectContaining({
          message: 'runtime register index "IXH" is not supported in layout casts',
        }),
      ]),
    );
    expect(result.diagnostics).toHaveLength(5);
  });

  it('expands Stage 9 zero-operand ops into visible assembly', () => {
    const result = compileNext(`
op clear_a()
        xor a
end

main:
        ld a,$55
        clear_a
        ret
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({ main: 0 });
    expect(Array.from(result.bytes)).toEqual([0x3e, 0x55, 0xaf, 0xc9]);
  });

  it('does not let Stage 9 op declarations emit bytes or move labels', () => {
    const result = compileNext(`
before:
op clear_a()
        xor a
end
after:
        .db 1
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(
      expect.objectContaining({
        after: 0,
        before: 0,
      }),
    );
    expect(Array.from(result.bytes)).toEqual([0x01]);
  });

  it('expands Stage 9 zero-operand ops after declaration prescan', () => {
    const result = compileNext(`
main:
        clear_a
        ret

op clear_a()
        xor a
end
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({ main: 0 });
    expect(Array.from(result.bytes)).toEqual([0xaf, 0xc9]);
  });

  it('keeps Stage 9 op names case-sensitive', () => {
    const result = compileNext(`
op ClearA()
        xor a
end

main:
        cleara
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'unsupported source line: cleara' }),
    ]);
  });

  it('keeps top-level END alias precedence over Stage 9 op names', () => {
    const result = compileNext(`
op END()
        xor a
end

main:
        .db 1
        END
        .db 2
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x01]);
  });

  it('does not prescan Stage 9 op declarations after top-level .end', () => {
    const result = compileNext(`
main:
        clear_a
        .end

op clear_a()
        xor a
end
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'unsupported source line: clear_a' }),
    ]);
  });

  it('expands Stage 9 parameterized reg8 ops with AST operand substitution', () => {
    const result = compileNext(`
op clear(dst reg8)
        xor dst
end

main:
        clear b
        clear a
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0xa8, 0xaf]);
  });

  it('selects fixed-token Stage 9 op overloads before reg8 overloads', () => {
    const result = compileNext(`
op clear(dst reg8)
        ld dst,0
end

op clear(dst A)
        xor a
end

main:
        clear b
        clear a
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x06, 0x00, 0xaf]);
  });

  it('reports Stage 9 parameterized op arity mismatches', () => {
    const result = compileNext(`
op clear(dst reg8)
        xor dst
end

main:
        clear a,b
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'No op overload of "clear" accepts 2 operand(s). available overloads: clear(dst reg8)',
      }),
    ]);
  });

  it('reports Stage 9 parameterized op no-match diagnostics', () => {
    const result = compileNext(`
op clear(dst A)
        xor a
end

main:
        clear b
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'No matching op overload for "clear"; call-site operands: (B); available overloads: clear(dst A); dst: expects A, got B',
      }),
    ]);
  });

  it('reports ambiguous Stage 9 parameterized op overloads', () => {
    const result = compileNext(`
op choose(dst A, src reg8)
        ld dst,src
end

op choose(dst reg8, src B)
        ld dst,src
end

main:
        choose a,b
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'Ambiguous op overload for "choose"; equally specific candidates: choose(dst A, src reg8), choose(dst reg8, src B)',
      }),
    ]);
  });

  it('matches Stage 9 imm8 op arguments backed by equate symbols', () => {
    const result = compileNext(`
VALUE .equ $44

op load_a(value imm8)
        ld a,value
end

main:
        load_a VALUE
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x3e, 0x44]);
  });

  it('preserves literal (HL) operands in Stage 9 LD substitution', () => {
    const result = compileNext(`
op store_hl(src reg8)
        ld (hl),src
end

op load_hl(dst reg8)
        ld dst,(hl)
end

main:
        store_hl a
        load_hl b
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x77, 0x46]);
  });

  it('expands Stage 9 explicit-accumulator ALU templates', () => {
    const result = compileNext(`
op add_to_a(value imm8)
        add a,value
end

main:
        add_to_a 5
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0xc6, 0x05]);
  });

  it('matches Stage 9 reg16 and fixed-token reg16 overloads', () => {
    const result = compileNext(`
op choose(dst HL, src reg16)
        add dst,src
end

op choose(dst reg16, src BC)
        nop
end

main:
        choose hl,de
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x19]);
  });

  it('reports Stage 9 ambiguous reg16 fixed-token overloads', () => {
    const result = compileNext(`
op choose(dst HL, src reg16)
        nop
end

op choose(dst reg16, src BC)
        nop
end

main:
        choose HL,BC
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'Ambiguous op overload for "choose"; equally specific candidates: choose(dst HL, src reg16), choose(dst reg16, src BC)',
      }),
    ]);
  });

  it('expands nested Stage 9 ops and substitutes through immediate ports', () => {
    const result = compileNext(`
PORT_RED .equ $06

op out_from_hl(p imm8)
        ld a,(hl)
        out (p),a
        inc hl
end

op twice(p imm8)
        out_from_hl p
        out_from_hl p
end

main:
        twice PORT_RED
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x7e, 0xd3, 0x06, 0x23, 0x7e, 0xd3, 0x06, 0x23]);
  });

  it('renames Stage 9 op-local labels per invocation', () => {
    const result = compileNext(`
op skip_a()
loop:
        jr loop
end

main:
        skip_a
        skip_a
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).not.toHaveProperty('loop');
    expect(
      Object.keys(result.symbols).filter((name) => name.includes('__azm_op_skip_a_loop')),
    ).toHaveLength(2);
    expect(Array.from(result.bytes)).toEqual([0x18, 0xfe, 0x18, 0xfe]);
  });

  it('renames Stage 9 op-local labels across nested op expansion', () => {
    const result = compileNext(`
op inner_loop()
i_loop:
        jr i_loop
end

op invoke_twice()
        inner_loop
        nop
end

main:
        invoke_twice
        invoke_twice
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).not.toHaveProperty('loop');
    expect(result.symbols).not.toHaveProperty('i_loop');
    expect(Array.from(result.bytes)).toEqual([0x18, 0xfe, 0x00, 0x18, 0xfe, 0x00]);
  });

  it('handles dot-prefixed local labels inside Stage 9 ops without symbol leakage', () => {
    const result = compileNext(`
op local_alias()
.loop:
        ld a,1
        ld a,2
        .loop2:
        ld a,3
        nop
end

main:
        local_alias
        local_alias
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).not.toHaveProperty('.loop');
    expect(
      Object.keys(result.symbols).filter((name) => name.includes('__azm_op_local_alias')),
    ).toHaveLength(4);
    expect(Array.from(result.bytes)).toEqual([
      0x3e, 0x01, 0x3e, 0x02, 0x3e, 0x03, 0x00, 0x3e, 0x01, 0x3e, 0x02, 0x3e, 0x03, 0x00,
    ]);
  });

  it('reports Stage 9 op expansion cycles', () => {
    const result = compileNext(`
op first()
        second
end

op second()
        first
end

main:
        first
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'Cyclic op expansion detected for "first". expansion chain: first -> second -> first',
      }),
    ]);
  });

  it('reports Stage 9 invalid expanded instructions with call-site context', () => {
    const result = compileNext(`
op clobber_a_with(src reg16)
        ld A,src
end

main:
        clobber_a_with SP
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'Invalid op expansion in "clobber_a_with"; expanded instruction: ld A, SP; expansion chain: clobber_a_with',
      }),
    ]);
  });

  it('matches Stage 9 imm16 and condition-code operands', () => {
    const result = compileNext(`
target .equ $1234

op jump_if(cond cc, dest imm16)
        jp cond,dest
end

main:
        jump_if nz,target
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0xc2, 0x34, 0x12]);
  });

  it('matches Stage 9 mem8 and indexed-memory operands', () => {
    const result = compileNext(`
op load_a(src mem8)
        ld a,src
end

main:
        load_a (hl)
        load_a (ix+1)
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x7e, 0xdd, 0x7e, 0x01]);
  });

  it('selects fixed condition-token Stage 9 overloads before cc overloads', () => {
    const result = compileNext(`
op jump(cond cc, dest imm16)
        jp cond,dest
end

op jump(cond NZ, dest imm16)
        jr cond,dest
end

main:
        jump nz,target
        nop
target:
        nop
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x20, 0x01, 0x00, 0x00]);
  });

  it('selects Stage 9 imm8 overloads before imm16 overloads for byte values', () => {
    const result = compileNext(`
op load_value(value imm16)
        ld hl,value
end

op load_value(value imm8)
        ld a,value
end

main:
        load_value 7
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x3e, 0x07]);
  });

  it('substitutes Stage 9 ea parameters into parenthesized memory operands', () => {
    const result = compileNext(`
op load_from(dst reg8, src ea)
        ld dst,(src)
end

main:
        load_from a,$4000
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x3a, 0x00, 0x40]);
  });

  it('substitutes Stage 9 idx16 parameters into INC and DEC templates', () => {
    const result = compileNext(`
op bump(ptr idx16)
        inc ptr
        dec ptr
end

main:
        bump (ix+1)
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0xdd, 0x34, 0x01, 0xdd, 0x35, 0x01]);
  });

  it('rejects Stage 7 type-name namespace collisions', () => {
    const typeEquateCollision = compileNext(`
.type Point
x .byte
.endtype
point .equ 7
`);

    expect(typeEquateCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate symbol: point' }),
    ]);

    const typeLabelCollision = compileNext(`
.type Point
x .byte
.endtype
point:
`);

    expect(typeLabelCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate symbol: point' }),
    ]);

    const typeEnumCollision = compileNext(`
.type Mode
x .byte
.endtype
enum mode Read
`);

    expect(typeEnumCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate enum name: mode' }),
    ]);

    const enumTypeCollision = compileNext(`
enum mode Read
.type Mode
x .byte
.endtype
`);

    expect(enumTypeCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate type name: Mode' }),
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
