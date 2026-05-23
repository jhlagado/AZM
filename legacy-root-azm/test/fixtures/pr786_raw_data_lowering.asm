org $0100
table:
  db 1, 2, 3
words:
  dw $1234, $5678
gap:
  ds 2
ptrs:
  dw handler_a, handler_b

org $0000
handler_a:
  ret

handler_b:
  ret

main:
  ld hl, table
  ld a, (table)
  ld (table), a
  ret
