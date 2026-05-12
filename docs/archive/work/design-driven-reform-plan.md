# Design-Driven Reform Plan

Status: active planning note

## Goal

Make the compiler an implementation of the language documents, rather than a separate handwritten interpretation that can drift from them.

This does **not** mean "make markdown executable". It means:

- keep a human-readable spec for reviewers
- introduce a structured machine-readable spec layer
- make parser/lowering/test code consume that structured layer
- generate or verify doc fragments from the same structured layer

## Problem

Today the repo has several descriptive artifacts that are useful but not authoritative in code:

- the grammar/EBNF material
- `docs/reference/addressing-model.md`
- parts of the quick guide and source overview

The code then re-expresses the same rules in separate handwritten forms:

- parser keyword and precedence tables
- structured-control parsing logic
- addressing step builders and templates
- lowering routing logic
- matrix tests that restate expected outputs

This is workable, but it produces the same failure mode in multiple places: the docs and code can both be "right once" and then drift apart.

## Authority Model

We should use a three-layer authority model.

### 1. Narrative spec

Human-facing, reviewable, stable language description.

Primary file:

- `docs/spec/zax-spec.md`

Purpose:

- language semantics
- visible syntax
- static rules
- observable lowering guarantees only where they are part of the language contract

### 2. Structured spec data

Machine-readable definitions used by code, tests, and generated doc fragments.

Proposed home:

- `src/specdata/grammar/*`
- `src/specdata/addressing/*`

Purpose:

- token/keyword sets
- precedence tables
- parser production descriptors where feasible
- addressing step inventory
- addressing builder definitions
- routing matrices
- invariants such as preservation guarantees and legal register classes

### 3. Implementation

Parser, lowering, emitter, and tests consume the structured spec-data layer.

Purpose:

- execute the language
- report diagnostics
- emit code
- prove conformance to the spec-data layer

## Privileged References

The end state should not be "many equal documents". It should be a small core plus a small privileged reference layer.

### Reviewer-facing core

- `README.md`
- `docs/spec/zax-spec.md`
- `docs/spec/zax-grammar.ebnf.md`
- `docs/reference/ZAX-quick-guide.md`

### Privileged machine-oriented references

These are the documents developers should be able to consult when they need the exact accepted shape of the language or lowering model:

- `docs/spec/zax-grammar.ebnf.md` for syntax shape
- `docs/reference/addressing-model.md` for step-driven lowering shape

These should eventually be backed by structured spec-data and mechanical drift checks, not treated as loose prose companions.

### Temporary design scaffolding

Documents such as `docs/design/grammar-parser-convergence-plan.md` exist to get us from the current handwritten state to the privileged-reference state. They should not become permanent parallel authorities.

## What Should Become Data

### Grammar

Current seed:

- `src/frontend/grammarData.ts`

This should be read together with `docs/design/grammar-parser-convergence-plan.md`, which is already the active plan for moving grammar out of scattered parser switches and into a shared data layer. The important strategic point is that grammar and addressing should follow the same pattern, not two separate philosophies.

This should grow into the canonical structured grammar-data module for:

- top-level keywords
- statement keywords
- register classes
- condition codes
- operator precedence
- matcher names
- scalar-type shapes

It should then drive:

- parser dispatch tables
- parser validation tables
- EBNF/reference fragments where practical
- parser conformance tests

Important limit:

We do **not** need to generate the full parser from EBNF immediately. A handwritten parser that consumes structured grammar data is already a large improvement.

### Addressing model

Current seed:

- `src/lowering/steps.ts`

This should deliberately mirror the grammar strategy: a privileged addressing reference, a structured data layer behind it, and code that validates against that layer instead of drifting beside it.

This is already close to the right shape. It has:

- a typed step instruction vocabulary
- composable builder functions
- template functions
- a rendering layer used by tests
- an execution layer in `src/lowering/emissionCore.ts`

The next reform step is to stop treating the handwritten functions as the only source of truth.

Instead, define:

- step op inventory
- builder definitions
- template definitions
- routing matrix
- preservation contract

as structured data, then build the convenience functions on top of that data.

For example:

- `ADDR.STEP.LOAD_BASE_GLOB`
- `ADDR.BUILDER.EA_GLOB_CONST`
- `ADDR.BUILDER.EAW_GLOB_CONST`
- `ADDR.TEMPLATE.L_ABC`
- `ADDR.ROUTE.byte.abs.indexReg8 -> EA_GLOB_REG`

Then:

