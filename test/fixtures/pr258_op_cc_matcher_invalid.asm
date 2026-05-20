op cond_nop(cond: cc)
  if cond
    nop
  end
end

main:
  cond_nop A
  ret
