# Oracle vs Next: test and fixture gap analysis

**Date:** 2026-05-24 (updated after full oracle audit)  
**Oracle tree:** `legacy-root-azm/test/` (149 Vitest files)  
**Next tree:** `test/` (~96 Vitest files)  
**Full audit:** subagent `d2f954ef` — every oracle file classified (PORT / SKIP / DEFER / DO NOT PORT)  
**Last matrix ports:** PRs #178–#184 through **pr151** zero-operand head matrix (PR #184)

## Executive summary

Next has **ported essentially all root `.asm` fixtures** from the oracle (`test/fixtures/` is a superset of `legacy-root-azm/test/fixtures/`; oracle-only delta is none). **Green CI and corpus parity are necessary but not sufficient:** many invalid fixtures pass `root-fixture-corpus.test.ts` (Next vs current AZM) without a **per-message diagnostic matrix** like the oracle uses. The asm80 regression was **not** caused by missing fixtures—it was caused by **missing or mis-aimed tests**:

1. **No external ASM80 round-trip** (oracle `cli/pr990_asm80_emitter_validation.test.ts` never ported).
2. **Root differential corpus compares BIN/HEX only**—broken `emitAsm80` text can match oracle if both are equally broken, or Next can diverge silently on asm80 while passing bin parity.
3. **`writeAsm80` unit coverage** (oracle `pr1048`) targeted the legacy `LoweredAsmProgram` emitter; Next’s production path is `SourceItem[]`-based and was only spot-checked in `lowered-asm80-artifact.test.ts`.
4. **Real-program asm80 acceptance** is opt-in (`AZM_RUN_*_ASM80_ACCEPTANCE=1`) and not in CI guardrails.
5. **`check:asm80-coverage`** was added in Phase 0 but was **not wired** into `next:guardrails` until this remediation slice.

Fixtures alone would not have caught push/pop/ret-cc/ld-matrix gaps; **emitAsm80-focused tests and the coverage script would have**.

---

## 1. Inventory: test files in oracle not ported to Next

**Count:** ~141 of 149 oracle test paths have no path-equivalent under `test/` (many share basenames with different layout; Next reorganized into `unit/`, `integration/`, `differential/`, `cli/`).

### 1.1 Asm80 / writeAsm80 / round-trip (highest priority for asm80 disasters)

| Oracle path                                           | Purpose                                                                                                  | Next equivalent                                                                             | Gap severity                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `cli/pr990_asm80_emitter_validation.test.ts`          | Compile fixtures with `emitAsm80`, assemble with external **asm80** CLI, compare Intel HEX to direct HEX | **None** (ported in P1 remediation as `test/differential/asm80-external-roundtrip.test.ts`) | **Critical**                         |
| `backend/pr1048_write_asm80_unit.test.ts`             | Unit tests legacy `writeAsm80(LoweredAsmProgram)` formatting matrix                                      | **None** (API redesigned; see §3)                                                           | High (legacy IR); Medium (Next path) |
| `backend/pr991_asm80_comment_preservation.test.ts`    | User vs generated comments in asm80 output                                                               | `test/asm80/asm80_comment_preservation.test.ts`                                             | Done                                 |
| `asm80/asm80_align_directive.test.ts`                 | ALIGN directive in asm80 includes                                                                        | `test/asm80/asm80_align_directive.test.ts`                                                  | Done                                 |
| `asm80/asm80_directives_integration.test.ts`          | DB/DW/DS/ORG integration                                                                                 | `test/asm80/asm80_directives_integration.test.ts`                                           | Done                                 |
| `asm80/asm80_equ_aliases.test.ts`                     | EQU alias surface                                                                                        | `test/asm80/asm80_equ_aliases.test.ts`                                                      | Done                                 |
| `asm80/asm80_string_directives.test.ts`               | String/db directives                                                                                     | `test/asm80/asm80_string_directives.test.ts`                                                | Done                                 |
| `asm80/asm80_baseline_workflow.test.ts`               | npm script / doc wiring for baseline                                                                     | Partial: scripts exist; doc tests **not** ported                                            | Low                                  |
| `asm80/mon3_opcode_gap.test.ts`                       | MON3 opcode gap tracking                                                                                 | `test/asm80/mon3_opcode_gap.test.ts` (+ `scripts/dev/asm80-mon3-audit.mjs` for Next)        | Done                                 |
| `frontend/asm80_asm_line.test.ts`                     | `.asm` line parsing for asm80 syntax                                                                     | `test/unit/syntax/asm80-logical-line.test.ts`                                               | Done                                 |
| `frontend/asm80_asm_source.test.ts`                   | asm80 source surface                                                                                     | `test/unit/syntax/asm80-source-parser.test.ts`                                              | Done                                 |
| `frontend/directiveAliases.test.ts`                   | Directive alias policy                                                                                   | `test/unit/syntax/directive-aliases.test.ts`                                                | Done                                 |
| `frontend/asm_removed_syntax_boundary.test.ts`        | Flat `.asm` unsupported-syntax boundary                                                                  | `test/integration/asm-removed-syntax-boundary.test.ts`                                      | Done                                 |
| `frontend/asm_flat_source.test.ts`                    | Flat `.asm` compile: labels, org/data, includes, aliases                                                 | `test/unit/syntax/asm-flat-source.test.ts`                                                  | Done                                 |
| `frontend/asm_top_level_parser.test.ts`               | ASM top-level label/directive/instruction parse order                                                    | `test/unit/syntax/asm-top-level-parser.test.ts`                                             | Done                                 |
| `frontend/pr169_malformed_decl_header_matrix.test.ts` | Malformed enum header diagnostics                                                                        | `test/unit/syntax/pr169-malformed-decl-header-matrix.test.ts`                               | Done                                 |
| `frontend/pr186_param_list_delimiter_matrix.test.ts`  | Op param list trailing/empty delimiter diagnostics                                                       | `test/unit/syntax/pr186-op-param-list-delimiter-matrix.test.ts`                             | Done                                 |

