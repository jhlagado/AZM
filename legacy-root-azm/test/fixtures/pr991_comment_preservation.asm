        .org $0100
count:  .dw 0 ; counter value

        .org $0200
main:
loop:   ; loop top
        ld a, (count) ; load counter
        ret ; done
