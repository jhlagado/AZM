Sprite .type
x     .byte
y     .byte
tile  .byte
flags .word
.endtype

.org $1000
one:
  .ds sizeof(Sprite)

main:
  ret
