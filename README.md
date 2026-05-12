# ZAX

A structured assembler for Z80-family processors.

ZAX compiles directly to machine code. No linker. No runtime. No object files.

You write raw Z80 instructions. ZAX gives you named storage, typed functions, structured control flow, and a typed macro system on top. The machine stays visible throughout.

---

## What it looks like

This function computes the absolute difference of two 16-bit values:

```zax
func abs_diff(a: word, b: word): HL
  hl := b
  de := a
  xor a
  sbc hl, de        ; try b − a
  if C              ; b < a, subtract the other way
    hl := a
    de := b
    xor a
    sbc hl, de
  end
end
```

- `hl := b` — load named parameter into HL; the compiler emits the correct load
- `xor a \ sbc hl, de` — raw Z80 instructions, passed through unchanged
- `if C` — structured branch on carry flag; no label to invent
- `: HL` — declares the return register; compiler preserves the rest

ZAX constructs and raw Z80 instructions mix freely. The machine model does not change.

---

## Where to start

**New to Z80?**
[Part 1 — Learn Z80 Programming in ZAX](learning/part1/README.md) starts from scratch: bytes, registers, flags, memory, the stack, subroutines, I/O. No assembly experience needed.

**Already know Z80 assembly?**
[Part 2 — Algorithms and Data Structures in ZAX](learning/part2/README.md) teaches ZAX through real programs — sorting, searching, strings, recursion, records, and more. Start at Chapter 00 or dive straight into the chapter you need.

**Want the language reference?**
[ZAX Quick Guide](docs/reference/ZAX-quick-guide.md) — full syntax in practical terms.
[ZAX Language Spec](docs/spec/zax-spec.md) — normative specification.
[Tooling API](docs/tooling-api.md) — stable Node imports for parse/load/analyze/compile.

**Contributing?**
[CONTRIBUTING.md](CONTRIBUTING.md) — branches, PRs, issues, and pre-push checks.
[Dev Playbook](docs/reference/zax-dev-playbook.md) — deeper workflow and testing detail.

---

## Install

Requires Node.js 20+.

```sh
git clone https://github.com/jhlagado/zax.git
cd zax
npm install
npm run zax -- examples/hello.zax
```

**Linting:** `npm run lint` (ESLint 9 flat config in `eslint.config.js`). The project uses `typescript-eslint` with the TypeScript project service and `@typescript-eslint/no-unused-vars` (with `^_` ignore patterns). TypeScript’s `noUnusedLocals` is **not** enabled in `tsconfig.json` so unused bindings are enforced once via ESLint (see issue #1083).

Output files for each compiled source:

| Extension      | Contents               |
|----------------|------------------------|
| `.hex`         | Intel HEX              |
| `.bin`         | Flat binary            |
| `.lst`         | Byte dump + symbols    |
| `.asm`         | Lowered instruction trace |
| `.d8.json`     | Debug80 map            |

```
zax [options] <entry.zax>

  -o, --output <file>    Output base path
  -I, --include <dir>    Add search path (repeatable)
  --case-style <m>       Lint: off, upper, lower, consistent
  -V, --version
  -h, --help
```

## Programmatic API

`@jhlagado/zax` now exposes documented, semver-governed Node entry points:

- `@jhlagado/zax` — root barrel for the stable public surface
- `@jhlagado/zax/tooling` — Layer A/B APIs for parsing, loading, spans, diagnostics, and semantics-only analysis
- `@jhlagado/zax/compile` — Layer C compile API plus default format writers

Deep imports like `@jhlagado/zax/dist/src/moduleLoader.js` are not part of the supported contract. Use the public barrels above instead. See [docs/tooling-api.md](docs/tooling-api.md) for examples and compatibility policy.

---

## Language features

| Feature | What it does |
|---------|-------------|
| `:=` typed storage | Named variables in `section data` or `var` locals; compiler emits the load or store |
| Functions | Typed parameters, declared return register, compiler-managed stack frame |
| Structured control flow | `if`/`else`, `while`, `repeat`/`until`, `select`/`case` — all flag-driven |
| `op` macros | Named inline macros with typed operands; overload-resolved at the call site |
| Records, unions, arrays | Memory layout with no runtime metadata; `sizeof`/`offsetof` computed at compile time |
| Enums and constants | Compile-time integers with full arithmetic and forward references |
| Modules | Explicit imports; private by default; `export` for cross-module visibility |
| `include` | Pre-parse text insertion for shared constants and op definitions |

---

## Project status

Under active development. The end-to-end pipeline is functional.

**Working:** single and multi-module compilation, typed functions with stack frames, all structured control flow forms, the op system with overload resolution, records/unions/arrays/enums, compile-time expressions, text `include`, all output formats.

**In progress:** exact-size runtime indexing for non-power-of-two strides, broader ISA coverage, Debug80 integration.

---

## License

GPL-3.0-only. See [LICENSE](LICENSE).
