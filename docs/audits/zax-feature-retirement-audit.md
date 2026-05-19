# ZAX Feature Retirement Audit

Status: first deprecation slice started
Date: 2026-05-18

## Purpose

AZM is no longer trying to carry ZAX forward as a high-level structured
assembler. The inherited codebase remains useful, but each ZAX feature now
needs an explicit AZM decision:

- keep as assembly-first functionality
- keep temporarily for compatibility
- deprecate in AZM-native source
- retire after tests and downstream users have a migration path

## First policy decision

AZM keeps layout metadata, not typed memory access.

Keep:

- `type` as a memory layout declaration
- records as packed field layouts
- unions as overlay layouts
- array type expressions for byte counts
- `sizeof(...)`
- `offsetof(...)`
- explicit layout-cast address expressions such as
  `<Sprite[16]>SPRITES[BASE + 1].flags`
- ordinary constants derived from layout expressions

Deprecate in AZM-native source:

- `func` declarations and generated function frames
- typed assignment with `:=`
- structured control keywords lowered by the compiler
- typed `data` storage blocks
- typed `var` / `globals` storage blocks
- typed `extern func` declarations
- implicit typed effective-address syntax and any field/index access that
  implies hidden runtime lowering

Keep under review:

- `op` declarations, but only as AST-level assembly helpers
- `enum`, because it is a useful constant-naming facility
- named sections, because AZM may eventually need multi-region output

## Current implementation

The first code slice introduces `.azm` as an AZM-native source mode. In that
mode, inherited ZAX high-level constructs produce `AZM700` warnings. `.zax`
continues to behave as the preserved compatibility mode for the old ZAX test
corpus.

This is deliberately a warning stage. It creates visible pressure without
breaking the existing ZAX-derived implementation all at once.

## Next retirement steps

1. Expand warning coverage only where it is precise and not noisy.
2. Add docs showing layout constants in idiomatic AZM source.
3. Build an alpha guardrail suite that protects ASM80 compatibility,
   register-care checks, directive aliases, and layout constants.
4. Quarantine old ZAX high-level tests into a compatibility bucket.
5. Remove deprecated lowering subsystems only after the audit and guardrails are
   reviewed.

## Test retirement map

The test classification lives in `docs/audits/zax-test-retirement-map.md`.
No test deletion should happen before that map is reviewed.

## Layout constant audit dependency

Status: active prerequisite
Date: 2026-05-19

The AZM layout-constant subset is blocked on the implementation map in
`docs/audits/layout-constant-api-audit.md`. That audit identifies which pieces
of the inherited type/layout machinery compute useful assembly-facing constants
and which pieces belong to the high-level ZAX lowering surface.

Retirement work should not delete layout-related parser, semantic, or lowering
helpers until the layout-constant tests are locked. The intended split is:

- keep `type`, `union`, arrays, `sizeof`, `offsetof`, and explicit constant
  layout casts as metadata/constant features
- quarantine typed `data`, `var`/`globals`, typed assignment, and hidden runtime
  typed-address lowering as ZAX compatibility behavior
