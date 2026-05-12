# Spec Consolidation Plan

## Purpose

This note proposes how to simplify the active ZAX documentation set so an
external reviewer can understand the current language without being forced to
infer which documents are current, which are historical, and which belong to
the rolled-back `addr` direction.

This is not a normative language document. It is an editorial and planning note
for the current cleanup pass.

Status note: GitHub PR #759 completes Phase 1 items 1-6 of this plan. Items
7-12 remain future work.

## Direction to lock in

The cleanup should proceed from these language-direction assumptions:

1. The current direct typed-`ld` surface is the active core of the language.
2. The rolled-back `addr` / ops-first direction is not the active path forward.
3. Parser/grammar convergence is back on the active track.
4. Typed reinterpretation syntax `<Type>base.tail` is intended future language
   work and should be designed as an additive feature on top of the current
   surface, not as part of an `addr` reintroduction.

## Current problems

### 1. The active doc set is too large for review

A reviewer currently has to reconcile:

- `README.md`
- `docs/spec/zax-spec.md`
- `docs/spec/zax-grammar.ebnf.md`
- `docs/reference/ZAX-quick-guide.md`
- `docs/work/current-stream.md`
- `docs/work/deferred-work.md`
- multiple addressing design notes under `docs/design/`

That is too much active surface for a project that is trying to present a
stable current language.

### 2. The spec still mixes current rules with future-direction framing

`docs/spec/zax-spec.md` still contains forward-direction material, including
archive references and transitional wording about v0.5 direction. That weakens
its role as a stable normative source.

### 3. Rolled-back addressing material still looks too active

These documents exist now as retired archive material:

- `docs/archive/design/ops-first-addressing-direction.md`
- `docs/archive/design/ops-first-addressing-decisions.md`
- `docs/archive/design/addr-prereq-decisions.md`

They may still be valuable as historical design records, but they currently sit
beside genuinely active design work and make the doc set look undecided.

### 4. Work docs still reflect pre-cleanup assumptions

`docs/work/current-stream.md` and `docs/work/deferred-work.md` still frame some
items in terms of `addr` sequencing or retired review assumptions.

### 5. The quick guide and spec are carrying too much overlap

The current quick guide is useful, but it also contains enough detail that the
boundary between tutorial/reference and normative language rules is not obvious
at first glance.

## Target active doc set

The active docs should be split into a very small core plus a small set of contributor references.

### Core reviewer-facing set

- `README.md`
- `docs/spec/zax-spec.md`
- `docs/spec/zax-grammar.ebnf.md`
- `docs/reference/ZAX-quick-guide.md`

### Contributor/reference docs

- `docs/reference/addressing-model.md`
- `docs/reference/source-overview.md`
- `docs/reference/testing-verification-guide.md`
- `docs/reference/zax-dev-playbook.md`
- `docs/reference/github-backlog-workflow.md`

### Active design docs

- `docs/design/grammar-parser-convergence-plan.md`
- `docs/design/type-system-reform-plan.md`
- a future `docs/design/typed-reinterpretation-cast.md` for `LANG-02`

These should be treated as temporary planning scaffolding, not permanent parallel authorities. The long-term goal is to absorb their accepted content into the privileged spec/reference layer and archive the plans.

Everything else should either be archived or clearly marked as non-current.

## Proposed consolidation actions

### A. Make the spec fully present-tense and current-surface only

`docs/spec/zax-spec.md` should be rewritten to describe only the language that
is current or explicitly accepted for imminent implementation.

Spec cleanup goals:

- remove or sharply reduce forward-direction sections
- stop treating archive docs as active semantic anchors
- describe the current section/module model without mixing in migration history
- avoid wording that suggests the language center is still under reconsideration

### B. Narrow the role of the quick guide

`docs/reference/ZAX-quick-guide.md` should be treated as:

- tutorial
- compact user reference
- worked examples for the current language

It should not read like a second spec and should not carry retired direction
signals.

### C. Move retired addressing direction docs out of active design

These should remain archived and be referenced only as historical context:

- `docs/archive/design/ops-first-addressing-direction.md`
- `docs/archive/design/ops-first-addressing-decisions.md`
- `docs/archive/design/addr-prereq-decisions.md`

### D. Clean up work docs so they match the new direction

`docs/work/current-stream.md` should say:

- direct typed-`ld` is the active language surface
- parser/grammar convergence is active
- documentation consolidation is active
- `LANG-02` is intended future additive language work

`docs/work/deferred-work.md` should stop describing `<Type>base.tail` as
blocked on `addr`.

### E. Introduce one focused design doc for `LANG-02`

Instead of scattering the cast discussion across old addressing notes, create a
single active design doc dedicated to typed reinterpretation.

That document should answer:

1. What counts as a valid `base` in v1?
2. Is the feature defined only for effective-address-style bases, or for any
   16-bit value expression?
3. How does `<Type>base.tail` compose with field access, indexing, and nested
   casts?
4. What is deliberately out of scope for v1?

## Proposed sequence

### Phase 1: stabilize the documentation set

1. Clean `docs/spec/zax-spec.md`
2. Clean `docs/reference/ZAX-quick-guide.md`
3. Update `docs/work/current-stream.md`
4. Update `docs/work/deferred-work.md`
5. Reframe `docs/reference/addressing-model.md` as an implementation reference that is intended to become a privileged machine-checked lowering reference
6. Archive the retired addressing-direction docs

### Phase 2: define the cast feature cleanly

7. Write `docs/design/typed-reinterpretation-cast.md`
8. Refresh GitHub issue `#736 (LANG-02)` again if needed so it points only to
   that doc
9. Review grammar impact in `docs/spec/zax-grammar.ebnf.md`

### Phase 3: promote once design is settled

10. Add the accepted cast syntax to `docs/spec/zax-spec.md`
11. Update the quick guide with examples
12. Create the implementation ticket(s)

## What an external reviewer should be told to read

After consolidation, the recommended review path should be:

1. `README.md`
2. `docs/spec/zax-spec.md`
3. `docs/spec/zax-grammar.ebnf.md`
4. `docs/reference/ZAX-quick-guide.md`
5. Only then, selected contributor references or design docs if needed

That keeps the core language understandable without forcing the reviewer through
historical detours.

## Recommendation

Proceed with a docs-first stabilization pass before starting `LANG-02`
implementation work.

The practical reason is not that the language is unsettled. It is the opposite:
the language is stable enough now that the documentation should stop reading as
if the central direction is still up for debate.
