# Oracle vs Next: test and fixture gap analysis

**Date:** 2026-05-24  
**Oracle tree:** `legacy-root-azm/test/` (149 Vitest files)  
**Next tree:** `test/` (49 Vitest files)  
**Branches reviewed:** `fix/phase0-asm80-honesty` (897034f), `fix/p1-asm80-parity` (afcbd0f)

## Executive summary

Next has **ported essentially all root `.asm` fixtures** from the oracle (`test/fixtures/` is a superset of `legacy-root-azm/test/fixtures/`; oracle-only delta is none). The asm80 regression was **not** caused by missing fixtures—it was caused by **missing or mis-aimed tests**:

1. **No external ASM80 round-trip** (oracle `cli/pr990_asm80_emitter_validation.test.ts` never ported).
2. **Root differential corpus compares BIN/HEX only**—broken `emitAsm80` text can match oracle if both are equally broken, or Next can diverge silently on asm80 while passing bin parity.
3. **`writeAsm80` unit coverage** (oracle `pr1048`) targeted the legacy `LoweredAsmProgram` emitter; Next’s production path is `SourceItem[]`-based and was only spot-checked in `lowered-asm80-artifact.test.ts`.
4. **Real-program asm80 acceptance** is opt-in (`AZM_RUN_*_ASM80_ACCEPTANCE=1`) and not in CI guardrails.
5. **`check:asm80-coverage`** was added in Phase 0 but was **not wired** into `next:guardrails` until this remediation slice.

Fixtures alone would not have caught push/pop/ret-cc/ld-matrix gaps; **emitAsm80-focused tests and the coverage script would have**.

---

## 1. Inventory: test files in oracle not ported to Next

**Count:** 142 of 149 oracle test paths have no path-equivalent under `test/` (many share basenames with different layout; Next reorganized into `unit/`, `integration/`, `differential/`, `cli/`).

### 1.1 Asm80 / writeAsm80 / round-trip (highest priority for asm80 disasters)

| Oracle path | Purpose | Next equivalent | Gap severity |
|-------------|---------|-----------------|--------------|
| `cli/pr990_asm80_emitter_validation.test.ts` | Compile fixtures with `emitAsm80`, assemble with external **asm80** CLI, compare Intel HEX to direct HEX | **None** (ported in P1 remediation as `test/differential/asm80-external-roundtrip.test.ts`) | **Critical** |
| `backend/pr1048_write_asm80_unit.test.ts` | Unit tests legacy `writeAsm80(LoweredAsmProgram)` formatting matrix | **None** (API redesigned; see §3) | High (legacy IR); Medium (Next path) |
| `backend/pr991_asm80_comment_preservation.test.ts` | User vs generated comments in asm80 output | `test/asm80/asm80_comment_preservation.test.ts` | Done |
| `asm80/asm80_align_directive.test.ts` | ALIGN directive in asm80 includes | `test/asm80/asm80_align_directive.test.ts` | Done |
| `asm80/asm80_directives_integration.test.ts` | DB/DW/DS/ORG integration | `test/asm80/asm80_directives_integration.test.ts` | Done |
| `asm80/asm80_equ_aliases.test.ts` | EQU alias surface | `test/asm80/asm80_equ_aliases.test.ts` | Done |
| `asm80/asm80_string_directives.test.ts` | String/db directives | `test/asm80/asm80_string_directives.test.ts` | Done |
| `asm80/asm80_baseline_workflow.test.ts` | npm script / doc wiring for baseline | Partial: scripts exist; doc tests **not** ported | Low |
| `asm80/mon3_opcode_gap.test.ts` | MON3 opcode gap tracking | `test/asm80/mon3_opcode_gap.test.ts` (+ `scripts/dev/asm80-mon3-audit.mjs` for Next) | Done |
| `frontend/asm80_asm_line.test.ts` | `.asm` line parsing for asm80 syntax | `test/unit/syntax/asm80-logical-line.test.ts` | Done |
| `frontend/asm80_asm_source.test.ts` | asm80 source surface | `test/unit/syntax/asm80-source-parser.test.ts` | Done |

**Frontend parser port notes (Done ≠ identical oracle behavior):**

