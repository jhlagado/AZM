# AZM alpha test buckets

Status: active roadmap
Date: 2026-05-19

Companion to `docs/audits/zax-test-retirement-map.md` and
`docs/audits/zax-feature-retirement-audit.md`.

## AZM Core Keep

Patterns: `test/asm80/**`, `test/frontend/directiveAliases.test.ts`, `test/moduleLoader_asm80_include.test.ts`, CLI contract tests that protect raw assembler I/O.

Rationale: ASM80-family baseline, includes, directive aliases, and CLI surfaces are the assembler foundation.

## ASM80 Compatibility Keep

Patterns: `test/asm80/tetro_acceptance.test.ts`, `test/asm80/asm80_baseline_workflow.test.ts`, corpus guardrail scripts.

Rationale: Corpus-driven regression; read-only external repos when run locally via `npm run test:azm:corpus`.

## Register-Care Keep

Patterns: `test/registerCare/**`

Rationale: AZMDoc contracts, routine boundaries, liveness, and reporting are first-class AZM tooling.

## Layout Constants Keep

Patterns: `test/semantics/layout_constants_azm.test.ts`, `test/semantics/layout_cast_constants_azm.test.ts`, `test/semantics/layout_cast_fold.test.ts`, `test/pr8_sizeof.test.ts`, `test/semantics/semantics_layout.test.ts`, `test/semantics/layout_edge_cases.test.ts`

Rationale: Exact `sizeof`/`offset`/layout-cast constant folding without typed memory lowering.

## Ops Keep Under Guard

Patterns: `test/lowering/pr510_op_expansion_*.test.ts`, `test/registerCare/opExpansion.integration.test.ts`, op diagnostic fixtures under `test/fixtures/pr270_*`

Rationale: AST `op` expansion is a core AZM feature; register-care integration documents current limits.

## ZAX Compatibility Quarantine

Patterns: `test/pr770_*`, `test/pr1334_*`, `test/pr1049_*`, `test/pr819_exact_scale_lowering.test.ts`, structured-control and `:=` lowering matrices.

Rationale: High-level ZAX behavior preserved for `.zax` mode until retirement or rewrite.

## AZM native surface

Patterns: `test/frontend/azm_flat_module_asm.test.ts`, `test/frontend/azm_native_boundary.test.ts`, `test/frontend/azm_source_mode_deprecations.test.ts`

Rationale: Flat `.azm` modules (no `func`, no `section`); parse errors and AZM700 warnings.

## Retirement Candidates After Alpha

Patterns: tests that only assert generated ZAX frames, typed `var`/`globals` lowering, or implicit typed EA pipelines without an AZM-native replacement.

Rationale: Remove after layout constants, ops, and register-care guardrails cover the assembler-first path.
