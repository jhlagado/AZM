# ASM80 TEC-1G compatibility audit

Status: compatibility baseline input for the ASM80-first language track
Date: 2026-05-11

## Purpose

This audit extends the MON3 compatibility baseline with standalone TEC-1G
software examples. The goal is still not full ASM80 compatibility. The goal is
to support ordinary Z80 assembler source that matches the macro-free style used
by MON3 and common TEC-1G examples.

## Corpus

Root:

- `/Users/johnhardy/Documents/projects/TEC-1G/Software`

Included files:

- `Education/FastForw.z80`
- `Education/TECMag.z80`
- `Games/GOL.z80`
- `Games/Games.z80`
- `Games/Invader.z80`
- `Games/Invaders.z80`
- `Games/LCDRun.z80`
- `Games/MagicSq.z80`
- `Games/Maze.z80`
- `Games/MazeMan.z80`
- `Games/Snake.z80`
- `Music/Banger.z80`

Excluded files:

- `Education/tbasic.z80`

`tbasic.z80` is excluded because it contains ASM80 text macros:

```asm
.macro DWA
        .db msb(%%1) + 128
        .db lsb(%%1)
.endm
```

Macro-bearing files are deliberately outside the baseline. If this source is
revisited, the preferred direction is to translate the specific behavior into a
ZAX `ops`-style facility or a narrow assembler directive, not to implement the
ASM80 text macro system.

## Matrix Delta

TEC-1G extends the central compatibility matrix with undotted directives,
`.binto`, `DS count,fill`, `0xNN` literals, no-`.end` sources, no-`.org`
sources that start at zero, `SRA A`, and absolute register stores such as
`LD (addr),HL`.

## Added Coverage

Compared with the MON3 baseline, the TEC-1G non-macro corpus adds useful
coverage for these forms:

- undotted directives: `ORG`, `EQU`, `DB`, `DW`, `DS`
- mixed-case and dotted variants such as `.ORG` and `.END`
- `DS count` and `DS count,fill`
- `.binto` as an inclusive binary upper-bound directive
- `0xNN` hexadecimal literals in equates
- classic files without `.end`
- classic files without `.org`, which start at address zero under ASM80
- `SRA A`
- absolute 16-bit register stores such as `LD (ASCII_STR),HL`

The corpus also reinforces existing MON3 requirements:

- trailing-`H` hex and trailing-`B` binary literals
- current-location `$` expressions
- symbol arithmetic in operands and equates
- single- and double-quoted string data in `DB`
- IX/IY displacement operands

## Current Result

The repeatable audit command is:

```bash
npm run build
node scripts/dev/compare-tec1g-corpus.mjs
```

Current result:

```text
Included .z80 files: 12
Excluded macro files: 1
EXCLUDED macro Education/tbasic.z80
Education/FastForw.z80: match bytes=175
Education/TECMag.z80: match bytes=2399
Games/Games.z80: match bytes=1869
Games/GOL.z80: match bytes=425
Games/Invader.z80: match bytes=1441
Games/Invaders.z80: match bytes=1021
Games/LCDRun.z80: match bytes=666
Games/MagicSq.z80: match bytes=322
Games/Maze.z80: match bytes=1791
Games/MazeMan.z80: match bytes=995
Games/Snake.z80: match bytes=724
Music/Banger.z80: match bytes=38
```

ASM80 emits full 64 KiB binaries for several origin-based sources that do not
use `.binfrom`. The comparison script normalizes those by comparing ZAX output
against the ASM80 byte range beginning at the first `ORG` address. Files that
use `.binfrom`/`.binto` compare directly against ASM80's cropped output.

## Baseline Decision

The TEC-1G non-macro corpus is now acceptable as a secondary ASM80 baseline:

- MON3 remains the primary replacement target.
- TEC-1G non-macro files are a broader regression corpus for common assembler
  style.
- Macro-bearing sources are excluded until ZAX has a deliberate higher-level
  answer for that use case.
