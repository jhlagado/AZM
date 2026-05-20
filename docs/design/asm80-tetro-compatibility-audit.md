# ASM80 Tetro compatibility audit

Status: promoted application smoke gate for the ASM80 baseline
Date: 2026-05-12

## Purpose

Tetro is a practical ASM80-style application corpus outside MON3. It is useful
for checking that AZM can replace ASM80 for loadable Tech-1 programs without
expanding into full ASM80 compatibility.

This corpus does not change the baseline policy: AZM remains macro-free for the
ASM80 compatibility track, and source files should be normalized rather than
adding low-value dialect aliases. Its value is loadable application coverage,
not pressure to clone unusual assembler variants.

## Corpus

Default source:

- `/Users/johnhardy/Documents/projects/tetro/src/tetro.asm`

The source includes nested files under the Tetro source root, so any reference
comparison must copy or run against the whole source tree rather than only
sibling `.asm` files.

## Current result

The current compatibility result is byte-for-byte parity with ASM80 after
trimming the ASM80 reference binary to the populated listing range:

- populated range: `0x4000..0x4a5c`
- AZM bytes: `2653`
- trimmed ASM80 bytes: `2653`
- first mismatch: none

Raw ASM80 output may be a full 64K image in this case, while AZM emits the
loadable populated range. The comparable reference is therefore the ASM80
listing range, not the raw file length.

## Compatibility deltas

Tetro is the corpus that made reserve-only `DS` behavior a priority. ASM80 uses
`DS` to reserve address space; trailing reserved space does not necessarily
belong in the loadable binary. AZM should match this behavior so RAM-loaded
applications do not grow because of uninitialized storage at the end of a
source file.

The corpus also exercises forward and compound `EQU` aliases in ordinary
operands and data directives.

## Gate

Tetro is an explicit close-out smoke gate:

```sh
npm run test:asm80:tetro
```

It is not folded into `npm run test:asm80:baseline` because it depends on a
separate local application checkout, but it should be run alongside the baseline
gate before moving into AZM assembler extension work.