- the doc examples are rendered from the same definitions
- the matrix tests are generated or at least checked from the same definitions
- lowering chooses from named builder/template IDs instead of duplicating the routing rules in ad hoc switch code

## What Should Stay Handwritten

Not everything should become declarative.

These parts should remain handwritten:

- parser recovery behavior
- higher-level lowering control flow
- diagnostics wording
- Z80 encoding and fixup emission
- semantic analysis

But they should consume spec-data instead of restating the same rules.

## Recommended Target Architecture

### A. Grammar path

1. Expand `grammarData.ts` into a canonical grammar-data layer.
2. Refactor parser entry points to use table-driven dispatch where possible.
3. Generate or verify selected grammar/reference fragments from grammar-data.
4. Add drift tests that fail if parser tables and exported grammar data disagree.
5. Once that path is mature, reduce the need for separate grammar-planning docs by promoting the grammar file itself into the privileged reference position.

### B. Addressing path

1. Reframe `docs/reference/addressing-model.md` as an implementation reference, not a normative language spec.
2. Extract structured addressing definitions into `src/specdata/addressing/`.
3. Build `src/lowering/steps.ts` exports from those definitions.
4. Keep `src/lowering/emissionCore.ts` as the interpreter that turns `StepInstr` into emitted instructions.
5. Refactor `src/lowering/addressingPipelines.ts` so routing comes from a table/matrix rather than open-coded branching.
6. Generate or verify the addressing-model doc and matrix tests from the same definitions.
7. Once that path is mature, reduce the need for separate addressing-planning docs by treating the addressing model reference as the privileged lowering description.

## Conformance Strategy

Every structured spec item should have a stable ID.

Examples:

- `GRAMMAR.CC`
- `GRAMMAR.SELECT_CASE_ITEM`
- `ADDR.BUILDER.EA_GLOB_CONST`
- `ADDR.TEMPLATE.LW_HL`

Then use those IDs in:

- tests
- generated doc sections
- diagnostic comments in code
- issue/plan references where useful

This makes it possible to say:

- this PR changes `ADDR.BUILDER.EAW_GLOB_CONST`
- the doc fragment and matrix tests are regenerated from that item
- the emitted lowering still conforms

## CI Rules

To make this real, CI needs drift checks.

Recommended checks:

- generated grammar fragments are up to date
- generated addressing-reference fragments are up to date
- matrix tests cover every declared addressing builder/template
- parser tables use only declared grammar atoms
- lowering routing tables cover every declared supported addressing family

If any of those fail, the branch is not allowed to merge.

## Why This Is Better Than Purely Handwritten Code

It preserves the good part of the current system:

- readable handwritten implementation
- explicit lowering logic
- strong golden tests

while removing the main weakness:

- the same rule being manually maintained in docs, code, and tests

This is especially important for handwritten codegen. Handwritten lowering is fine. Handwritten lowering plus handwritten prose plus handwritten matrix expectations for the same rule is where drift starts.

## Why This Is Better Than Making Markdown The Source Of Truth

Markdown is good for reviewers and bad for compilers.

If we try to make prose markdown the executable source of truth, we will get:

- brittle parsers for our own docs
- artificial restrictions on how we write explanatory text
- unclear ownership between prose and code

The right split is:

- prose explains the design
- structured spec-data codifies the design
- implementation executes the codified design

## Suggested Rollout

### Phase 1: authority cleanup

- make `docs/spec/zax-spec.md` the clear narrative authority
- demote `docs/reference/addressing-model.md` from normative to implementation reference
- keep the reviewer-facing core small and stable
- keep only active design docs in `docs/design/`

### Phase 2: grammar codification

- promote grammar-data to a canonical structured layer
- continue table-driven parser cleanup
- add doc-fragment generation or verification for grammar/reference material

### Phase 3: addressing codification

- create structured addressing definitions
- refactor step builders/templates to derive from those definitions
- add generated or checked addressing reference fragments
- add full coverage drift tests for routing matrices

### Phase 4: new language work

Once grammar and addressing are back on a design-driven footing, add new surface features such as typed reinterpretation syntax from a stronger base.

That is the right point to advance `LANG-02`.

## Immediate Next Actions

1. Keep the active core doc set small enough that an external reviewer can understand the language without reading planning notes.
2. Continue parser convergence on the grammar-data path rather than adding more handwritten parser islands.
3. Hand off the first structured addressing-spec-data slice to a developer rather than implementing it from the designer track.
4. Add regeneration/check work only after the privileged doc set has been reduced and clarified.

## Decision

The repo should move to a design-driven model, but through a structured spec-data layer, not by treating markdown alone as executable authority.
