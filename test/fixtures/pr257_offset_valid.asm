type Point
  x: byte
  y: byte
  color: word
end

union Payload
  asByte: byte
  asWord: word
end

type Node
  tag: byte
  payload: Payload
end

type Scene
  header: word
  sprites: Point[4]
end

OffY .equ offset(Point, y)
Idx .equ 3
OffSpritesIdxColor .equ offset(Scene, sprites[Idx].color)
OffPayloadWord .equ offset(Node, payload.asWord)

main:
  ld a, OffY
  ld hl, OffSpritesIdxColor
  ld de, OffPayloadWord
  ret
