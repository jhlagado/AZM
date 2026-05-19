# ZAX Feature Retirement Audit

Status: first deprecation slice started
Date: 2026-05-18

## Purpose

AZM is no longer trying to carry ZAX forward as a high-level structured
assembler. AZM is an assembler with powerful **constant** expressions; ZAX
machinery that **generates hidden runtime code** (typed assignment, runtime
indexed EA, typed LD pipelines) is being retired. Normative phrasing:
`docs/design/azm-expression-and-visibility.md`.

The inherited codebase remains useful, but each ZAX feature now needs an
explicit AZM decision:

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

Keep (core AZM, simplify from ZAX):

- `op` declarations — AST-level inline instruction expansion at call sites; not
  text macros. AZM subset drops ZAX-style type signatures in op declarations.
  See `docs/design/azm-ops-subset.md`.
- directive aliases — canonical `.db`/`.dw`/… plus mapped legacy heads (`DEFB`,
  `DB`, …); normalization only, no instruction injection

Keep under review:
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

## Public naming inventory

Status: active inventory
Date: 2026-05-19

| Surface | Current spelling | AZM decision | Rationale |
|---------|------------------|--------------|-----------|
| npm package name | `@jhlagado/zax` | keep temporarily | Package split/rename is an alpha release decision. |
| package description | `ZAX assembler for the Z80 family` | keep temporarily | Package metadata should move together with the package split/rename. |
| CLI binary | `zax` | keep temporarily | Avoid breaking existing scripts before alpha packaging is decided. |
| CLI usage placeholder | `zax [options] <entry.zax>` | keep temporarily | Tied to the current executable and preserved `.zax` compatibility mode. |
| repository metadata | `github.com/jhlagado/ZAX` | keep temporarily | Repository/package metadata rename is outside this low-risk inventory task. |
| package keywords | `zax` | keep temporarily | Keyword and discoverability changes belong with package release planning. |
| diagnostic IDs | `ZAX###` | keep temporarily | Diagnostic ID migration needs a compatibility policy. |
| generated internal symbols | `__zax_*` | keep temporarily | Generated-symbol migration can affect debug maps, listings, and fixtures. |
| D8M tool identity | `zax` | keep temporarily | Debug-map producer identity should change only with a documented consumer migration. |
| lowered ASM80/listing banners | `ZAX lowered ASM80 output`, `ZAX listing` | keep temporarily | Output banner changes are user-visible golden-output changes and should be handled with fixture policy. |
| AZM-native deprecation message | `ZAX ... deprecated in AZM` | keep | The warning is explicitly about inherited ZAX constructs. |
| source mode name | `.zax` / `sourceMode === 'zax'` | keep | `.zax` remains the preserved compatibility mode for the old structured language. |
| public API imports | `@jhlagado/zax`, `@jhlagado/zax/tooling`, `@jhlagado/zax/compile` | keep temporarily | Public API import paths are semver-governed and should move only with package planning. |
| archived docs | `ZAX` | keep | Historical references should remain accurate. |
| learning course docs | `ZAX` | keep | The course is still written for the preserved ZAX language track. |
| compatibility scripts and temp names | `zax-*`, `ZAX CLI` | keep temporarily | These identify the current built CLI and should follow the binary/package decision. |
| current AZM planning docs | `ZAX` when referring to inherited features | keep | These references distinguish inherited ZAX behavior from AZM-native direction. |
| current ASM80 baseline docs | `ZAX` as the future assembler name | rename now | The current replacement direction is AZM, not the old ZAX track. |
