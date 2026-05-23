; Regression #1356: ld (bc), a must parse as register-indirect, not symbol "bc".

.org $1000
buf: .db 1

.org $0000
main:
  ld bc, buf
  ld a, $2a
  ld (bc), a
  ret
