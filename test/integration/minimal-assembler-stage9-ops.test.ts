import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('minimal flat assembler stage 9 ops', () => {
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
          'No op overload of "clear" accepts 2 operand(s).\navailable overloads:\n  - clear(dst reg8)',
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
        message: expect.stringContaining('No matching op overload for "clear" with provided operands.'),
      }),
    ]);
    expect(result.diagnostics[0]?.message).toContain('call-site operands: (B)');
    expect(result.diagnostics[0]?.message).toContain('available overloads:');
    expect(result.diagnostics[0]?.message).toContain('clear(dst A) (<memory>:2) ; dst: expects A, got B');
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
        message: expect.stringContaining('Ambiguous op overload for "choose" (2 matches).'),
      }),
    ]);
    expect(result.diagnostics[0]?.message).toContain('call-site operands: (A, B)');
    expect(result.diagnostics[0]?.message).toContain('equally specific candidates:');
    expect(result.diagnostics[0]?.message).toContain('choose(dst A, src reg8) (<memory>:2)');
    expect(result.diagnostics[0]?.message).toContain('choose(dst reg8, src B) (<memory>:6)');
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

    const message = result.diagnostics[0]?.message ?? '';
    expect(result.diagnostics).toHaveLength(1);
    expect(message).toContain('Ambiguous op overload for "choose" (2 matches).');
    expect(message).toContain('call-site operands: (HL, BC)');
    expect(message).toContain('equally specific candidates:');
    expect(message).toContain('choose(dst HL, src reg16) (<memory>:2)');
    expect(message).toContain('choose(dst reg16, src BC) (<memory>:6)');
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
        message: expect.stringContaining('Cyclic op expansion detected for "first".'),
      }),
    ]);
    expect(result.diagnostics[0]?.message).toContain(
      'expansion chain: first (<memory>:2) -> second (<memory>:6) -> first (<memory>:2)',
    );
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
        message: 'ld expects a supported register/memory/immediate transfer form',
      }),
      expect.objectContaining({
        message: [
          'Invalid op expansion in "clobber_a_with" at call site.',
          'expanded instruction: ld A, SP',
          'op definition: <memory>:2',
          'expansion chain: clobber_a_with (<memory>:2)',
        ].join('\n'),
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

});