**Frontend parser port notes (Done ≠ identical oracle behavior):**

- Non-baseline dialect aliases (`DEFB`/`defw`/`RMB`) are rejected with `AZMN_PARSE` instead of parsed as instructions.
- Unsupported dotted directives use `unsupported source line` diagnostics; labeled lines may still emit `label` items before the error.
- Multi-character string equates in `.db` stay as symbol references at parse time; expansion is assembly-time (`test/integration/real-program-parity.test.ts`).

**PR169 / PR186 matrix port notes:**

- Diagnostics use Next `AZMN_PARSE` code; messages match oracle.
- `pr186` fixture surfaces one delimiter diagnostic per malformed `op` header (two errors total); oracle asserted a single matching message via `expectDiagnostic` containment.

**ASM top-level parser port notes (`asm-top-level-parser.test.ts`):**

- Oracle `parseAsmTopLevel` could emit a partial `AsmInstruction` node before operand diagnostics; Next `parseLogicalLine` reports `AZMN_PARSE` with **no** instruction item when the mnemonic is unknown or operands fail.
- Operand failures may surface as `unsupported source line: …` or instruction-specific errors; tests accept either (same as flat-source boundary).

**Flat `.asm` source port notes (`asm-flat-source.test.ts`):**

- Unknown top-level lines may report `unsupported source line: …` (parse) or `Unsupported operand: …` (instruction parse); tests accept either.
- Project alias profile uses `MYDB` instead of oracle `BYTE` (Next reserves `byte` as a layout keyword).
- Alias JSON requires `"extends": "azm"`.

**Directive alias port notes (`directive-aliases.test.ts`):**

- Project profiles must include `"extends": "azm"` (oracle passed dialect name as first argument).
- `BYTE` cannot be a project alias head — Next reserves `byte` as a layout keyword (oracle allowed `BYTE` → `.db`).
- Invalid alias targets report `Invalid directive alias target "…" for "…"` instead of a generic `/directive/i` message.
- Unknown mnemonics in flat `.asm` surface as `AZMN_PARSE` / `unsupported source line: …` rather than `Unsupported instruction: …` (`asm-removed-syntax-boundary.test.ts`).
- Retired colon field syntax reports `invalid .type field declaration` instead of `Invalid record field declaration line "…"`.

### 1.2 LD matrix / push-pop / control-flow encoding (would catch lowering gaps)