- Non-baseline dialect aliases (`DEFB`/`defw`/`RMB`) are rejected with `AZMN_PARSE` instead of parsed as instructions.
- Unsupported dotted directives use `unsupported source line` diagnostics; labeled lines may still emit `label` items before the error.
- Multi-character string equates in `.db` stay as symbol references at parse time; expansion is assembly-time (`test/integration/real-program-parity.test.ts`).

### 1.2 LD matrix / push-pop / control-flow encoding (would catch lowering gaps)

| Oracle path | Purpose | Next equivalent |
|-------------|---------|-----------------|
| `pr203_ld_diag_matrix.test.ts` | LD diagnostic matrix | `test/integration/pr203-ld-diag-matrix.test.ts` | Done |
| `pr693_ld_form_selection.test.ts` | LD form selection | `test/unit/z80/pr693-ld-form-selection.test.ts` | Done |
| `backend/pr477_encode_ld_family.test.ts` | Encoder LD family | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice |
| `backend/pr1349_ld_a_indirect_hl_regression.test.ts` | `(hl)` indirect regression | Partial: `lowered-asm80-artifact` it.each for pr1349 fixtures |
| `backend/pr477_encode_core_ops_family.test.ts` | push/pop encode rules | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice |
| `backend/pr477_encode_alu_family.test.ts` | ALU encoder family | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice |
| `backend/pr477_encode_bitops_family.test.ts` | CB bit/rotate family | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice |
| `backend/pr477_encode_control_family.test.ts` | Control-flow encoder family | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice |
| `backend/pr477_encode_io_family.test.ts` | I/O / interrupt encoder family | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice |

### 1.3 Real-program / acceptance

| Oracle path | Purpose | Next equivalent |
|-------------|---------|-----------------|
| `asm80/mon3_acceptance.test.ts` | MON3 compile + external checks | `test/asm80/mon3_acceptance.test.ts` (BIN/HEX focused) |
| `asm80/tetro_acceptance.test.ts` | Tetro acceptance | `test/asm80/tetro_acceptance.test.ts` |
| — | Pacmo | `test/asm80/pacmo_acceptance.test.ts` (Next-only) |
| — | emitAsm80 on real programs | `test/asm80/emit_asm80_real_program_acceptance.test.ts` (**skipped** unless env=1) |

### 1.4 Other large oracle-only buckets (not asm80-specific)

Roughly **100+** tests remain oracle-only, including:

- **Backend ISA / encoder matrices:** `pr24_isa_core`, `pr129`–`pr151`, `pr477_encode_*`, `pr1140_encode_error_paths`, etc.
- **Frontend / parser:** `asm_flat_source`, `asm_top_level_parser`, `pr169`/`pr186`/`pr636` matrices.
- **CLI contract:** `cli_artifacts`, `cli_determinism_contract`, `cli_path_parity_contract`, `pr249_cli_lock_eviction_matrix`.
- **Lowering helpers:** `pr510`/`pr528`/`pr530`/`pr532` integration.
- **Register care:** full `registerCare/*` suite (Next has `unit/register-care/*` subset).
- **Semantics / layout:** `layout_cast_*`, `semantics_layout_extra`.
- **CI / smoke:** `ci_change_classifier`, `examples_compile`, `integration.test.ts`, `smoke.test.ts`.

These matter for **general parity** but are not the primary asm80 disaster detectors.

---

## 2. Fixture inventory

### 2.1 Fixtures in oracle missing from Next

**None.** Every `legacy-root-azm/test/fixtures/**/*.asm` file has a same-named sibling under `test/fixtures/`.

### 2.2 Fixtures in Next not in oracle

| File | Notes |
|------|-------|
| `test/fixtures/virtual_public_api_entry.asm` | Next public API smoke |
| `test/fixtures/virtual_public_api_root.asm` | Next public API smoke |
| `.gitkeep` | Placeholder |

### 2.3 Fixtures heavily used by oracle asm80 tests but not exercised for emitAsm80 in Next differential

