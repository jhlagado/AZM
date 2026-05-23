        ORG 0100H
main:
        CALL target
        JR done
        NOP

done:
        RET

target:
        JR main
