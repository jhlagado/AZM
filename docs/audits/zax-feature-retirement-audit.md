# ZAX Feature Retirement Audit

Status: first deprecation slice started
Date: 2026-05-18

## Purpose

AZM is no longer trying to carry ZAX forward as a high-level structured
assembler. AZM is an assembler with powerful **constant** expressions; ZAX
machinery that **generates hidden runtime code** (typed assignment, runtime
indexed EA, typed LD pipelines) is being retired. Normative phrasing:
`docs/design/azm-expression-and-visibility.md`.

AZM is not ZAX 0.4 and has zero users to preserve old experiment compatibility
for. The compatibility promise is ASM80 baseline compatibility plus the chosen
AZM features listed in `docs/audits/azm-removal-inventory.md`.

The inherited codebase remains useful, but each ZAX feature now needs an
explicit AZM decision:

- keep as assembly-first functionality
- keep temporarily in quarantine while it is deleted or split out
- deprecate in AZM-native source
- retire after tests and docs no longer depend on it

## First policy decision

AZM keeps layout metadata, not typed memory access.

Keep:

- `type` as a memory layout declaration
- records as packed field layouts
- unions as overlay layouts
- array type expressions for byte counts
- `sizeof(...)`
- `offset(...)`
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

Deprecate in AZM-native source (continued):

- named `section` blocks — ZAX placement; ASM80 uses `org`, labels, and separate
  files. Rejected at parse time in `.azm`.

Keep under review:

- `enum`, because it is a useful constant-naming facility

See `docs/audits/azm-removal-inventory.md` for the full keep/remove matrix.

## Current implementation

The first code slice introduced `.azm` as an AZM-native source mode. In that
mode, inherited ZAX high-level constructs produce `AZM700` diagnostics. `.zax`
continues only as a temporary quarantine path for the old ZAX test corpus.

This is deliberately a retirement stage. It creates visible pressure without
requiring the ZAX-derived implementation to be deleted all at once.

## Next retirement steps

1. Expand warning coverage only where it is precise and not noisy.
2. Add docs showing layout constants in idiomatic AZM source.
3. Build an alpha guardrail suite that protects ASM80 compatibility,
   register-care checks, directive aliases, and layout constants.
4. Quarantine old ZAX high-level tests into a temporary retirement bucket.
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

- keep `type`, `union`, arrays, `sizeof`, `offset`, and explicit constant
  layout casts as metadata/constant features
- quarantine typed `data`, `var`/`globals`, typed assignment, and hidden runtime
  typed-address lowering as ZAX compatibility behavior

## Public naming inventory

Status: active inventory
Date: 2026-05-19

| Surface | Current spelling | AZM decision | Rationale |
|---------|------------------|--------------|-----------|
| npm package name | `@jhlagado/azm` | renamed | AZM has no user compatibility burden; the package identity should match the project. |
| package description | `AZM assembler for the Z80 family` | renamed | Package metadata now describes the AZM assembler. |
| CLI binary | `azm` | renamed | The executable should match the assembler name. |
| CLI usage placeholder | `azm [options] <entry.asm\|entry.z80\|entry.azm>` | renamed | Native usage points at assembler source, not old `.zax` syntax. |
| repository metadata | `github.com/jhlagado/AZM` | renamed | Repository metadata now follows the AZM project identity. |
| package keywords | `azm` | renamed | Discoverability should point at AZM. |
| diagnostic IDs | `ZAX###` | keep temporarily | Diagnostic ID migration needs a compatibility policy. |
| generated internal symbols | `__zax_*` | keep temporarily | Generated-symbol migration can affect debug maps, listings, and fixtures. |
| D8M tool identity | `azm` | renamed | Debug-map producer identity now follows the assembler package and CLI identity. |
| lowered ASM80/listing banners | `AZM lowered ASM80 output`, `AZM listing` | renamed | User-visible generated artifacts now use the AZM project name. |
| AZM-native deprecation message | `ZAX ... deprecated in AZM` | keep | The warning is explicitly about inherited ZAX constructs. |
| source mode name | `.zax` / `sourceMode === 'zax'` | keep temporarily | `.zax` remains a quarantine mode for old structured-language tests until deletion or split-out is complete. |
| public API imports | `@jhlagado/azm`, `@jhlagado/azm/tooling`, `@jhlagado/azm/compile` | renamed | Tooling imports now match the package identity. |
| archived docs | `ZAX` | keep | Historical references should remain accurate. |
| learning course docs | `ZAX` | keep | The course is still written for the preserved ZAX language track. |
| retirement scripts and temp names | `zax-*` where they refer to old `.zax` tests | keep temporarily | These names identify the old structured-language removal lane, not the AZM product. |
| current AZM planning docs | `ZAX` when referring to inherited features | keep | These references distinguish inherited ZAX behavior from AZM-native direction. |
| current ASM80 baseline docs | `ZAX` as the old planned assembler name | rename now | The current replacement direction is AZM, not the old ZAX track. |
