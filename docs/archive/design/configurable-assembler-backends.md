# Configurable Assembler Output Backends

Status: historical design brief — implementation complete. The `.asm` trace backend has been fully removed; `.z80` is now the only textual lowered-output artifact.
Audience: compiler contributors, reviewers

## Purpose

ZAX already lowers structured ZAX source into a concrete stream of Z80 instructions,
labels, data layout, and synthetic scaffolding. It already emits direct binary artifacts
(`.bin`, `.hex`) and a human-readable lowered `.asm` trace.

This note defines the next step:

- keep direct object-code emission as a supported backend
- add a second class of backend that emits **assembler-valid lowered source**
- keep that assembler-source backend **dialect-configurable**, with ASM80 as the first target

The important point is that ZAX still performs the language work.

ZAX remains responsible for:

- parsing
- storage and type semantics
- structured lowering
- synthetic labels and helper instruction sequences
- frame/layout decisions
- constant folding and fixup planning

The assembler backend only serializes the fully lowered result into a concrete assembler dialect.

## Why this is worth doing

A valid lowered assembler file has practical value beyond the current trace output.

It gives users:

- an inspectable conventional assembly artifact
- a migration path into existing assembler toolchains
- a way to keep user comments and names visible in the lowered result
- a concrete source file that can be assembled by external tools such as ASM80

It also gives ZAX a second verification path:

- `ZAX -> direct machine code`
- `ZAX -> lowered assembler -> external assembler -> machine code`

Those two outputs can be compared in tests.

## Non-goals

This design does **not** make ZAX a thin syntax wrapper around a downstream assembler.

Specifically:

- ZAX does not delegate structured semantics to ASM80
- ZAX does not stop producing direct binary output
- the external assembler is not the authoritative definition of ZAX correctness
- the current lowered trace file is not silently redefined into a dialect backend without a new contract

## Current state

Today ZAX has:

- direct binary emission
- direct Intel HEX emission
- a deterministic lowered `.asm` trace

The current `.asm` trace is useful for inspection, but it is not designed as a real assembler backend.
It is currently described and implemented as a lowering trace artifact.

That distinction matters:

- **trace output** is for reading and debugging
- **assembler backend output** must be valid source for a real assembler

The current trace file should remain for now.
It may later evolve into a listing-like format, but that is separate from this design.

## Pipeline boundary

This design requires a new pipeline boundary.

It is **not** just another format writer hanging off the current artifact contract.

Today the format-writer side of the compiler receives an `EmittedByteMap` plus
`SymbolEntry[]`. That is already too late for a real assembler-source backend,
because by that point the compiler has discarded or flattened information that a
valid lowered source emitter needs to retain directly.

Examples of information that cannot be recovered reliably from the current
writer contract alone:

- declaration-shaped data
- section/origin directives as source-level emission decisions
- intended instruction/data ordering before trace-specific sorting
- comment associations
- distinctions between user-declared and synthetic emitted structure

So the first implementation step is architectural:

- introduce a backend-neutral lowered assembly product before final byte-map
  emission
- make both direct code emission and assembler-source emission consume that
  lower-level product, or derive from it in a controlled way
- keep the existing trace writer as a separate consumer or derived artifact

That boundary shift should be treated as a primary part of the work, not a
detail hidden inside an emitter.

## Target model

The compiler should support two independent lowered-output products:

1. **Trace output**
   - deterministic, human-inspectable, optimized for review and testing
   - may include byte comments and sorting behavior that are useful for inspection

2. **Assembler backend output**
   - preserves lowered instruction order and section structure
   - emits assembler-valid source in a chosen dialect
   - may be passed directly to ASM80 or another assembler

The new backend output should preserve the lowered structure, not reconstruct it from bytes.

That means the emitter must serialize:

- section/origin layout
- labels
- constants
- data declarations
- lowered instructions
- synthetic labels and scaffolding introduced by ZAX
- comments

## Backend architecture

The clean architecture is:

1. **Frontend / semantics**
   - parse source
   - resolve symbols
   - type/storage semantics
   - structured lowering decisions

2. **Backend-neutral lowered assembly model**
   - instruction stream
   - labels
   - constants
   - data records
   - section/origin directives
   - comments and source associations
   - symbolic fixups where still useful

3. **Concrete emitters**
   - direct object-code emitter
   - trace writer
   - ASM80 source emitter
   - future dialect emitters if justified

The current direct machine-code backend remains supported.
The new assembler backend is an additional emitter, not a replacement.
The important implementation point is that these emitters must sit behind the
new lowered-assembly boundary, not directly on top of the current
`EmittedByteMap` writer contract.

## Dialect abstraction

Z80 assemblers are not standardized. Differences include:

- `DB` / `.BYTE` / `DEFB`
- `DW` / `.WORD` / `DEFW`
- `DS` / `.BLOCK` / `DEFS`
- `EQU` spelling and placement
- `ORG` / `.ORG`
- include syntax
- hex literal conventions
- expression formatting and precedence expectations

Because of that, the new backend must not hardcode "ASM80 forever" into the internal model.

The design should instead distinguish:

- **lowered assembly model** — dialect-neutral internal representation
- **dialect policy** — concrete spelling and directive choices

Initial implementation can hardcode ASM80 policy inside one emitter.
That is acceptable as Phase 1.
But the internal representation should be shaped so that additional dialect emitters can be added later without reopening the lowering architecture.

