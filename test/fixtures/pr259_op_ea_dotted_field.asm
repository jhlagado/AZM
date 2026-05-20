.type Pair
lo .byte
hi .byte
.endtype

p:
  ds sizeof(Pair)

op touch(addr: ea)
  ld a, (addr)
end

main:
  touch <Pair>p.lo
  ret
