; hello.asm
;
; Small AZM .asm example: explicit labels, constants, and ASM80-style data.

.org $0100
main:
    ld hl,msg
    ld bc,MsgLen
loop:
    ld a,(hl)
    call BIOS_PUTC
    inc hl
    dec bc
    ld a,b
    or c
    jr nz,loop
    ret

BIOS_PUTC equ $0008

.org $1000
msg:
    .db $48,$45,$4c,$4c,$4f,$2c,$20,$41,$5a,$4d
MsgLen .equ $ - msg
.end
