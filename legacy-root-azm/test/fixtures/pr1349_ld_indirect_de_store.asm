; Regression #1356: ld (de), a must parse as register-indirect, not symbol "de".

.org $1000
buf: .db 1

.org $0000
main:
  ld de, buf
  ld a, $2a
  ld (de), a
  ret
