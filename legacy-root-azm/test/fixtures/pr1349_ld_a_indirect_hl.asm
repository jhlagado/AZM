; Minimal regression for #1349 / PR1350: ld a, (hl) must not use emitAbs16LdFixup
; absolute-address path (would mis-resolve symbol "hl").

.org $1000
buf: .db 1

.org $0000
main:
  ld hl, buf
  ld a, (hl)
  ret
