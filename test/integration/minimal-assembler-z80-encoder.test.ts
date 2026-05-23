import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('minimal flat assembler z80 encoder', () => {
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
      expect.objectContaining({ message: 'sub expects imm8' }),
      expect.objectContaining({ message: 'cp expects imm8' }),
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
      expect.objectContaining({ message: 'ld (ix/iy+disp) expects disp8' }),
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
      expect.objectContaining({
        message: 'ld expects a supported register/memory/immediate transfer form',
      }),
      expect.objectContaining({
        message: 'ld expects a supported register/memory/immediate transfer form',
      }),
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
      expect.objectContaining({
        message: 'set expects two operands, or three with indexed source + reg8 destination',
      }),
      expect.objectContaining({
        message: 'rl expects one operand, or two with indexed source + reg8 destination',
      }),
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
      expect.objectContaining({ message: 'bit (ix/iy+disp) expects disp8' }),
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

});

