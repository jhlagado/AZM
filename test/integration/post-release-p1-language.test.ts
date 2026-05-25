import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('post-release P1 language tightening', () => {
  it('rejects case-varied dotted canonical directives while keeping undotted aliases', () => {
    const uppercaseDotted = compileNext('.ORG $100\n.db $11\n');
    expect(uppercaseDotted.diagnostics).toEqual([
      expect.objectContaining({ message: 'unsupported source line: .ORG $100' }),
    ]);

    const undottedAlias = compileNext('ORG $100\n.db $22\n');
    expect(undottedAlias.diagnostics).toEqual([]);
    expect(Array.from(undottedAlias.bytes)).toEqual([0x22]);
  });

  it('rejects case-varied AZM function names', () => {
    const sizeofUpper = compileNext('.db SIZEOF(byte)\n');
    expect(sizeofUpper.diagnostics).toEqual([
      expect.objectContaining({ message: 'invalid .db value list' }),
    ]);

    const offsetUpper = compileNext(`
.type Pair
left .byte
right .byte
.endtype

.db OFFSET(Pair,right)
`);
    expect(offsetUpper.diagnostics).toEqual([
      expect.objectContaining({ message: 'invalid .db value list' }),
    ]);
  });

  it('uses .type aliases as transparent layout type expressions', () => {
    const result = compileNext(`
.type Sprite
x    .byte
y    .byte
tile .byte
flags .byte
.endtype

.type SpriteArray = Sprite[4]

BASE .equ $2000
        .db sizeof(SpriteArray)
        .db offset(SpriteArray, [2].tile)
        LD HL,<SpriteArray>BASE[3].flags
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x10, 0x0a, 0x21, 0x0f, 0x20]);
  });

  it('supports scalar and nested layout type aliases', () => {
    const result = compileNext(`
.type Bytes = byte[4]
.type MoreBytes = Bytes[2]

        .db sizeof(Bytes)
        .db offset(Bytes, [3])
        .db sizeof(MoreBytes)
        .db offset(MoreBytes, [6])
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x04, 0x03, 0x08, 0x06]);
  });

  it('diagnoses recursive layout aliases', () => {
    const result = compileNext(`
.type A = B
.type B = A

        .db sizeof(A)
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'recursive type: A' }),
    ]));
  });
});
