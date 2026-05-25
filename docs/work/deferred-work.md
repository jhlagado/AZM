# Deferred Work

This file records deferred and backburner items that are intentionally not part of the current implementation stream.

Current AZM docs treat `.asm` and `.z80` as source files and `.asmi` as the
external register-care interface format. Retained language work is limited to
the ASM80 baseline, compact AZMDoc `;!` comments, directive aliases, ops, enums,
`.type` / `.union`, `sizeof`, `offset`, layout casts, and scalar type shorthand
in `.ds` / `.field`. Modules/imports, funcs, locals, args, typed
assignment/storage lowering, and sections are removed or non-goals, not deferred
compatibility work.

## Format

For each item record:

- Status
- Why deferred
- Preconditions
- Source
- Notes

## Deferred Items

### User-authored op contracts

- Status: deferred
- Why deferred: no register-effect analysis mechanism exists for arbitrary op bodies
- Preconditions:
  - per-instruction effect model
  - verifier scope definition
  - failure behavior when verification is impossible
- Source:
  - historical addressing-design discussion from removed ZAX-era notes
- Notes:
  - this is separate from current parser/spec cleanup work

### Typed cast surface `<Type>base.tail`

- Status: landed; monitor follow-up cleanup only
- Why deferred: the feature itself is no longer deferred, but any further
  expansion beyond the accepted v1 shape should wait until post-landing review
  is complete
- Preconditions:
  - post-landing docs/spec cleanup completed
  - any remaining `LANG-02` implementation tickets closed or re-scoped
- Source:
  - GitHub issue `#736 (LANG-02)`
- Notes:
  - landed as additive language work, not as part of an `addr` revival

### Redundant converted fixture cleanup

- Status: low priority
- Why deferred: fixture pruning should not interrupt higher-signal AZM language
  boundary and ZAX-retirement work
- Preconditions:
  - current removed-syntax guardrail remains clean
  - each candidate fixture is mapped to the test that uses it
  - overlapping coverage is identified before deletion
- Source:
  - user request during the AZM good-assembler cleanup
- Notes:
  - remove fixtures that only exercised old ZAX behavior and, after conversion
    to `.asm`, no longer cover a distinct AZM behavior
  - keep fixtures that exercise ASM80 baseline compatibility, register-care,
    directive aliases, ops, layout constants, enums, `.asmi`, or meaningful
    diagnostics
  - prefer deleting redundant fixtures over preserving converted historical
    material for its own sake

### Documentation cleanup follow-up

- Status: mostly done; monitor for stale references
- Why deferred: remaining work is repository hygiene, not a language-feature
  blocker
- Preconditions:
  - source code and tests remain the authority for assembler behavior
  - retained implementation references remain reachable from `docs/README.md`
  - stale documents are deleted rather than archived
- Source:
  - user request during the AZM good-assembler cleanup
- Notes:
  - keep deleting or updating stale references when documents move or are
    removed
  - keep `docs/` organized around `spec`, `reference`, `design`, and `work`

### Routine-private labels

- Status: deferred; no active design document
- Why deferred: the live source and tests define current label behavior, and
  speculative privacy/block-scoping policy should not be treated as a spec
- Preconditions:
  - corpus evidence for any behavior change
  - explicit parser and symbol-table tests before implementation
- Source:
  - removed stale design note
- Notes:
  - do not infer private-label behavior from historical docs

### VS Code / LSP integration

- Status: deferred; no active design document
- Why deferred: editor integration should build on the public tooling API after
  the assembler surface is stable
- Preconditions:
  - stable `@jhlagado/azm/tooling` contract
  - current syntax highlighting and diagnostic requirements
- Source:
  - removed stale design note
- Notes:
  - use `docs/reference/tooling-api.md` as the integration starting point

### Layout type aliases

- Status: landed in post-0.2.1 P1 language tightening
- Why deferred: no longer deferred
- Preconditions: complete
- Source:
  - user request: allow a named `SpriteArray` style type to mean `Sprite[16]`
    directly
- Notes:
  - canonical syntax is `.type SpriteArray = Sprite[16]`
  - aliases are transparent compile-time layout facts; no wrapper field level
  - implementation keeps aliases as compile-time layout facts only; no
    constructors, hidden typed storage lowering, or runtime type system
