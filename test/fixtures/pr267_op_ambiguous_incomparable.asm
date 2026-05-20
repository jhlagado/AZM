op choose(dst: HL, src: reg16)
  nop
end

op choose(dst: reg16, src: BC)
  nop
end

main:
  choose HL, BC