| Fixture | ISA / behavior | Oracle usage | Next usage |
|---------|----------------|--------------|------------|
| `pr24_isa_core.asm` | Core Z80 ISA sweep | pr990 round-trip | root corpus **bin only** |
| `pr713_packed_top_level_arrays.asm` | Data placement / arrays | pr990 round-trip | root corpus **bin only** |
| `pr991_comment_preservation.asm` | Comments + `ld a,(sym)` | pr990 + pr991 | asm80 artifact partial |
| `pr37_forward_label_call.asm` | Labels / calls | pr990 | root corpus **bin only** |
| `pr1349_ld_*.asm` (5 files) | Register-indirect LD | encoder + asm80 | asm80 artifact it.each |
| `pr203_ld_diag_matrix_invalid.asm` | LD errors | pr203 matrix test | **no test file** |
| `pr56_isa_misc.asm`, `pr57_isa_im_rst.asm` | Misc / IM / RST | isa tests | asm80 artifact |
| `pr123_isa_alu_a_core.asm` | ALU A-core | isa tests | asm80 artifact |

**No new push/pop/ret-cc fixtures were required** for P1—the gaps were in the **emitter**, not missing golden `.asm` files. P1 added **inline source** cases in `lowered-asm80-artifact.test.ts` for push/pop/ret-cc.

---

## 3. Next tests that do not exercise `emitAsm80`

| Test | What it compares | emitAsm80 exercised? |
|------|------------------|----------------------|
| `test/differential/root-fixture-corpus.test.ts` | Current vs Next **binBytes**, hex, diagnostics | **No** (`compareRunResults` default) |
| `test/differential/fixture-corpus.test.ts` | Differential dir fixtures | **No** (unless extended) |
| `test/differential/artifact-corpus.test.ts` | Listing/d8 sidecars | **No** |
| `test/integration/real-program-parity.test.ts` | Real program BIN | **No** |
| `test/asm80/*_acceptance.test.ts` | External asm80 vs AZM **hex** from AZM compile path | Indirect (validates AZM output assembled; not `emitAsm80` text) |
| `test/differential/lowered-asm80-artifact.test.ts` | asm80 **text** vs legacy oracle emitter | **Yes** (primary Next asm80 gate) |
| `scripts/dev/check-asm80-lowering-coverage.mjs` | All fixtures, fail on `AZMN_ASM80` | **Yes** (script, not Vitest) |
| `test/asm80/emit_asm80_real_program_acceptance.test.ts` | No `AZMN_ASM80` on MON3/Tetro/Pacmo | **Yes** (opt-in) |

### `compareRunResults` behavior

`test/differential/compare-results.ts` only compares `asm80Text` when `options.compareAsm80 === true`. `root-fixture-corpus.test.ts` never passes that flag, so **bin-only fixtures can pass while emitAsm80 text diverges**. Remediation: `root-fixture-corpus-asm80.test.ts` + `asm80-corpus-policy.ts` (16 text-parity fixtures, 19 documented exclusions, guard for unclassified successful asm80 emits).

---

## 4. Root cause: why oracle would have caught asm80 gaps but Next did not

### 4.1 External round-trip (pr990)

Oracle test flow:

1. `compile(entry, { emitAsm80: true, emitHex: true })`
2. Write asm80 artifact to temp `.z80`
3. Run **external asm80** → Intel HEX
4. `assertSameHexMap(directHex, asm80AssembledHex)`

Any `DB $xx` stub or invalid mnemonic that still produced correct **internal** bytes would **fail** at step 3–4 when asm80 could not assemble or produced different bytes.

Next never had this test until P1 remediation.

### 4.2 Legacy-vs-Next asm80 diff can be symmetrically wrong

`lowered-asm80-artifact.test.ts` compares Next asm80 text to **legacy-root-azm** `writeAsm80`. If both emit `DB` stubs for push/pop, the test **passes**. This explains how P0 could add honest docs and CB fixes while stack/ret-cc gaps remained undetected in differential tests.

### 4.3 Generic formatter vs hand formatters

Oracle `writeAsm80` (legacy) and Next `write-asm80.ts` use large hand-written formatters per mnemonic family. Gaps appear when:

- Lowering emits a new `Z80Instruction` shape
- Formatter falls through to `UnsupportedAsm80LoweringError` or raw-byte fallback
- No pr990 or `check:asm80-coverage` run on that fixture

### 4.4 Fixture selection in CI

| Gate | Oracle-era | Next pre-P1 |
|------|------------|-------------|
| Alpha guardrails | asm80 directive tests in oracle repo | `test:azm:alpha` → unit + integration only |
| Next guardrails | N/A | `next:diff-current:all` → **bin** parity |
| asm80 coverage script | N/A (added Phase 0) | Documented but **not** in `next:guardrails` |
| pr990 | In oracle test tree | Missing |

### 4.5 Real-program acceptance scope

