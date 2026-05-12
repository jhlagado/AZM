# Handcrafted Lowering Reference (Do Not Regenerate)

This file captures the exact expected prologue/epilogue and frame layout for the baseline example. It is a human-written reference and must not be auto-regenerated.

## Invariants

- Frame anchor: `IX` set to incoming `SP` (`push ix; ld ix,0; add ix,sp`).
- Args at `IX+4..`; locals packed downward from `IX-2` in declaration order, independent of preserve bytes.
- No-return clause → preserve `AF,BC,DE,HL`; return-in-`HL` → preserve `AF,BC,DE` only.
- If `HL` is preserved, init locals with swap pattern: `push hl`, `ld hl,imm`, `ex (sp),hl` (per local) **before** pushes of preserves.
- If `HL` is return/volatile, init locals with simple `ld hl,imm` + `push hl` **before** preserves.
- Epilogue: pop preserved regs in reverse, then `ld sp,ix`, `pop ix`, `ret` (no extra SP math). Saved-HL slot is popped in the no-return case.
- IX+d word moves involving `HL` use `DE` shuttle.

## Expected lowering: `main` (no return clause, HL preserved)

```
main:
push IX                        ; save old IX
ld IX, $0000
add IX, SP                     ; IX = incoming SP
push HL                        ; save HL because it is preserved
ld HL, $0011                   ; init local result_word
ex (SP), HL                    ; place init on stack, restore HL
push AF
push BC
push DE
push HL                        ; preserve full set (AF,BC,DE,HL)
ld HL, $0044
push HL                        ; arg for inc_one
call inc_one
inc SP
inc SP                         ; clean arg
push DE
ex DE, HL
ld (IX - $0002), E
ld (IX - $0001), D
ex DE, HL
pop DE
__zax_epilogue_1:
pop HL
pop DE
pop BC
pop AF
ld SP, IX
pop IX
ret
```

Locals: `result_word` at `IX-2`/`IX-1`.

## Expected lowering: `inc_one` (returns in HL, HL volatile)

```
inc_one:
push IX
ld IX, $0000
add IX, SP
ld HL, $0022
push HL
ld HL, $0033
push HL                      ; locals before preserves; HL free to clobber
push AF
push BC
push DE                      ; preserve non-return regs only
ld E, (IX + $0004)
ld D, (IX + $0005)
inc DE
ld (IX - $0002), E
ld (IX - $0001), D           ; temp_word
ld E, (IX - $0002)
ld D, (IX - $0001)
ex DE, HL                    ; move result to HL
__zax_epilogue_0:
pop DE
pop BC
pop AF
ld SP, IX
pop IX
ret
```

Locals: `temp_word` at `IX-2`/`IX-1`, `unused_word` at `IX-4`/`IX-3` (initialized but unused).
