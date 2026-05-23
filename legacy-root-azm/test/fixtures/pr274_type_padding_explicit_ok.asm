.type Sprite
x         .byte
y         .byte
tile      .byte
flags     .word
_pad_word .word
_pad_byte .byte
.endtype

org $1000
one:
  ds sizeof(Sprite)

main:
  ret
