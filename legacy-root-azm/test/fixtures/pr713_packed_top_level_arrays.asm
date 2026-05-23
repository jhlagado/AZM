        .org $4000
bytes:  .db 1, 2, 3
flag:   .dw 1
words:  .dw 17, 34
tail:   .db 5

        .org $4020
main:
        ret
