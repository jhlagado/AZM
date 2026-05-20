type Point
  x: byte
  y: byte
end

type Scene
  sprites: Point[4]
end

BadField .equ offset(Point, z)
BadIndexUnknown .equ offset(Scene, sprites[Nope].x)
BadIndexRange .equ offset(Scene, sprites[9].x)

main:
  ld a, 0
  ret
