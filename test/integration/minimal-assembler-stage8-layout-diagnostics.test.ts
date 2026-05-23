import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('minimal flat assembler stage 8 layout diagnostics', () => {
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

});

