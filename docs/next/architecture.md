# AZM Next Architecture

Status: initial design baseline

## Intent

AZM Next is a greenfield assembler implementation. It should be smaller and
clearer than the current codebase because it starts from the current product
boundary rather than the historical conversion path.

The target is a flat ASM80-class Z80 assembler with retained AZM extensions:
directive aliases, AZMDoc metadata, register-care contracts, visible `op`
expansion, enums, and compile-time layout constants.

Observable behavior must be derived from the evidence hierarchy in
`source-of-truth.md`. The current AZM implementation is the behavioral oracle;
its internal architecture is not the design to copy.

## Architectural Principle

Everything accepted by the compiler should be one of:

- visible assembly
- compile-time metadata
- output serialization

Hidden typed memory operations, generated frames, structured high-level control
flow, and module/function lowering are not part of AZM Next.

## Case Policy

AZM Next uses strict case sensitivity for programmer-defined names and
modern-language symbols:

- labels
- constants
- enum names and members
- layout type names and fields
- op names and parameters
- include paths, subject to host filesystem behavior

`Value`, `VALUE`, and `value` are three different symbols.

Machine vocabulary is case-insensitive for compatibility with normal assembly
practice:

- Z80 mnemonics
- Z80 registers and register pairs
- Z80 condition codes
- directive alias heads before canonicalization

The parser normalizes machine vocabulary into canonical internal spelling while
preserving source spelling for diagnostics and listings. It must not normalize
programmer-defined symbols.

## Pipeline

```text
load source
  -> expand textual includes with provenance
  -> split logical lines
  -> apply directive-head aliases
  -> parse source items
  -> prescan declarations and labels
  -> build constants, layouts, symbols, and op registry
  -> expand ops into canonical visible assembly
  -> optionally run register-care analysis
  -> assemble directives and instructions into sections
  -> resolve fixups
  -> build output image and metadata
  -> serialize requested artifacts
```

After op expansion, downstream consumers should see canonical visible assembly.
Assembly, listing output, lowered source output, debug metadata, and
register-care analysis should not each reinterpret raw parser details.

## Module Boundaries

```text
src/
  core/           compile orchestration and public contracts
  source/         source files, logical lines, include expansion, provenance
  syntax/         parsing, directive aliases, expressions, operands
  model/          shared data structures with no compiler dependencies
  semantics/      constants, layouts, symbols, validation
  expansion/      op registry, matching, substitution, local-label handling
  assembly/       directives, instruction assembly, sections, fixups, images
  z80/            instruction model, encoder, effects, formatting
  register-care/  AZMDoc contracts, routine model, effects, summaries
  outputs/        BIN, HEX, listing, D8, lowered Z80 writers
  node/           filesystem host and Node-specific integration
  cli/            command-line argument parsing and process adapter
```

Dependency direction:

```text
cli -> node -> core
core -> source + syntax + semantics + expansion + assembly + outputs
assembly -> model + z80 + semantics
register-care -> model + z80
outputs -> model
syntax -> model
semantics -> model
model -> no project implementation modules
```

Production modules under `next/src/` must not import root `src/`.

## Core Data Products

The main passes should exchange explicit products:

- `SourceProgram`: expanded source text with source provenance
- `ParsedProgram`: assembler-shaped source items and parse diagnostics
- `SemanticProgram`: symbols, constants, layouts, ops, and validation results
- `CanonicalProgram`: visible assembly after aliases and op expansion
- `AssemblyImage`: sections, symbols, fixups, byte ranges, and diagnostics
- `OutputSet`: serialized artifacts

Broad mutable compiler contexts should be avoided. A pass may use an internal
builder, but it should return a narrow result object.

## Register-Care Position

Register-care analyzes canonical visible assembly. It should share Z80 effect
metadata and op-expanded instruction streams with the assembler path. It should
not have a separate interpretation of raw source or op substitution.

## Output Position

Output writers serialize `AssemblyImage` and related metadata. They must not
perform semantic checks or alter symbol, section, or fixup behavior.
