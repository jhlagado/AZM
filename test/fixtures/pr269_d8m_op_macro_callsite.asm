op write_pair(dst: reg8)
  ld dst, 1
  ld dst, 2
end

main:
  write_pair B
  nop
  ret
