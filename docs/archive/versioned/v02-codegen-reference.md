# v0.2 Codegen Reference (Consolidated)

This is the minimal, living reference for v0.2 codegen. Everything else for v0.2 lowering/calling should flow from these sources; retired historical docs have been removed.

## What to read (in order)

1. `docs/spec/zax-spec.md` §8.2 + local-init/epilogue sections (frame, return registers, preserves).
2. `docs/reference/return-register-policy.md` (matrix + HL-preserve swap guidance).
3. `docs/archive/versioned/v02-codegen-worked-examples.md` (assumptions + worked lowerings).
4. `examples/language-tour/00_call_with_arg_and_local_baseline.codegen-notes.md` (hand-crafted baseline; do **not** regenerate) with matching `.expected-v02.asm`.
5. `docs/reference/arrays.md` (IX + DE/HL lowering guidance and runtime-atom budget cues).
6. `docs/reference/addressing-model.md` (legal addressing shapes, grammar, and representative patterns; indexing stays anchored on typed bases).

## Invariants to keep

- Register-list returns; preservation = {AF, BC, DE, HL} \ ReturnSet; `AF` in return set makes flags volatile.
- IX-anchored frames; locals at IX-2, -4… in declaration order; locals before preserves.
- HL-preserve cases use per-local swap init; HL-return cases use simple init.
- IX+d word transfers involving HL must shuttle via DE; never emit IX+H/L hidden forms.
- One synthetic epilogue per framed func; pops preserved regs in reverse, then `ld sp,ix`, `pop ix`, `ret`; all `ret`/`ret cc` rewrite there when cleanup is needed.
- Language-tour regen must emit only `.asm` + `.d8.json` (guarded by `test/regenerate_language_tour_outputs.test.ts`).
