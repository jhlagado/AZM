enum Mode Read, Write, Append
enum Count None, One, Two

SELECTED .equ Mode.Write + Count.Two

main:
        LD A,Mode.Append
        LD B,SELECTED
        LD C,Mode.Append + 1
        LD HL,(Mode.Append + 1)
TILES:
        .db Mode.Read,Mode.Write,Mode.Append
        .dw Mode.Append + 1
SCRATCH:
        .ds Count.Two
AFTER:
        .db Count.One
