op clobber_a_with(src reg16)
  ld A, src
end

main:
  clobber_a_with SP