| Oracle path                                          | Purpose                              | Next equivalent                                                                                                |
| ---------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---- |
| `pr203_ld_diag_matrix.test.ts`                       | LD diagnostic matrix                 | `test/integration/pr203-ld-diag-matrix.test.ts`                                                                | Done |
| `pr693_ld_form_selection.test.ts`                    | LD form selection                    | `test/unit/z80/pr693-ld-form-selection.test.ts`                                                                | Done |
| `backend/pr477_encode_ld_family.test.ts`             | Encoder LD family                    | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice                                                       |
| `backend/pr1349_ld_a_indirect_hl_regression.test.ts` | `(hl)` indirect regression           | Done: `test/unit/z80/pr1349-ld-indirect-regression.test.ts` (+ asm80 artifact it.each)                         |
| `backend/pr477_encode_core_ops_family.test.ts`       | push/pop encode rules                | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice                                                       |
| `backend/pr477_encode_alu_family.test.ts`            | ALU encoder family                   | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice                                                       |
| `backend/pr477_encode_bitops_family.test.ts`         | CB bit/rotate family                 | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice                                                       |
| `backend/pr477_encode_control_family.test.ts`        | Control-flow encoder family          | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice                                                       |
| `backend/pr477_encode_io_family.test.ts`             | I/O / interrupt encoder family       | Done: `test/unit/z80/parser-encoder.test.ts` PR477 slice                                                       |
| `backend/pr1140_encode_error_paths.test.ts`          | Encoder error-path matrix            | Done: `test/unit/z80/pr1140-encode-error-paths.test.ts` (parse + disp8 assemble)                               |
| `backend/pr144_isa_ed_cb_diag_matrix.test.ts`        | ED/CB invalid-form matrix            | Done: `test/integration/pr144-ed-cb-diag-matrix.test.ts`                                                       |
| `pr150_ed_cb_diag_hardening_matrix.test.ts`          | ED/CB indexed disp8 + arity          | Done: `test/integration/pr150-ed-cb-diag-hardening-matrix.test.ts`                                             |
| `pr145_alu_diag_no_unsupported.test.ts`              | ALU two-operand dest A / no fallback | Done: `test/integration/pr145-alu-diag-no-unsupported.test.ts`                                                 |
| `pr211_jr_djnz_diag_matrix.test.ts`                  | JR/DJNZ invalid target matrix        | Done: `test/integration/pr211-jr-djnz-diag-matrix.test.ts` + `test/unit/z80/pr211-jr-djnz-diag-matrix.test.ts` |

### 1.3 Real-program / acceptance

| Oracle path                      | Purpose                        | Next equivalent                                                                    |
| -------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `asm80/mon3_acceptance.test.ts`  | MON3 compile + external checks | `test/asm80/mon3_acceptance.test.ts` (BIN/HEX focused)                             |
| `asm80/tetro_acceptance.test.ts` | Tetro acceptance               | `test/asm80/tetro_acceptance.test.ts`                                              |
| —                                | Pacmo                          | `test/asm80/pacmo_acceptance.test.ts` (Next-only)                                  |
| —                                | emitAsm80 on real programs     | `test/asm80/emit_asm80_real_program_acceptance.test.ts` (**skipped** unless env=1) |

### 1.4 Other large oracle-only buckets (not asm80-specific)

Roughly **100+** tests remain oracle-only, including:

