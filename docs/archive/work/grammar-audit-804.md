# GitHub issue #804 — Grammar vs Parser Audit

Audit scope:
- Grammar: `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/docs/spec/zax-grammar.ebnf.md`
- Parser: `src/frontend/**`

## Summary
This audit identifies concrete mismatches where the grammar is stale or the parser accepts/forbids forms not represented by the grammar. The emphasis is on high‑impact user‑visible syntax and areas that already have recent changes (move, address‑of, raw data, labels, imm literals).

## Mismatch table

| Area / production | Grammar says | Parser does | Classification | Recommended action |
|---|---|---|---|---|
| Instruction head: `move` | No `move` instruction head is defined (only `z80_instruction` / `op_invoke` / `func_call`). | `parseAsmInstruction` treats `move` as a first‑class head and routes it through `parseMoveInstruction`. | grammar stale | Add `move` to the grammar’s instruction heads (likely a `move_stmt` production) and note operand shape. |
| Address‑of `@path` | No `@` prefix form in `ea_expr` or operand grammar. | Parser accepts `@path` **only** in `move` source operand, via `explicitAddressOf` on `Ea`. Rejects elsewhere. | grammar stale + semantic-only restriction | Add `@path` as a `move`‑only operand in grammar; keep restriction explicit as semantic-only if desired. |
| Raw data directives (`db/dw/ds`) | Not present in grammar at all. | Parser supports raw directives **inside `section data` only** with labeled forms. | grammar stale | Add `raw_data_decl` (with `db/dw/ds`) under `section_item` and make the section‑data restriction explicit in grammar notes. |
| Raw data labels in `section data` | No raw label form defined. | Parser accepts bare `label:` inside `section data` as a pending raw label. | grammar stale | Add `raw_label` production under `data` section items (or describe as a prefix to raw data decl). |
| Asm labels in function/op bodies | Grammar only allows `local_label = "." identifier ":"` | Parser accepts **bare** `label:` lines in `func` and `op` bodies (no leading dot). | parser over‑accepts **or** grammar stale (depending on spec) | Decide: either update grammar/spec to allow bare labels or tighten parser to dot‑labels only. |
| Immediate literals: char literal | Grammar `imm_primary` has int/hex/identifier/enum_ref but no char literal. | Parser tokenizes single‑quoted char literals (e.g. `'A'`) into immediates. | grammar stale | Add `char_lit` to `imm_primary`. |
| Immediate names: dotted identifiers | Grammar only allows `enum_ref = identifier "." identifier`. | Parser accepts dotted names with **multiple** segments as `ImmName` (e.g. `mod.ns.VALUE`). | grammar stale | Expand grammar `imm_primary` to allow dotted identifiers beyond two‑segment enum refs, or explicitly define `qualified_name`. |
| Section items: `data` block vs direct decls | Grammar allows `data_section_block` inside `section` as a nested `data` block. | Parser allows direct `data_decl` inside named `section data`, and also supports raw directives; nested `data` block behavior is more limited. | grammar stale / ambiguous | Clarify grammar to reflect that named `section data` uses direct `data_decl` (and raw directives), and state whether nested `data` blocks are still legal. |
| `ld` typed‑storage forms | Grammar does not distinguish typed storage vs raw operands in `ld`. | Parser accepts typed storage operands syntactically but lowerer now rejects them with diagnostics (MOVE‑04). | semantic-only restriction | Add a semantic restriction note in grammar or spec: typed storage operands in `ld` are rejected; `move` is required. |

## Top 5 highest‑value mismatches (for GitHub issue #805)
1. Add `move` instruction head + operand shape to grammar.
2. Add `@path` address‑of form (move‑only) to grammar.
3. Add `db/dw/ds` raw data directives + raw labels in `section data` to grammar.
4. Decide on bare asm labels vs dot‑labels and align grammar or parser accordingly.
5. Add char literal + multi‑segment qualified names to `imm_primary` grammar.

## Notes
- This audit does **not** change parser behavior.
- Where a mismatch is a deliberate semantic restriction (e.g. `ld` typed‑storage rejection), the action is to document it explicitly rather than to relax the parser.
