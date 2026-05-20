# AZM removal inventory

Status: active roadmap
Date: 2026-05-19

AZM is an **ASM80-class assembler** with a small set of extensions. It does not
promise backward compatibility with ZAX or with earlier AZM experiments. The
only compatibility target is the ASM80 baseline plus the AZM features explicitly
kept below. Everything else inherited from ZAX is removal baggage.

AZM currently has zero users. That is a product advantage: compatibility policy
should protect ASM80 corpus behavior and chosen AZM features, not unfinished
ZAX/AZM experiments.

## Keep (product)

| Area              | What                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| ASM80 core        | `.asm` / `.z80` parsing, Z80 encode, fixups, includes, classic directives |
| Register-care     | Routine model, effects, liveness, AZMDoc / `.azmi`, CLI                   |
| Ops               | AST-level `op` expansion at call sites                                    |
| Directive aliases | `DEFB` → `.db`, etc. (head normalization only)                            |
| Layout constants  | `type` / `union`, `sizeof`, `offset`, layout-cast **constants**           |

## Remove from `.azm` (reject or warn now; delete lowering later)

| Feature                                                | `.azm` today           | End state                                                 |
| ------------------------------------------------------ | ---------------------- | --------------------------------------------------------- |
| `func` / `export func`                                 | Parse error            | Gone                                                      |
| `section code/data …`                                  | Parse error            | Gone — use `org` + labels + `.db`/`.dw`/`.ds`             |
| `:=` typed assignment                                  | AZM700 warning         | Gone                                                      |
| Structured control (`if`/`while`/`select` as language) | AZM700 warning         | Gone                                                      |
| Typed `data` / `var` / `globals`                       | AZM700 warning         | Gone                                                      |
| Typed `extern func`                                    | AZM700 warning         | Gone                                                      |
| ZAX `import` modules                                   | Rejected by `.azm`     | Gone — use ASM80-style textual `.include`                 |
| `offsetof(...)` spelling                               | Removed                | Gone — use `offset(...)`                                  |
| Runtime typed EA / indexed layout paths                | Error at fold/lowering | Gone                                                      |
| Text macros                                            | Not supported          | Stay out                                                  |

## Optional

| Feature | Note                                                       |
| ------- | ---------------------------------------------------------- |
| `enum`  | Useful constant names; keep if low-noise, else `.equ` only |

## Removal lane (temporary)

| Input           | Purpose                                           |
| --------------- | ------------------------------------------------- |
| `.zax`          | Old tests while they are rewritten or deleted     |
| `.asm` / `.z80` | ASM80 corpora (Tetro, Pacmo, MON3)                |

`npm run test:zax:retirement` is the temporary holding pen for old ZAX behavior
while the implementation is being cut down. It is not a compatibility promise.
Tests in that lane should either be rewritten as AZM-native/ASM80 tests or
deleted with the subsystem they protect.

Current coverage is partial. Passing this lane should never block a deliberate
ZAX removal. The lane exists only to keep the deletion work visible and
reviewable while it is happening.

## Native `.azm` shape

Flat source file: `type` / `const` / `op` at the top, then labels and
instructions (ASM80-style). No function wrappers, no named section blocks, no
ZAX `import` module graph. Multi-file assembly uses textual `.include` /
`include` in the ASM80 style.

## Test buckets

See `docs/audits/azm-alpha-test-buckets.md` and
`docs/audits/zax-test-retirement-map.md`. Delete or rewrite ZAX tests whenever
the behavior is not part of the kept AZM/ASM80 surface.

Lane rule:

- `npm run test:azm:alpha` owns native `.azm`, `.asm` / `.z80` compatibility,
  textual includes, directive aliases, register-care, visible ops, and layout
  constants.
- `npm run test:zax:retirement` temporarily contains inherited `.zax` syntax and
  behavior until each test is rewritten, archived, or removed.

## Implementation phases

1. **Surface** — parse errors for `func` and `section` in `.azm`; flat asm stream; AZM700 for remaining ZAX syntax (**done**, PR #7).
2. **Tests** — rewrite AZM-native tests to flat labels; quarantine `.zax`-only tests (**in progress: typed high-level batch landed, import/function/section coverage still expanding**).
3. **Lowering** — one instruction path for native code; drop frame/section/typed-storage lowering as soon as AZM/ASM80 guardrails no longer need it.
4. **Deletion** — remove dead subsystems and retired tests after guardrails pass.
