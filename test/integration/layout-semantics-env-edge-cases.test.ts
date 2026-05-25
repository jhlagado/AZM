import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('layout semantics env edge cases', () => {
  it('reports modulo by zero in equates', () => {
    const result = compileNext(`
Bad .equ 1 % 0
`);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ message: 'modulo by zero in expression' }),
    );
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('propagates sizeof unknown type errors', () => {
    const result = compileNext(`
Sz .equ sizeof(Nope)
`);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ message: 'unknown type: Nope' }),
    );
  });

  it('propagates offset unknown field errors', () => {
    const result = compileNext(`
R .type
x .byte
y .byte
.endtype

o .equ offset(R, z)
`);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: 'unknown field "z" in type R',
      }),
    );
  });

  it('treats an empty record type as zero bytes', () => {
    const result = compileNext(`
Empty .type
.endtype

Sz .equ sizeof(Empty)
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual(expect.objectContaining({ Sz: 0 }));
  });

  it('rejects runtime register indexes in layout-cast address expressions', () => {
    const result = compileNext(`
Sprite .type
x     .byte
y     .byte
tile  .byte
flags .byte
.endtype

SPRITES .equ $2000

main:
        LD HL,<Sprite[16]>SPRITES[HL].flags
`);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: 'runtime register index "HL" is not supported in layout casts',
      }),
    );
  });

  it('resolves forward references between assembler equates', () => {
    const result = compileNext(`
first .equ second
second .equ 1
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      first: 1,
      second: 1,
    });
  });

  it('reports mutually referential equates as recursive symbols', () => {
    const result = compileNext(`
a .equ b
b .equ a
`);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'recursive symbol: a' }),
        expect.objectContaining({ message: 'recursive symbol: b' }),
      ]),
    );
    expect(result.symbols).not.toHaveProperty('a');
    expect(result.symbols).not.toHaveProperty('b');
  });
});
