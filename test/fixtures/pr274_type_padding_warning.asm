type Sprite
  x: byte
  y: byte
  tile: byte
  flags: word
end

org $1000
one:
  ds sizeof(Sprite)

main:
  ret
