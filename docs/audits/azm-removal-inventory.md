# AZM removal inventory

Status: active roadmap
Date: 2026-05-19

AZM is an **ASM80-class assembler** with a small set of extensions. Everything
else inherited from ZAX is compatibility baggage to remove from `.azm` source
and, later, from the implementation.

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
| ZAX `import` modules                                   | Compatibility-only     | Gone from native AZM — use ASM80-style textual `.include` |
| Runtime typed EA / indexed layout paths                | Error at fold/lowering | Gone                                                      |
| Text macros                                            | Not supported          | Stay out                                                  |

## Optional

| Feature | Note                                                       |
| ------- | ---------------------------------------------------------- |
| `enum`  | Useful constant names; keep if low-noise, else `.equ` only |

## Compatibility lane (temporary)

| Input           | Purpose                                           |
| --------------- | ------------------------------------------------- |
| `.zax`          | Old corpus + tests until quarantined or rewritten |
| `.asm` / `.z80` | ASM80 corpora (Tetro, Pacmo, MON3)                |

The first compatibility lane is `npm run test:zax:compat`. No ZAX-only
implementation should be deleted until this lane is green and default AZM
guardrails no longer depend on those tests.

Current coverage is partial. The first compatibility batch covers typed
high-level ZAX behavior. ZAX imports, generated function frames, named sections,
and structured-control lowering still need explicit compatibility-lane coverage
before those parser or lowering paths are deleted.

## Native `.azm` shape

Flat source file: `type` / `const` / `op` at the top, then labels and
instructions (ASM80-style). No function wrappers, no named section blocks, no
ZAX `import` module graph. Multi-file assembly uses textual `.include` /
`include` in the ASM80 style.

## Test buckets

See `docs/audits/azm-alpha-test-buckets.md` and
`docs/audits/zax-test-retirement-map.md`. Do not delete ZAX tests until ASM80,
register-care, ops, and layout buckets stay green.

Lane rule:

- `npm run test:azm:alpha` owns native `.azm`, `.asm` / `.z80` compatibility,
  textual includes, directive aliases, register-care, visible ops, and layout
  constants.
- `npm run test:zax:compat` owns inherited `.zax` syntax and behavior until
  each test is rewritten, archived, or removed.

## Implementation phases

1. **Surface** — parse errors for `func` and `section` in `.azm`; flat asm stream; AZM700 for remaining ZAX syntax (**done**, PR #7).
2. **Tests** — rewrite AZM-native tests to flat labels; quarantine `.zax`-only tests (**in progress: typed high-level batch landed, import/function/section coverage still expanding**).
3. **Lowering** — one instruction path for native code; drop frame/section/typed-storage lowering when compatibility lane allows.
4. **Deletion** — remove dead subsystems and retired tests after guardrails pass.
