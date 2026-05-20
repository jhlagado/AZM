type Sprite
  x: byte
  y: byte
  tile: byte
  flags: word
  _pad_word: word
  _pad_byte: byte
end

org $1000
one:
  ds sizeof(Sprite)

main:
  ret
