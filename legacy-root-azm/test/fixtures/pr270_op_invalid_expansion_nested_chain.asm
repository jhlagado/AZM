op bad_inner(src reg16)
  ld A, src
end

op mid(src reg16)
  bad_inner src
end

main:
  mid SP
