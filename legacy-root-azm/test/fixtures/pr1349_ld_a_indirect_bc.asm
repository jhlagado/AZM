; Regression #1356 / emitAbs16LdFixup: ld a, (bc) must parse as register-indirect, not symbol "bc".

.org $1000
buf: .db 1

.org $0000
main:
  ld bc, buf
  ld a, (bc)
  ret
