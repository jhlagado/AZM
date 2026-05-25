import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

function byteArray(source: string): number[] {
  const result = compileNext(source);
  expect(result.diagnostics).toEqual([]);
  return Array.from(result.bytes);
}

describe('native name-left declaration syntax', () => {
  it('supports name-left enum declarations', () => {
    const result = compileNext(`
Colour .enum Red, Green, Blue
        .db Colour.Red, Colour.Green, Colour.Blue
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0, 1, 2]);
  });

  it('supports name-left type bodies', () => {
    expect(
      byteArray(`
Sprite .type
x      .byte
y      .byte
tile   .byte
flags  .byte
       .endtype

        .db sizeof(Sprite), offset(Sprite, flags)
`),
    ).toEqual([4, 3]);
  });

  it('supports name-left type aliases transparently', () => {
    expect(
      byteArray(`
Sprite .type
x      .byte
y      .byte
tile   .byte
flags  .byte
       .endtype

SpriteArray .typealias Sprite[4]
BASE        .equ $2000

        .ds SpriteArray
        .db sizeof(SpriteArray)
        .db offset(SpriteArray, [2].tile)
        LD HL,<SpriteArray>BASE[3].flags
`),
    ).toEqual([
      ...Array.from({ length: 16 }, () => 0),
      16,
      10,
      0x21,
      0x0f,
      0x20,
    ]);
  });

  it('supports scalar, array, record, and nested name-left aliases', () => {
    expect(
      byteArray(`
Sprite .type
x      .byte
y      .byte
tile   .byte
flags  .byte
       .endtype

SpriteAlias .typealias Sprite
Bytes       .typealias byte[4]
MoreBytes   .typealias Bytes[2]

Container .type
sprite    .field SpriteAlias
buffer    .field MoreBytes
          .endtype

        .db sizeof(SpriteAlias)
        .db sizeof(Bytes), offset(Bytes, [3])
        .db sizeof(MoreBytes), offset(MoreBytes, [6])
        .db sizeof(Container), offset(Container, buffer)
`),
    ).toEqual([0x04, 0x04, 0x03, 0x08, 0x06, 0x0c, 0x04]);
  });

  it('diagnoses bad name-left aliases and invalid aliased field paths', () => {
    const recursive = compileNext(`
A .typealias B
B .typealias A
        .db sizeof(A)
`);
    expect(recursive.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'recursive type: A' }),
    ]));

    const missing = compileNext(`
A .typealias Missing
        .db sizeof(A)
`);
    expect(missing.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'unknown type: Missing' }),
    ]));

    const badPath = compileNext(`
Sprite .type
tile   .byte
       .endtype

SpriteArray .typealias Sprite[2]
        .db offset(SpriteArray, [0].missing)
`);
    expect(badPath.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'unknown field "[0].missing" in type SpriteArray' }),
    ]));
  });

  it('rejects colon forms for declarations', () => {
    for (const [source, message] of [
      ['COUNT: .equ 8', 'Use "COUNT .equ ..." for constants; colon labels mark addresses.'],
      ['Colour: .enum Red, Green', 'Use "Colour .enum ..." for enums; colon labels mark addresses.'],
      ['Sprite: .type', 'Use "Sprite .type" for layouts; colon labels mark addresses.'],
      [
        'SpriteArray: .typealias Sprite[4]',
        'Use "SpriteArray .typealias ..." for type aliases; colon labels mark addresses.',
      ],
    ]) {
      const result = compileNext(`${source}\n`);
      expect(result.diagnostics).toEqual([expect.objectContaining({ message })]);
    }
  });
});