## ASM80 as the first target

ASM80 is the correct first concrete target because:

- it already exists in the local toolchain
- it is already used in the `debug80` project
- its syntax is conventional enough for labels, `ORG`, `EQU`, `DB`, `DW`, and `DS`
- it provides an immediate external assembly path for validation

Observed local usage in `debug80` shows:

- `asm80 -m Z80 -t hex -o <output hex> <sourceFile>`
- conventional source files using `ORG`, `EQU`, `DB`, `DS`, labels, and `.include`

This is enough to justify ASM80-first implementation.

## Comments and source preservation

A major requirement for the assembler backend is preserving source comments where practical.

There are two distinct comment classes:

1. **User comments from ZAX source**
2. **Generated comments emitted by ZAX during lowering**

Both are useful, but they should remain distinguishable.

### User comments

Goal:

- preserve user `;` comments into the lowered assembler output wherever the output can be reasonably correlated to the originating source statement or declaration

This is valuable because:

- the lowered output remains readable
- user intent is preserved
- the generated assembly can be used as a serious maintenance artifact, not just a transient dump

### Generated comments

Goal:

- let ZAX annotate synthetic lowering with concise comments when useful

Examples:

- `; ZAX: expand := store to frame-local word`
- `; ZAX: while NZ back-edge`
- `; ZAX: synthetic spill for indexed word transfer`

Generated comments should be conservative. They should explain structure the user did not write directly.
They should not flood the output.

### Implementation implication

Comment preservation is not free.
The parser and/or lowering pipeline must carry comment associations forward as first-class metadata.

That is a separate implementation stage.
The initial assembler backend can ship without full user-comment preservation if needed, but the design must reserve space for it.

## Naming and symbol policy

The assembler backend should preserve original user symbol names whenever ZAX did not need to synthesize replacements.

That means:

- user labels stay user labels
- user data names stay user data names
- user constants stay user constants
- synthetic names introduced by lowering use a reserved ZAX-generated naming scheme

This is important for readability and source correlation.

## Scope of the first implementation

The first real assembler backend should support enough of the language to emit valid ASM80 for the common lowered corpus.

Minimum required surface:

- origins / section placement
- labels
- constants
- scalar data
- arrays and aggregate data using ASM80-compatible data directives
- emitted lowered Z80 instructions
- absolute symbol references and fixups
- synthetic labels introduced by lowering

The first version does **not** need to support every future assembler dialect.
It only needs one real backend that proves the architecture.

## Suggested staged plan

### Phase 1 — design and backend boundary

- define the backend-neutral lowered assembly model
- define the new pipeline boundary where that model is produced
- define the distinction between trace output and assembler backend output
- keep existing trace output unchanged
- widen the compile/pipeline contract as needed so assembler emitters consume
  lowered structure rather than only final bytes
- add an explicit emitter slot for assembler-source backends

### Phase 2 — ASM80 source emitter without comment preservation

- emit valid ASM80 source from the lowered model
- preserve lowered instruction order and section layout
- cover labels, constants, data, and instructions
- add a CLI path to emit ASM80 source as a first-class artifact

### Phase 3 — external assembly verification path

- in tests, assemble emitted ASM80 with the local ASM80 toolchain
- compare resulting machine code with ZAX direct output where feasible
- use this as differential validation, not as the only correctness gate

### Phase 4 — user comment preservation

- carry source comments through parsing/lowering association data
- emit preserved user comments into the ASM80 output near the relevant lowered region
- keep generated ZAX comments visually distinct

### Phase 5 — dialect modularization

- move ASM80-specific spelling into a dialect policy layer
- support additional emitters only if justified by real demand
- do not generalize early by inventing a premature declarative dialect language

## CLI and product shape

The CLI should eventually distinguish:

- trace `.asm` output
- assembler backend output

Those should not share a single ambiguous switch.

A likely shape is:

- existing trace switch remains trace-specific
- assembler backend output gets its own explicit target selection

Examples of the eventual intent:

- emit direct `.bin` / `.hex`
- emit trace `.asm`
- emit ASM80 lowered source
- optionally invoke ASM80 after emission in a toolchain mode

Exact CLI naming can wait until implementation design, but the product distinction should remain explicit.

## Risks

### 1. Treating the trace file as if it were already a backend

That would blur two different products and make both worse.
The assembler backend should be built on a stronger serialization contract.

### 2. Overfitting to ASM80

ASM80 is the right first target, but it should not reshape the lowering model.
The internal representation must stay dialect-neutral.

### 3. Losing comment fidelity

If comments are not modeled explicitly, comment preservation will degrade into ad hoc formatting.
This should be avoided.

### 4. Premature generalization

A declarative JSON dialect system is attractive, but it is not needed in the first implementation.
A code-level ASM80 emitter is the right first step.

## Recommended decision

Adopt the following position now:

- ZAX continues to own language semantics and lowering
- direct binary output remains supported
- the current trace output remains for now
- a new assembler-valid lowered source backend is added
- ASM80 is the first concrete dialect target
- the internal model is designed so later dialects remain possible
- preserved user comments are a tracked requirement, but can land after the first backend emitter works

## Immediate next step

Open an implementation stream for:

- designing the lowered assembly backend model
- separating trace output from real assembler-source output
- implementing an ASM80 emitter as the first concrete backend
- adding validation that ASM80 output assembles into bytes matching the direct backend for selected fixtures
