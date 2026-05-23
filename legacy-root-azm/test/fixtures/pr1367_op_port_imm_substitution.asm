; PR1367: imm8 op parameters substitute into in/out immediate port operands (PortImm8).

PORT_RED .equ $06
PORT_GREEN .equ $F8

op out_from_hl(p imm8)
  ld a, (hl)
  out (p), a
  inc hl
end

op in_to_a(p imm8)
  in a, (p)
end

.org $8000
main:
  ld hl, $9000
  out_from_hl PORT_RED
  out_from_hl PORT_GREEN
  in_to_a PORT_RED
  ret
