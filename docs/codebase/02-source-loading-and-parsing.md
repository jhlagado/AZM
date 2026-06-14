---
layout: default
title: 'Chapter 2 - Source Loading and Parsing'
parent: 'AZM Engineering Manual'
nav_order: 2
---

[<- Orientation and Repository Layout](01-orientation-and-repository-layout.md) | [Assembly and Z80 Emission ->](03-assembly-and-z80-emission.md)

# Chapter 2 - Source Loading and Parsing

Source loading and parsing turn entry files into typed source items. This
chapter follows the path from a filename to the structured data that assembly,
tooling and register contracts consume.

The loading boundary lives in `src/node/source-host.ts`. The parser is
orchestrated by `parseNextSourceItems()` in `src/core/compile.ts`, with
single-line parsing in `src/syntax/parse-line.ts`. Expression and declaration
parsing is split across tokenizer, token-expression, directive and layout
modules in `src/syntax/`.

## Entry Files and Source Text

The public tooling and compile APIs enter loading through `loadProgramNext()` in
`src/tooling/api.ts`. That function calls `expandSourceForTooling()` and then
passes the expanded logical lines to `parseNextSourceItems()`.

`expandSourceForTooling()` accepts:

```ts
export interface LoadProgramNextOptions {
  readonly entryFile: string;
  readonly includeDirs?: readonly string[];
  readonly directiveAliasFiles?: readonly string[];
  readonly preloadedText?: string;
  readonly signal?: AbortSignal;
}
```

The entry file is normalised and checked for a source extension. AZM source
entries use `.asm` or `.z80`. `preloadedText` lets editor integrations parse an
unsaved buffer for the entry file while included files still come from disk.
`signal` lets an editor cancel stale work when a newer buffer arrives.

The loader keeps the full text of every loaded source file in `sourceTexts`.
Later stages use parsed source items for compiler logic, but several features
need original text:

- register contract annotation rewrites exact source lines
- tooling reads source text for diagnostics and code actions
- D8 map generation needs file names and line provenance
- case-style linting inspects original token case

Logical lines drive parsing. Source texts support tools that need to point back
into the user's files.

## Source Loading Directives

The tooling loader recognises two source-loading directives before parsing:
`.include` and `.import`.

`.include` is textual inclusion. The loader reads the entry file, scans it into
logical lines and recursively expands include directives. Include paths resolve
relative to the including source file first, then through configured include
directories.

`.import` uses the same path resolution rule, but it starts a new source
ownership unit for tooling. Parsed items from the imported file still join the
same flattened logical line stream, though their spans record the imported file
as the owning unit. This lets tools distinguish entry-owned source, text pulled
in by `.include` and routines introduced by imported modules.

Repeated imports of the same resolved file are idempotent. The first import
loads and emits the module at the import point; later imports of that same
resolved file are skipped. Repeated includes remain textual and repeatable.
Recursive include or import stacks are diagnosed before parsing, with the
diagnostic naming the recursive source relation.

Labels in imported source keep their physical source locations. Imported
`@Name:` labels are public exports visible to outside source as `Name`. Plain
labels in an imported file are private to that import unit. Text included from
inside an imported file remains part of that imported unit, so its plain labels
are private unless they are also public `@` labels.

That rule keeps library files portable. A library can include a sibling file and
still assemble when the entry file is run from another directory. Include
directories then act as project-level search paths for shared headers, vendor
source and imported modules.

The loader returns:

```ts
export interface ExpandedNextSource {
  readonly entryFile: string;
  readonly lines: readonly LogicalLine[];
  readonly sourceTexts: ReadonlyMap<string, string>;
  readonly sourceLineComments: ReadonlyMap<string, ReadonlyMap<number, string>>;
}
```

`lines` is the flattened source stream for parsing. `sourceTexts` keeps the
original file text. `sourceLineComments` keeps comments indexed by file and line
so register contract analysis can reconstruct AZMDoc contract blocks after routines have
been identified.

## Logical Lines and Comments

`src/source/logical-lines.ts` scans a `SourceFile` into `LogicalLine` objects. A
logical line records the source name, line number and original text. Tooling
loads can also attach `sourceUnit` and `sourceRelation`:

- `sourceUnit` is the owning file for the current tooling unit
- `sourceRelation` is `entry`, `include` or `import`

This thin structure gives every later diagnostic a stable location and enough
provenance for tooling features that need to reason about module ownership.

The source helpers are small and important:

| File                      | Role                                                   |
| ------------------------- | ------------------------------------------------------ |
| `source-file.ts`          | Wraps source text with a source name.                  |
| `logical-lines.ts`        | Splits text into line records.                         |
| `source-span.ts`          | Defines the common span shape.                         |
| `line-comment-scanner.ts` | Finds line comments while respecting quoted text.      |
| `instruction-chain.ts`    | Splits spaced-backslash instruction chains into spans. |
| `strip-line-comment.ts`   | Removes semicolon comments through the shared scanner. |

