op bad_pair(src reg16)
  ld A, src
  ld C, src
end

main:
  bad_pair SP
