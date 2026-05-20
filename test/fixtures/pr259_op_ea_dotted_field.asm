type Pair
  lo: byte
  hi: byte
end

p:
  ds sizeof(Pair)

op touch(addr: ea)
  ld a, (addr)
end

main:
  touch <Pair>p.lo
  ret