`strip-line-comment.ts` is used by source-loading directive recognition, layout parsing,
conditional assembly and single-line parsing. Shared comment handling prevents
each stage from inventing a slightly different rule for semicolons inside
strings and character literals.

`instruction-chain.ts` uses the same quoted-text rules to find readable ` \ `
separators without splitting byte and string operands. It reports trimmed
segment text plus the original 1-based column for each segment, so later stages
can keep diagnostics and source maps aligned to the exact instruction inside a
physical line.

## Directive Aliases

Directive aliases are loaded during `loadProgramNext()`:

```ts
const directiveAliasProfiles = await Promise.all(
  (options.directiveAliasFiles ?? []).map((path) => readDirectiveAliasProfile(path)),
);
const directiveAliasPolicy = buildDirectiveAliasPolicy(directiveAliasProfiles);
```

`src/syntax/directive-aliases.ts` owns the alias policy. Built-in aliases and
project alias files are normalised before line parsing. The parser then
receives canonical directive forms and emits canonical source items.

Aliases are a syntax boundary. They affect directive recognition before parsing.
The assembler-time model receives canonical source items.

## Source Items

The parser is the first place where AZM source becomes compiler data. Before
this point, a line is text with a file name and line number. After this point, a
line is a label, instruction, directive, layout declaration or comment item.

`src/model/source-item.ts` defines the parser output. The model includes:

- labels
- `.org`, `.equ`, `.db`, `.dw`, `.ds`, `.align`, string directives and `.end`
- instructions
- record and union layout declarations
- type aliases
- enums
- op-expanded items
- comments

Each item carries a source span where appropriate. Tooling spans now preserve
optional `sourceUnit` and `sourceRelation` fields when the loader attached them.
Assembly uses item kind to decide size and emission. Register contract analysis
uses instruction, label and comment items to build routines. D8 map output uses
spans to connect emitted bytes back to files and lines.

## Top-Level Parse Order

`parseNextSourceItems()` handles structural forms before ordinary line parsing:

1. `applyConditionalAssembly()` in `src/core/conditional-assembly.ts` filters
   the logical line stream.
2. `collectOps()` records top-level `op` definitions and marks their body lines.
3. Name-left `.typealias` declarations are parsed.
4. Record and union headers collect `.field` declarations until `.endtype` or
   `.endunion`.
5. Visible op invocations expand into ordinary source items.
6. Chained instruction lines are split on spaced backslashes and each segment is
   parsed as an instruction or op invocation.
7. `parseLogicalLine()` handles remaining single-line labels, directives, data
   and instructions.

This order matters. Ops must be collected before invocation expansion. Layout
declarations must collect their body lines as one source item. Ordinary
instruction parsing should see the lines that remain after those structural
forms have been handled. Chained instruction parsing also needs the op registry
up front so later segments can expand ops and keep segment-level columns.

## Layout and Declaration Parsing

Name-left layout syntax is parsed in `parseNextSourceItems()` because a record
or union body spans multiple lines:

```asm
Sprite .type
x      .field byte
y      .field byte
tile   .field byte
flags  .field byte
       .endtype
```

Fields are parsed as `LayoutField` values. Each field has a name and a type
expression. The parser checks declaration shape. `address-planning.ts` later
checks duplicate field names, layout size and type references.

Type aliases are parsed as named bindings:

```asm
SpriteArray .typealias Sprite[16]
```

The parser stores the alias target as a type expression. Assembly resolves the
target against scalar layout names, record names, union names and other type
aliases.

The parser also distinguishes address labels from declarations. An address
label uses a colon and becomes a label item. Name-left declarations become
equate, enum, type, union or type-alias items.

```asm
Start:
        ret

COUNT .equ 8
```

A label contributes an address based on placement. An equate contributes an
assembler-time value based on expression evaluation.

## Expressions and Conditionals

`src/syntax/expression-tokenizer.ts` tokenizes expression text.
`parse-token-expression.ts` builds expression trees from tokens.
`parse-expression.ts` is the public syntax wrapper used by line parsing.
`parse-layout-expression.ts` parses layout type expressions used by `.ds`,
`.field`, `.typealias`, `sizeof(...)`, `offset(...)` and layout casts.
`parse-directive-statement.ts` parses directive statements that need more than
single-token recognition.

The parser produces expression trees from `src/model/expression.ts`.
`src/semantics/expression-evaluation.ts` evaluates those trees when the
assembler-time environment is available.

Conditional assembly is handled before final line parsing. The conditional pass
keeps the active lines and removes inactive branches from the stream seen by
later stages. Ordinary parsing then receives one effective source program.

## Parse Diagnostics

`src/syntax/parse-diagnostics.ts` contains shared helpers for syntax errors.
Diagnostic IDs come from `src/model/diagnostic.ts`. Use those helpers when
adding parse failures so source positions, severity and code shape stay
consistent.

Parser recovery matters for editor tooling. A user may have a half-written line
while typing. Tooling still needs symbols, diagnostics and register contract hints
for surrounding source, so parse errors should usually report a diagnostic and
let parsing continue.
