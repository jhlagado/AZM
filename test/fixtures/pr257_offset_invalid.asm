.type Point
x .byte
y .byte
.endtype

.type Scene
sprites .field Point[4]
.endtype

BadField .equ offset(Point, z)
BadIndexUnknown .equ offset(Scene, sprites[Nope].x)
BadIndexRange .equ offset(Scene, sprites[9].x)

main:
  ld a, 0
  ret