- **Backend ISA / encoder matrices:** `pr24_isa_core`, `pr129`–`pr143`, **`pr151_zero_operand_head_diag_matrix`** **ported** (`test/integration/pr151-zero-operand-head-diag-matrix.test.ts`), `pr477_encode_*`, **`pr1140_encode_error_paths`** **ported** (`test/unit/z80/pr1140-encode-error-paths.test.ts`), **`pr144_isa_ed_cb_diag_matrix`** **ported** (`test/integration/pr144-ed-cb-diag-matrix.test.ts`), **`pr145_alu_diag_no_unsupported`** **ported** (`test/integration/pr145-alu-diag-no-unsupported.test.ts`), **`pr146_known_head_no_unsupported`** **ported** (`test/integration/pr146-known-head-no-unsupported.test.ts`), **`pr147_known_head_diag_matrix`** **ported** (`test/integration/pr147-known-head-diag-matrix.test.ts`), **`pr148_known_heads_no_fallback_matrix`** **ported** (`test/integration/pr148-known-heads-no-fallback-matrix.test.ts`), **`pr149_condition_diag_matrix`** **ported** (`test/integration/pr149-condition-diag-matrix.test.ts`), **`pr150_ed_cb_diag_hardening_matrix`** **ported** (`test/integration/pr150-ed-cb-diag-hardening-matrix.test.ts`), **`pr211_jr_djnz_diag_matrix`** **ported** (`test/integration/pr211-jr-djnz-diag-matrix.test.ts` + `test/unit/z80/pr211-jr-djnz-diag-matrix.test.ts`), etc.
- **Frontend / parser:** remaining small matrices (`asm_flat_source`, `asm_top_level_parser`, directive aliases, removed-syntax boundary, **pr169/pr186** **ported**). **`pr636` parse-diagnostics helpers** **ported** (`src/syntax/parse-diagnostics.ts`, `test/unit/syntax/pr636-parse-diagnostics-helpers.test.ts`).
- **CLI contract:** **pr249_cli_lock_eviction_matrix** **ported** (`test/cli/pr249-cli-lock-eviction-matrix.test.ts`); **cli_artifacts**, **cli_determinism_contract**, **cli_path_parity_contract**, **cli_source_extension**, **cli_azm_smoke**, **cli_acceptance_matrix_strictness**, **register_care_cli** **ported** (`test/cli/register_care_cli.test.ts`). Remaining oracle CLI: _(none in this bucket)_.
- **Lowering helpers:** `pr510`/`pr528`/`pr530`/`pr532` integration.
- **Register care:** oracle `registerCare/*` suite **ported** (`test/unit/register-care/*`, `test/integration/register-care/*`; PR #173).
- **Semantics / layout:** `layout_cast_*`, `semantics_layout_extra`.
- **CI / smoke:** `ci_change_classifier`, `examples_compile`, `integration.test.ts`, `smoke.test.ts`.

These matter for **general parity** but are not the primary asm80 disaster detectors.

---

## 2. Fixture inventory

### 2.1 Fixtures in oracle missing from Next

**None.** Every `legacy-root-azm/test/fixtures/**/*.asm` file has a same-named sibling under `test/fixtures/`.

### 2.2 Fixtures in Next not in oracle

| File                                         | Notes                 |
| -------------------------------------------- | --------------------- |
| `test/fixtures/virtual_public_api_entry.asm` | Next public API smoke |
| `test/fixtures/virtual_public_api_root.asm`  | Next public API smoke |
| `.gitkeep`                                   | Placeholder           |

### 2.3 Fixtures heavily used by oracle asm80 tests but not exercised for emitAsm80 in Next differential

| Fixture                                    | ISA / behavior                     | Oracle usage      | Next usage                                                                                               |
| ------------------------------------------ | ---------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `pr24_isa_core.asm`                        | Core Z80 ISA sweep                 | pr990 round-trip  | root corpus **bin only**                                                                                 |
| `pr713_packed_top_level_arrays.asm`        | Data placement / arrays            | pr990 round-trip  | root corpus **bin only**                                                                                 |
| `pr991_comment_preservation.asm`           | Comments + `ld a,(sym)`            | pr990 + pr991     | asm80 artifact partial                                                                                   |
| `pr37_forward_label_call.asm`              | Labels / calls                     | pr990             | root corpus **bin only**                                                                                 |
| `pr1349_ld_*.asm` (5 files)                | Register-indirect LD               | encoder + asm80   | asm80 artifact it.each                                                                                   |
| `pr203_ld_diag_matrix_invalid.asm`         | LD errors                          | pr203 matrix test | `test/integration/pr203-ld-diag-matrix.test.ts` + `test/unit/z80/pr203-ld-diag-matrix.test.ts`           |
| `pr144_isa_ed_cb_diag_matrix_invalid.asm`  | ED/CB invalid forms                | pr144 matrix test | `test/integration/pr144-ed-cb-diag-matrix.test.ts`                                                       |
| `pr150_ed_cb_diag_hardening_matrix.asm`    | ED/CB diag hardening               | pr150 matrix test | `test/integration/pr150-ed-cb-diag-hardening-matrix.test.ts`                                             |
| `pr145_alu_diag_no_unsupported.asm`        | ALU dest A / no fallback           | pr145 matrix test | `test/integration/pr145-alu-diag-no-unsupported.test.ts`                                                 |
| `pr146_known_head_no_unsupported.asm`      | Known-head no unsupported fallback | pr146 matrix test | `test/integration/pr146-known-head-no-unsupported.test.ts`                                               |
| `pr147_known_head_diag_matrix_invalid.asm` | Broad known-head diagnostics       | pr147 matrix test | `test/integration/pr147-known-head-diag-matrix.test.ts`                                                  |
| `pr148_known_heads_no_fallback_matrix.asm` | Known-head no-fallback matrix      | pr148 matrix test | `test/integration/pr148-known-heads-no-fallback-matrix.test.ts`                                          |
| `pr149_condition_diag_matrix_invalid.asm`  | Condition operand/form diagnostics | pr149 matrix test | `test/integration/pr149-condition-diag-matrix.test.ts`                                                   |
| `pr211_jr_djnz_diag_matrix_invalid.asm`    | JR/DJNZ invalid targets            | pr211 matrix test | `test/integration/pr211-jr-djnz-diag-matrix.test.ts` + `test/unit/z80/pr211-jr-djnz-diag-matrix.test.ts` |
| `pr56_isa_misc.asm`, `pr57_isa_im_rst.asm` | Misc / IM / RST                    | isa tests         | asm80 artifact                                                                                           |
| `pr123_isa_alu_a_core.asm`                 | ALU A-core                         | isa tests         | asm80 artifact                                                                                           |

**No new push/pop/ret-cc fixtures were required** for P1—the gaps were in the **emitter**, not missing golden `.asm` files. P1 added **inline source** cases in `lowered-asm80-artifact.test.ts` for push/pop/ret-cc.

---

## 3. Next tests that do not exercise `emitAsm80`

| Test                                                    | What it compares                                    | emitAsm80 exercised?                                            |
| ------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `test/differential/root-fixture-corpus.test.ts`         | Current vs Next **binBytes**, hex, diagnostics      | **No** (`compareRunResults` default)                            |
| `test/differential/fixture-corpus.test.ts`              | Differential dir fixtures                           | **No** (unless extended)                                        |
| `test/differential/artifact-corpus.test.ts`             | Listing/d8 sidecars                                 | **No**                                                          |
| `test/integration/real-program-parity.test.ts`          | Real program BIN                                    | **No**                                                          |
| `test/asm80/*_acceptance.test.ts`                       | External asm80 vs AZM **hex** from AZM compile path | Indirect (validates AZM output assembled; not `emitAsm80` text) |
| `test/differential/lowered-asm80-artifact.test.ts`      | asm80 **text** vs legacy oracle emitter             | **Yes** (primary Next asm80 gate)                               |
| `scripts/dev/check-asm80-lowering-coverage.mjs`         | All fixtures, fail on `AZMN_ASM80`                  | **Yes** (script, not Vitest)                                    |
| `test/asm80/emit_asm80_real_program_acceptance.test.ts` | No `AZMN_ASM80` on MON3/Tetro/Pacmo                 | **Yes** (opt-in)                                                |

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

| Gate                  | Oracle-era                           | Next pre-P1                                 |
| --------------------- | ------------------------------------ | ------------------------------------------- |
| Alpha guardrails      | asm80 directive tests in oracle repo | `test:azm:alpha` → unit + integration only  |
| Next guardrails       | N/A                                  | `next:diff-current:all` → **bin** parity    |
| asm80 coverage script | N/A (added Phase 0)                  | Documented but **not** in `next:guardrails` |
| pr990                 | In oracle test tree                  | Missing                                     |

### 4.5 Real-program acceptance scope

`mon3_acceptance` / `tetro_acceptance` validate **assembled machine code**, not the `--asm80` artifact. `emit_asm80_real_program_acceptance` is the correct lane but was **skipped by default** in CI and local `npm test`.

---

## 5. Promotion list (ordered)

All items below are **done** as of May 2026.

### Tier 1 — would have caught the asm80 disaster (port first)

1. **`pr990` external round-trip** → `test/differential/asm80-external-roundtrip.test.ts`. **Done.**
2. **Wire `check:asm80-coverage`** into `next:guardrails:core` and CI. **Done** (90 fixture files pass).
3. **Expand `lowered-asm80-artifact`** with push/pop/ret-cc/ld-indexed inline cases. **Done** (P1 remediation branch).
4. **`emit_asm80_real_program_acceptance`** — MON3/Tetro/Pacmo all pass; CI runs them when sources present. **Done.**

### Tier 2 — high value, medium effort

5. **`pr991_asm80_comment_preservation`** → `test/asm80/asm80_comment_preservation.test.ts`. **Done.**
6. **`pr203_ld_diag_matrix`** → integration fixture matrix + parse-level unit matrix. **Done** (PRs #175–#176).
7. **`asm80/mon3_opcode_gap`** → `test/asm80/mon3_opcode_gap.test.ts`. **Done.**
8. **Oracle asm80 directive suite** → `test/asm80/asm80_align_directive.test.ts`, `asm80_equ_aliases.test.ts`, `asm80_string_directives.test.ts`, `asm80_directives_integration.test.ts`. **Done.**

### Tier 3 — general parity (not asm80-specific)

9. Backend `pr477_encode_*` family tests → `test/unit/z80/parser-encoder.test.ts`. **Done** (all six families: core_ops, ld, alu, bitops, control, io).
10. CLI contract tests → cli_artifacts, cli_determinism_contract, cli_path_parity_contract, cli_azm_smoke, cli_acceptance_matrix_strictness, register_care_cli. **Done.**
11. Register-care tests from oracle `registerCare/` → ported (unit + integration + tooling). **Done** (PR #173).

### Not recommended to port verbatim

- **`pr1048_write_asm80_unit.test.ts`** — targets removed `LoweredAsmProgram` API; `lowered-asm80-artifact` + fixture sweep covers the equivalent Next surface.
- **Bulk `pr129`–`pr143` copy** — do not port the range blindly. PRs #178–#184 ported the highest-value matrices; **~20+ ISA matrix files** remain PORT per full audit (§ 8). Port each file only when § 10 checklist shows a coverage gap.

---

## 6. Top 10 missing tests/fixtures (summary table)

All items resolved as of May 2026.

| #   | Item                                        | Type        | Status                                                                      |
| --- | ------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| 1   | `pr990_asm80_emitter_validation`            | Test        | **Done** — `test/differential/asm80-external-roundtrip.test.ts`             |
| 2   | `check:asm80-coverage` in guardrails        | Gate        | **Done** — passes (90 files); wired into `test:ci:asm80-parity`             |
| 3   | root-fixture-corpus asm80 mode              | Test        | **Done** — 16 parity + 16 intentional-exclusions accounted; 55 compile-fail |
| 4   | `pr1048` lowered-IR unit tests              | Test        | **Not portable** — `LoweredAsmProgram` API removed; Next surface covered    |
| 5   | `pr203_ld_diag_matrix` runner               | Test        | **Done** — integration + unit parse matrix (PRs #175–#176)                  |
| 6   | `asm80/*` directive integration (5 files)   | Test        | **Done** — `test/asm80/` contains all 5 directive test files                |
| 7   | `mon3_opcode_gap`                           | Test        | **Done** — `test/asm80/mon3_opcode_gap.test.ts`                             |
| 8   | `pr991` comment preservation                | Test        | **Done** — `test/asm80/asm80_comment_preservation.test.ts`                  |
| 9   | `pr477_encode_ld_family` / push-pop encoder | Test        | **Done** — all six encoder families in `parser-encoder.test.ts`             |
| 10  | Default-on real-program asm80 acceptance    | Test policy | **Done** — all three programs pass; CI runs them when sources present       |

**Fixtures:** no oracle-only `.asm` files were missing from the start; gaps were test wiring, not fixture files.

---

## 7. Recommended CI / release gates (active)

These are the gates currently enforced in GitHub Actions CI (Linux):

```sh
npm run build
npm run test:ci:coverage-core
npm run test:ci:asm80-parity   # coverage (90 files) + external round-trip + real-program acceptance
npm run next:guardrails:core
```

Real-program acceptance (MON3/Tetro/Pacmo) runs automatically inside `test:ci:asm80-parity`
when local sources are present; it is skipped in GitHub Actions CI because the source
repos are not committed. Maintainers can wire `MON3_SOURCE` / `TETRO_SOURCE` / `PACMO_SOURCE`
as secrets to enforce acceptance in remote CI.

---

## 8. Current increment status

### Completed (feature + asm80 gates)

- P1 asm80 remediation (§§ 5–6): external round-trip, `check:asm80-coverage`, real-program
  emitAsm80 when sources present, wired in `test:ci:asm80-parity`.
- ISA diagnostic matrix subset **pr144–pr151**, **pr203**, **pr211**, **pr1140** (PRs #178–#184).

### Full oracle audit snapshot (149 files)

| Verdict         | Count | Meaning                                            |
| --------------- | ----: | -------------------------------------------------- |
| **SKIP**        |    59 | Ported or truly redundant with Next tests          |
| **PORT**        |    44 | Next weaker; port when starting that area          |
| **DEFER**       |    36 | P2; partial coverage acceptable for now            |
| **DO NOT PORT** |    10 | Legacy API (`LoweredAsmProgram`, lowering helpers) |

**Coverage heatmap (honest):**

| Area       | Oracle vs Next                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------- |
| **Strong** | CLI, register-care, asm80 directives, pr477/pr1140, pr144–pr151/pr203/pr211, pr202–pr210/pr225 |
| **Weak**   | pr132/pr136/pr137/pr126 (residual ISA), `examples_compile`                                     |
| **Risk**   | Green `next:diff-current:all` ≠ per-mnemonic matrices; corpus-only invalid fixtures            |

### Completed increment — Task 9a control-flow / I/O matrices

**Goal:** close the largest **ISA control-flow / I/O diagnostic** gap without bulk-copying oracle tests.

| Oracle test                                    | Fixture                                                    | Next test (merged)                                                      |
| ---------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pr207_jp_indirect_legality_diag_matrix`       | `pr207_jp_indirect_legality_diag_matrix_invalid.asm`       | `test/integration/pr207-jp-indirect-legality-diag-matrix.test.ts`       |
| `pr208_call_indirect_legality_diag_matrix`     | `pr208_call_indirect_legality_diag_matrix_invalid.asm`     | `test/integration/pr208-call-indirect-legality-diag-matrix.test.ts`     |
| `pr209_jp_cc_indirect_legality_diag_matrix`    | `pr209_jp_cc_indirect_legality_diag_matrix_invalid.asm`    | `test/integration/pr209-jp-cc-indirect-legality-diag-matrix.test.ts`    |
| `pr210_jp_call_condition_vs_imm_diag_matrix`   | `pr210_jp_call_condition_vs_imm_diag_matrix_invalid.asm`   | `test/integration/pr210-jp-call-condition-vs-imm-diag-matrix.test.ts`   |
| `pr206_in_out_indexed_reg_diag_matrix`         | `pr206_in_out_indexed_reg_diag_matrix_invalid.asm`         | `test/integration/pr206-in-out-indexed-reg-diag-matrix.test.ts`         |
| `pr202_add_diag_matrix`                        | `pr202_add_diag_matrix_invalid.asm`                        | `test/integration/pr202-add-diag-matrix.test.ts`                        |
| `pr204_adc_sbc_diag_matrix`                    | `pr204_adc_sbc_diag_matrix_invalid.asm`                    | `test/integration/pr204-adc-sbc-diag-matrix.test.ts`                    |
| `pr225_indexed_rotate_destination_diag_matrix` | `pr225_indexed_rotate_destination_diag_matrix_invalid.asm` | `test/integration/pr225-indexed-rotate-destination-diag-matrix.test.ts` |

**Not in 9a:** `examples_compile` (deferred).

**Heatmap update:** pr202–pr210/pr225 moved from **Weak** toward **Strong** for control-flow / ALU
pair / I/O indexed / indexed-rotate diagnostics.

### Completed increment — Task 9b arity / register-target matrices

| Oracle test                               | Fixture                                       | Next test (merged)                                                      |
| ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `pr129_isa_ed_zero_operand_diag`          | `pr129_isa_ed_zero_operand_invalid.asm`       | `test/integration/pr129-ed-zero-operand-diag-matrix.test.ts`            |
| `pr130_isa_inout_im_rst_arity_diag`       | `pr130_isa_inout_im_rst_arity_invalid.asm`    | `test/integration/pr130-inout-im-rst-arity-diag-matrix.test.ts`         |
| `pr131_isa_zero_operand_core_diag`        | `pr131_isa_zero_operand_core_invalid.asm`     | `test/integration/pr131-zero-operand-core-diag-matrix.test.ts`          |
| `pr133_arity_diag_matrix`                 | `pr133_arity_diag_matrix_invalid.asm`         | `test/integration/pr133-arity-diag-matrix.test.ts`                      |
| `pr134_alu_arity_diag`                    | `pr134_alu_arity_diag_invalid.asm`            | `test/integration/pr134-alu-arity-diag-matrix.test.ts`                  |
| `pr240_isa_register_target_diag_matrix`   | `pr240_isa_register_target_diag_matrix_invalid.asm` | `test/integration/pr240-register-target-diag-matrix.test.ts`        |

**Heatmap update:** pr129–pr131/pr133/pr134/pr240 moved toward **Strong**; pr132/pr136/pr137/pr126,
layout, includes remain **Weak**.

### Completed increment — Task 9c layout / semantics

| Oracle test / area              | Next test (merged)                                           |
| ------------------------------- | ------------------------------------------------------------ |
| `pr769_layout_cast_parser`      | `test/unit/syntax/pr769-layout-cast-parser.test.ts`          |
| `env_edge_cases` (subset)       | `test/integration/layout-semantics-env-edge-cases.test.ts`   |
| Stage 7 layout (existing)       | `test/integration/minimal-assembler-stage7-layout.test.ts`   |

**Heatmap update:** layout/semantics moved toward **Strong**; includes and `examples_compile` remain **Weak**.

### Completed increment — Task 9d includes (pr950)

| Oracle test                  | Next test (merged)                                    |
| ---------------------------- | ----------------------------------------------------- |
| `pr950_include_text_only`    | `test/integration/pr950-include-text-only.test.ts`    |

**Heatmap update:** includes moved toward **Strong**; `examples_compile` remains **Weak**.

### Active increment (next PR)

**Preferred:** `examples_compile` integration test; production gate verification; stale doc refresh.

Before opening any port PR, run the checklist in § 10.

Work note: `docs/next/work/oracle-coverage-next-increment.md` (update status when starting 9c).

---

## 9. References

- Oracle pr990: `legacy-root-azm/test/cli/pr990_asm80_emitter_validation.test.ts`
- Next asm80 artifact tests: `test/differential/lowered-asm80-artifact.test.ts`
- Coverage script: `scripts/dev/check-asm80-lowering-coverage.mjs`
- P1 emitter fixes: `src/outputs/write-asm80.ts`
- Intentional asm80 text exclusions: `test/differential/asm80-corpus-policy.ts`

---

## 10. P1 port policy (coverage-gap driven)

**Default question for every oracle file:** _Is this area tested as well in Next as in Oracle?
Would a Next port add resilience?_

This is the same question as **Oracle test depth** in
`docs/next/work/code-quality-production-readiness-review.md` and the **Path to release** table in
`docs/next/plan.md`. Green CI on bin/differential corpus does not satisfy it.

**Do not blindly port** all of `pr129`–`pr143` or ~100 remaining oracle tests (~44 are PORT
candidates from the full audit; ~59 SKIP; ~36 DEFER; ~10 DO NOT PORT). **Do port** when Next has
a **coverage gap** (Y or M in the audit), especially where only differential corpus parity exists.

### Green CI is not feature coverage

| Signal                                     | What it proves                                     | What it does **not** prove                   |
| ------------------------------------------ | -------------------------------------------------- | -------------------------------------------- |
| `next:diff-current:all`                    | Next matches **current** AZM on supported fixtures | Intended oracle diagnostic contracts         |
| `root-fixture-corpus` on invalid `.asm`    | Exit code + full diagnostic text vs current AZM    | Per-line matrix for each illegal form        |
| Fixture present in `test/fixtures/`        | Source exists for differential                     | Integration test owns every asserted message |
| `lowered-asm80-artifact` vs legacy emitter | Text matches legacy lowered output                 | Externally valid asm80 (symmetric bugs)      |

### Port when (PORT)

1. **Coverage gap** — audit marks **Y** (Next weaker) or **M** with no `test/integration/pr*-diag-matrix`
   (or equivalent) asserting the same cases as the oracle file.
2. **Emitted artifact** — asm80 external round-trip, listing shape, D8 segment keys, etc., not
   already gated in `test:ci:asm80-parity` or artifact writers.
3. **User-facing language feature** — includes, layout-cast, enums, visible `op`, control-flow
   legality — where stage tests are thinner than the oracle matrix.
4. **Regression would be silent** — e.g. illegal `jp (ix)` accepted; only bin parity would not fail.

**Port pattern:** one `test/integration/prNNN-*-diag-matrix.test.ts` per oracle matrix (reuse
`test/fixtures/*_invalid.asm`), matching PRs #178–#184 — **not** a mechanical copy of oracle
helper imports.

### Skip when (SKIP)

- Path-equivalent Next test with **same assertions** (CLI, register-care, pr203/pr211, pr477, etc.).
- Behaviour already in `test/integration/pr145`–`pr151` with **no extra oracle cases** left.

### Do not port verbatim (DO NOT PORT)

- `LoweredAsmProgram`, legacy `writeAsm80(LoweredAsmProgram)`, `lowered_asm_sync_patch`, lowering
  helper unit tests (`pr504`, `pr510_*`, `pr528`, `pr530`, `pr474_*`). Re-target to Next
  `SourceItem` / `compileNext` / `write-asm80.ts` surfaces.

### Defer when (DEFER)

- P2 helper granularity (`pr476_parse_*`), CI classifier scripts, encoder dispatch wiring — unless
  blocking a user-visible bug.
- Corpus + asm80 artifact only (**M**), no message matrix — schedule when touching that ISA family.

### Anti-patterns (do not use as skip reasons)

- “~100 oracle tests remain” → not a reason to skip a **PORT** row.
- “pr129–pr143 mostly done” → **pr202–pr210, pr225, pr240, pr129–pr137** still corpus-only.
- “Fixture in corpus” → **not** “test ported”.
- “Diagnostic wording only” → only skip if an existing Next test lists **every** oracle-asserted case.

### Evaluation checklist (every port PR)

1. Read the oracle file; list each `expectDiagnostic` / byte assertion.
2. Search `test/` — is there a test that would fail if one of those cases broke?
3. If only `root-fixture-corpus` covers the fixture, treat as **gap → PORT**.
4. Legacy API? → DO NOT PORT; design Next-native test.
5. Update § 8 and `test/fixtures/coverage-map.md` with the owning Next test path.

### Asm80 release / CI policy

These belong in normal CI, not optional maintainer-only runs:

- `check:asm80-coverage` (no `AZMN_ASM80` on fixture sweep)
- `test/differential/asm80-external-roundtrip.test.ts` (asm80 CLI installed in
  `scripts/ci/run-asm80-parity.mjs` when missing)
- `test/differential/root-fixture-corpus-asm80.test.ts`
- `test/asm80/emit_asm80_real_program_acceptance.test.ts` when MON3/Tetro/Pacmo sources exist

Bundled as `npm run test:ci:asm80-parity` on Linux. Real-program repos may stay secret-backed in
GitHub Actions; local/CI with sources should not rely on env opt-in alone for release confidence.
