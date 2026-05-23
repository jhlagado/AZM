import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('minimal flat assembler stage 7 layout', () => {
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
      expect.objectContaining({
        message: 'ld expects a supported register/memory/immediate transfer form',
      }),
    ]);
  });

  it('preserves legacy invalid immediate diagnostics for lone question-mark LD operands', () => {
    const result = compileNext(`
main:
        LD A,?
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'Invalid imm expression: ?' }),
      expect.objectContaining({ message: 'Unsupported operand: ?' }),
    ]);
  });

  it('keeps question-mark-prefixed symbols usable in expressions and layout casts', () => {
    const result = compileNext(`
.type Sprite
x .byte
.endtype

?BASE .equ $2000
?VALUE .equ 42

main:
        LD A,?VALUE
        LD HL,<Sprite>?BASE.x
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x3e, 0x2a, 0x21, 0x00, 0x20]);
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

});

