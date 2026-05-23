; Regression #1356 / emitAbs16LdFixup: ld a, (de) must parse as register-indirect, not symbol "de".

.org $1000
buf: .db 1

.org $0000
main:
  ld de, buf
  ld a, (de)
  ret