`mon3_acceptance` / `tetro_acceptance` validate **assembled machine code**, not the `--asm80` artifact. `emit_asm80_real_program_acceptance` is the correct lane but was **skipped by default** in CI and local `npm test`.

---

## 5. Promotion list (ordered)

### Tier 1 — would have caught the asm80 disaster (port first)

1. **`pr990` external round-trip** → `test/differential/asm80-external-roundtrip.test.ts` (opt-in when asm80 CLI absent).
2. **Wire `check:asm80-coverage`** into `next:guardrails:core` (mandatory pre-release).
3. **Expand `lowered-asm80-artifact`** with push/pop/ret-cc/ld-indexed **inline** cases (done on P1 branch).
4. **`emit_asm80_real_program_acceptance`** — run in release checklist; optional CI job with cached sources.

### Tier 2 — high value, medium effort

5. **`pr991_asm80_comment_preservation`** — assert comment lines in asm80 output (Next API).
6. **`pr203_ld_diag_matrix`** — port matrix runner against `pr203_ld_diag_matrix_invalid.asm`.
7. **`asm80/mon3_opcode_gap`** — track mnemonics that still hit `AZMN_ASM80` on MON3 slice.
8. **Oracle asm80 directive suite** (`asm80_align`, `equ_aliases`, `string_directives`, `directives_integration`) — port to `test/integration` or `test/asm80`.

### Tier 3 — general parity (not asm80-specific)

9. Backend `pr477_encode_*` family tests → strengthen `test/unit/z80/parser-encoder.test.ts` (**done:** all six families — core_ops, ld, alu, bitops, control, io).
10. CLI contract tests (`cli_artifacts`, determinism, path parity).
11. Register-care integration tests from oracle `registerCare/`.

### Not recommended to port verbatim

- **`pr1048_write_asm80_unit.test.ts`** — targets removed `LoweredAsmProgram` API; use `lowered-asm80-artifact` + fixture sweep instead.

---

## 6. Top 10 missing tests/fixtures (summary table)

| # | Item | Type | Why it matters |
|---|------|------|----------------|
| 1 | `pr990_asm80_emitter_validation` | Test | External asm80 HEX ≡ direct HEX |
| 2 | `check:asm80-coverage` in guardrails | Gate | Fails on any `AZMN_ASM80` per fixture |
| 3 | root-fixture-corpus asm80 mode | **Partial** | 16 parity + 19 excluded + accounting guard; 54 diagnostic-only compile-fail |
| 4 | `pr1048` lowered-IR unit tests | Test | Not portable; need SourceItem tests |
| 5 | `pr203_ld_diag_matrix` runner | Test | LD matrix regressions |
| 6 | `asm80/*` directive integration (5 files) | Test | Include/asm80 syntax |
| 7 | `mon3_opcode_gap` | Test | Real program opcode coverage |
| 8 | `pr991` comment preservation | Test | User comment fidelity |
| 9 | `pr477_encode_ld_family` / push-pop encoder | Test | Encoder-level before asm80 |
| 10 | Default-on real-program asm80 acceptance | Test policy | MON3/Tetro/Pacmo emitAsm80 |

**Fixtures:** no oracle-only `.asm` files missing; gaps are **test wiring**, not fixture files.

---

## 7. Recommended CI / release gates (post-remediation)

```sh
npm run build
npm run test:ci:coverage-core
npm run check:asm80-coverage
npm run next:guardrails:core   # includes asm80 coverage after P1 wire-up
# Optional local:
AZM_RUN_MON3_ASM80_ACCEPTANCE=1 \
AZM_RUN_TETRO_ASM80_ACCEPTANCE=1 \
AZM_RUN_PACMO_ASM80_ACCEPTANCE=1 \
npx vitest run test/asm80/emit_asm80_real_program_acceptance.test.ts
# Optional when asm80 CLI installed:
npx vitest run test/differential/asm80-external-roundtrip.test.ts
```

---

## 8. References

- Oracle pr990: `legacy-root-azm/test/cli/pr990_asm80_emitter_validation.test.ts`
- Next asm80 artifact tests: `test/differential/lowered-asm80-artifact.test.ts`
- Coverage script: `scripts/dev/check-asm80-lowering-coverage.mjs`
- P1 emitter fixes: `src/outputs/write-asm80.ts` on branch `fix/p1-asm80-parity`
