main:
    ret q
    ret nz, c
    jp q, 1
    jp nz, 1, 2
    call q, 1
    call nz, 1, 2
    jr q, 1
