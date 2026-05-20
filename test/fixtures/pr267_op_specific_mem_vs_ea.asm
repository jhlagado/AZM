b:
  db 0

op route(src: ea)
  ld b, 1
end

op route(src: mem8)
  ld b, 2
end

main:
  route (b)
  ret
