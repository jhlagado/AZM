# ASM80 Software compatibility audit

Status: exploratory compatibility audit for the ASM80-first language track
Date: 2026-05-11

## Purpose

This audit expands beyond MON3 and TEC-1G into the sibling `Software` source
tree. It is deliberately exploratory: it identifies useful next compatibility
gaps and corpus candidates, but it does not change the standing ASM80 baseline
gate.

The goal is still the same narrow one: support ordinary macro-free Z80
assembler source. This is not a decision to implement the full ASM80 language.

## Relationship to the Standing Baseline

The standing gate remains:

```sh
npm run test:asm80:baseline
```

That gate covers the recursive MON3 source tree and the TEC-1G non-macro
corpus. The Software corpus is not part of that command yet.

Promotion requires a later deliberate change to the baseline docs, comparison
scripts, and `run-asm80-baseline.mjs`.

## Corpus

Root:

- `/Users/johnhardy/Documents/projects/Software`

Initial audit partitions:

- `monitors`: 30 `.asm`/`.z80` files
- `games`: 12 `.asm`/`.z80` files
- `magazine_code`: 41 `.asm`/`.z80` files

The broader tree contains additional candidate areas such as `music/sn76489`,
`misc`, and `TEC-1G_software/source`, but those are outside the first Software
audit slice.

## Exclusion Policy

The Software audit follows the same exclusion policy as the TEC-1G audit:

- exclude files containing `.macro` or `.endm`
- exclude Tiny Basic-style macro/preprocessor sources from the first slice
- do not implement ASM80 text macros just to admit excluded files
- record exclusions by relative path and reason when they become part of a
  promoted corpus

## Audit Method

The exploratory command shape is:

```sh
npm run build
node scripts/dev/compare-software-corpus.mjs /Users/johnhardy/Documents/projects/Software/<slice>
```

The Software wrapper delegates to the shared ASM80 corpus comparator. It is
intentionally still a development script. The comparator walks both `.z80` and
`.asm` files, copies sibling `.z80`/`.asm` files into the ASM80 temp directory
so relative includes can resolve, and compares AZM output against the ASM80
reference bytes.

## Current Result

Initial exploratory results:

```text
Software/monitors:      30 included, 5 matched, 25 not yet compatible or not standalone
Software/games:         12 included, 11 matched, 1 not yet compatible
Software/magazine_code: 41 included, 41 matched
```

The strongest first promotion candidate is `Software/magazine_code`, because
all 41 files currently match ASM80:

```sh
node scripts/dev/compare-software-corpus.mjs /Users/johnhardy/Documents/projects/Software/magazine_code
```

The next best candidate is `Software/games` after normalizing the `DEFB`
byte-data dialect alias used by `games/Tape/Invaders.z80` to the canonical
`DB`/`.db` spelling. In the current pass, 11 of 12 game sources match ASM80.

The `monitors` slice is valuable as a compatibility backlog, but it should not
be promoted yet. It exposes broader gaps and non-standalone source files.

## Compatibility Matrix Delta

The Software audit adds pressure in these areas beyond MON3 and TEC-1G:

- `.asm` files as classic source inputs, not only `.z80`
- sibling relative includes during ASM80 reference comparison
- source-normalization pressure for byte/word/reserve dialect aliases such as
  `DEFB -> DB`, `DEFW -> DW`, and `RMB -> DS`
- `RST 20H` immediate syntax
- `$FE` hexadecimal literal syntax
- relative branch fixup behavior for `JR` and `DJNZ`
- non-standalone source files that depend on symbols from a larger build

## Observed Blockers

Examples from the first monitor/game pass:

- `Software/games/Tape/Invaders.z80`: uses `DEFB`, which is a normalization
  blocker rather than an AZM core directive
- `Software/monitors/JMon/JmonSource/JMON_SRC_01.asm`: uses `RST 20H`
- `Software/monitors/JMon/JMON_SouthernCrossVersion/JMON_SCV01.asm`: uses
  `RMB`, which is a normalization blocker rather than an AZM core directive
- `Software/monitors/Mon-2/Mon2a_JH/MON2A_JH.asm`: uses `$FE`
- `Software/monitors/Mon-1/Mon-1A/mon1A.asm`: exposes `JR`/`DJNZ` branch
  range/fixup gaps

Some monitor files fail under ASM80 when compiled as standalone files because
they depend on sibling modules or larger build context. Those should be handled
as build roots, not as isolated source files.

## Promotion Criteria

Promote a Software slice into the standing baseline only after:

1. The included file list is explicit.
2. The excluded file list and reasons are explicit.
3. All included files compare byte-for-byte against ASM80, or each intentional
   difference is documented.
4. `.org`, `.binfrom`, `.binto`, and full-64K ASM80 outputs have stable
   normalization rules.
5. Macro/text-substitution support remains out of scope.
6. `run-asm80-baseline.mjs`, `package.json`, and the baseline docs are updated
   in a separate promotion PR.

## Baseline Decision

The Software corpus is not part of `npm run test:asm80:baseline`.

It is an exploratory audit corpus. It should drive focused compatibility tests,
normalization work for dialect aliases, and implementation slices for real AZM
gaps. If the `games` slice is chosen next, the first step is normalizing `DEFB`
outside the core grammar. Direct promotion of `magazine_code` remains the
quickest green third-corpus option.
