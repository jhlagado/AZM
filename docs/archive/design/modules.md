# ZAX Sections, Anchors, and Module Imports — v0.5 Design Direction

## 0. Status, Scope, and Definitions

- 0.1 Status
- 0.2 Scope
- 0.3 Non-goals
- 0.4 Terminology

---

## 1. Design Goals and Rationale

- 1.1 Deterministic output without a linker
- 1.2 Separation of concerns
- 1.3 Module-scope imports
- 1.4 Named merging as the core primitive
- 1.5 Strict anchoring and error discipline

---

## 2. Section Model

- 2.1 Section declaration syntax
- 2.2 Section kinds (`code`, `data`)
- 2.3 Section names as user-defined roles
- 2.4 Section keys
- 2.5 Multiple sections per module
- 2.6 Sections and scope (explicit non-relationship)

---

## 3. Anchors and Regions

- 3.1 Anchor syntax
- 3.2 Anchor uniqueness rule
- 3.3 Missing anchor rule
- 3.4 Banked anchors
- 3.5 Region capacity and overflow checking
- 3.6 Overlap detection rules
- 3.7 Required diagnostics

---

## 4. Imports, Exports, and Visibility

- 4.1 Module-scope import syntax
- 4.2 Import semantics
- 4.3 Export semantics
- 4.4 Sectionless symbols (types, enums, constants)
- 4.5 Qualified name resolution
- 4.6 Library-internal imports

---

## 5. Merge and Concatenation Semantics

- 5.1 Contribution collection phase
- 5.2 Deterministic ordering rule
- 5.3 Per-section merge algorithm
- 5.4 Address assignment within merged sections
- 5.5 Fixups and cross-section references

---

## 6. Data Initialization Semantics

- 6.1 Unified declaration syntax
- 6.2 Zero-initialization rule
- 6.3 ROM-resident initialized data
- 6.4 Compiler-emitted startup routine
- 6.5 Placement of initializer bytes in output
- 6.6 Banked initialization considerations

---

## 7. Worked Examples

- 7.1 Simple ROM + RAM
- 7.2 Split ROM layout
- 7.3 Banked ROM window
- 7.4 Error cases

---

## 8. Error Model and Determinism Guarantees

- 8.1 Complete error condition list
- 8.2 Required error messages
- 8.3 Determinism guarantees

---

## 9. Future Extension Points

- 9.1 Banking key formalization
- 9.2 Multiple address spaces
- 9.3 Optional sections
- 9.4 Explicit ordering directives
- 9.5 Debug-map integration

# 0. Status, Scope, and Definitions

## 0.1 Status

This document defines the accepted **v0.5 design direction** for sections,
anchors, and module imports in ZAX.

It supersedes the earlier
`docs/sections-modules-design.md` discussion and is now the active design anchor
for this topic.

This file is authoritative for design work, but it is **not yet the normative
language specification**. `docs/spec/zax-spec.md` remains the current normative
source until this design is implemented and adopted.

For implementation planning:

- non-banked sections, anchors, imports, exports, and deterministic merge
  semantics are in v0.5 scope
- banking remains documented here as future-direction design intent, but is not
  part of the initial v0.5 implementation target

---

## 0.2 Scope

This design defines:

- Section declarations
- Section merging semantics
- Anchor declarations and constraints
- Module-scope imports
- Export rules
- Deterministic layout rules
- Banking semantics (future-direction only; not part of the initial v0.5 build)
- Overflow and overlap detection
- Initialization responsibilities for `data` sections

This specification does **not** define:

- The full binary file format
- Debug metadata format
- Cross-toolchain interoperability
- External linkers (ZAX has no linker stage)

---

## 0.3 Non-Goals

ZAX does not implement a separate linker stage.

Specifically:

- Import does not perform textual inclusion.
- Import position in source does not determine memory layout.
- There is no location-based inclusion semantics.
- Section merging is not controlled by import position inside a section.

All layout decisions are governed exclusively by:

- Section keys
- Anchors
- Deterministic merge rules

---

## 0.4 Terminology

The following terms are used throughout this specification.

### Compilation Unit

A single source file processed by the assembler.

### Module

A compilation unit that is imported by another unit.

### Root Program

The top-level compilation unit that defines anchors and produces the final output binary.

### Section Contribution

A section declared in a module that contributes content to a merged section in the root program.

### Section

A named grouping of content declared as:

```
section <kind> <name>
  ...
end
```

A section may optionally include an anchor.

### Section Kind

One of:

- `code`
- `data`

### Section Key

The identity of a section for merging purposes.

The base section key is:

```
(kind, name)
```

If banking is used, the effective key becomes:

```
(kind, name, bank)
```

In the initial v0.5 implementation, banking is deferred. The banked form is
kept here as future-direction design intent only.

(Banking formalization is defined in Section 3.)

### Anchor

A section declaration that specifies physical placement using:

```
at <address>
```

An anchor may also specify:

- `bank <n>`
- `size <n>`
- `end <address>`

An anchor defines the physical region into which all contributions for that section key are placed.

### Region

The address range defined by an anchor.

### Overflow

A condition where merged content exceeds the declared capacity of a region.

### Overlap

A condition where two anchored regions occupy intersecting address ranges in the same address space and bank.

---

# 1. Design Goals and Rationale

## 1.1 Deterministic Output Without a Linker

ZAX produces fully resolved, absolute-address binaries in a single assembly phase.

There is no separate linking stage.

Therefore:

- All section merging
- All address assignment
- All overflow and overlap detection

must be defined deterministically within the assembler.

Given identical inputs, the assembler must produce identical outputs.

---

## 1.2 Separation of Concerns

ZAX strictly separates two conceptual domains:

### Symbol Graph

Defines:

- Functions
- Variables
- Types
- Constants
- Visibility and qualification rules

Symbol visibility is governed by `export` and `import`.

Symbol resolution is independent of physical placement.

### Placement Graph

Defines:

- Section keys
- Anchors
- Address ranges
- Banking
- Capacity limits

Placement is governed exclusively by section declarations and anchors.

Sections do not affect scope.

Scope does not affect placement.

---

## 1.3 Module-Scope Imports

Imports in ZAX are permitted only at module scope.

Section-local imports are not part of the language.

An `import` statement performs two functions:

1. Makes exported symbols from the imported module visible.
2. Registers the imported module’s section contributions for merging.

Import does not:

- Paste content at a textual location.
- Influence layout based on its position in the file.
- Override anchor placement rules.

Layout is determined solely by section keys and anchors.

---

## 1.4 Named Merging as the Core Primitive

Section merging is based on section keys.

All sections sharing the same key are concatenated.

Concatenation order is deterministic and defined in Section 5.

This merging model:

- Avoids location-based inclusion semantics.
- Supports modular composition.
- Enables complex memory maps (multiple ROM regions, banking).
- Preserves deterministic builds.

---

## 1.5 Strict Anchoring and Error Discipline

ZAX enforces strict anchoring rules:

- Exactly one anchor must exist for each section key.
- Multiple anchors for the same key are an error.
- Missing anchors for contributed sections are an error.
- Overflow is an error.
- Overlap is an error.

ZAX does not guess.

ZAX does not auto-create anchors.

ZAX does not silently drop contributions.

Memory layout errors are fatal.

# 2. Section Model

## 2.1 Section Declaration Syntax

A section groups related content under a named role.

Sections are declared using:

```
section <kind> <name>
  ...
end
```

Where:

- `<kind>` is either `code` or `data`.
- `<name>` is a user-defined identifier.

A section may optionally include an anchor, as defined in Section 3.

A section declared without `at` is a section contribution.
A section declared with `at` is an anchor.

Sections may appear in both modules and the root program.

---

## 2.2 Section Kinds

ZAX defines two section kinds:

- `code`
- `data`

### Code Sections

A `code` section may contain:

- Function definitions
- Inline data emitted as part of executable memory
- Constants with executable storage

Content in a `code` section is emitted into executable memory.

### Data Sections

A `data` section may contain:

- Variable declarations
- Initialized and zero-initialized storage
- Static tables intended for runtime access

Content in a `data` section is emitted into non-executable memory unless otherwise specified by the target environment.

The assembler does not infer semantics beyond the section kind.

---

## 2.3 Section Names as User-Defined Roles

Section names are user-defined identifiers.

ZAX does not reserve or predefine section names.

Common conventions such as `vectors`, `kernel`, `bss`, `rodata`, or `banked_code` may be used by convention but are not special to the language.

Section names represent logical roles.

They do not encode physical addresses.

They do not imply scope boundaries.

They are used exclusively for merging and placement.

---

## 2.4 Section Keys

Section merging is determined by a section key.

The base section key is:

```
(kind, name)
```

All sections sharing the same base key are concatenated during layout.

If banking is used, the effective section key becomes:

```
(kind, name, bank)
```

Bank semantics are defined in Section 3.

Section keys determine merging identity.
Section keys do not determine visibility or scope.
Section keys are compared for exact structural equality.

---

## 2.5 Multiple Sections per Module

A module may declare multiple sections.

A module may declare:

- Multiple sections of the same kind with different names.
- Multiple sections of different kinds.
- Multiple contributions to the same section key.

Each declared section contributes independently to its section key.

There is no limit on the number of section contributions a module may declare.

---

## 2.6 Sections and Scope

Sections do not define scope.

Declarations inside a section have file-level scope unless otherwise restricted by language rules unrelated to sections.

Specifically:

- Types declared inside a section are visible according to normal export and import rules.
- Constants declared inside a section are visible according to export rules.
- Functions declared inside a section are visible according to export rules.
- Variables declared inside a section are visible according to export rules.

Section membership affects placement only.

Section membership does not affect:

- Name resolution
- Qualification requirements
- Symbol visibility rules
- Lifetime semantics beyond placement

Sections are placement constructs, not namespace constructs.

# 3. Anchors and Regions

## 3.1 Anchor Syntax

A section becomes an anchor when it specifies a physical placement using `at`.

The syntax for an anchored section is:

```
section <kind> <name> at <address> [bank <n>] [size <n> | end <address>]
  ...
end
```

Where:

- `<address>` is a numeric literal.
- `bank <n>` specifies a bank identifier if banking is used.
- `size <n>` defines the capacity of the region in bytes.
- `end <address>` defines the inclusive upper bound of the region.

If neither `size` nor `end` is specified, the region is considered unbounded for capacity purposes, but still participates in overlap checks.

An anchor defines the physical region into which all contributions for its section key are placed.

---

## 3.2 Anchor Uniqueness Rule

For each section key that has contributions, exactly one anchor must exist.

The effective section key is:

- `(kind, name)` when no banking is used.
- `(kind, name, bank)` when banking is used.

If more than one anchor exists for the same section key, this is a fatal error.

ZAX does not infer anchors and does not auto-create them.

---

## 3.3 Missing Anchor Rule

After all modules are imported and all section contributions collected, the assembler must verify that every section key with contributions has exactly one corresponding anchor.

If a section key has contributions but no anchor, assembly fails.

If an anchor exists for a section key with no contributions, this is permitted and results in an empty region.

Assemblers should emit a warning for an empty anchored region, since it often indicates a misspelled section name or an unused reservation.

---

## 3.4 Banking Semantics

Banking is **not** part of the initial v0.5 implementation scope.

This section records the intended future model so the non-banked design does not
paint the language into a corner.

In v0.5, section contributions are always unbanked.

If `bank <n>` is specified on an anchor, the bank identifier becomes part of the section key.

Section contributions declared without banking are associated with the base section key `(kind, name)`.
Anchors that specify `bank <n>` define distinct section keys `(kind, name, bank)`.
A contribution matches an anchor only if their effective section keys are identical.

If banking is used for a section name, all contributions intended for that bank must match the effective key.

Bank identifiers are integers.

Bank identifiers are compared for equality only.

ZAX does not define hardware banking behavior. It defines only placement identity.

A non-banked section contribution does not match a banked anchor.

---

## 3.5 Region Capacity and Overflow Checking

If `size <n>` is specified, the region capacity is exactly `<n>` bytes.

If `end <address>` is specified, the region capacity is:

```
end - base_address + 1
```

`end` must be greater than or equal to the base address. Otherwise assembly fails.

All merged content for the section key must fit within the region capacity.

If the total size of merged content exceeds the declared capacity, assembly fails with an overflow error.

If no capacity is declared, overflow checking is not performed, but overlap checking still applies.

---

## 3.6 Overlap Detection

Anchored regions must not overlap within the same address space and bank.

Two anchored regions overlap if their address ranges intersect and:

- They share the same bank identifier, or
- Neither declares a bank (unbanked space).

The ranges compared for intersection are:

- `[base, base + size - 1]` when `size` is specified
- `[base, end]` when `end` is specified
- implementation-defined unbounded ranges when neither `size` nor `end` is specified

If two anchored regions overlap under these conditions, assembly fails.

Regions in different banks do not overlap, even if their address ranges are identical.

Overlap detection applies regardless of section kind.

---

## 3.7 Address Assignment Within a Region

For each section key, merged content is placed sequentially starting at the anchor base address.

Address assignment follows:

```
assigned_address = base_address + cumulative_offset
```

Where `cumulative_offset` increases by the size of each contribution in deterministic merge order.

The merge order is defined in Section 5.

Address assignment must be deterministic.

No padding is inserted unless explicitly requested by language constructs outside the scope of this section.

---

## 3.8 Diagnostics

The assembler must produce fatal errors for:

- Duplicate anchors for the same section key.
- Missing anchor for a section key with contributions.
- Region overflow.
- Region overlap within the same bank and address space.

Errors must identify:

- Section kind
- Section name
- Bank (if applicable)
- Conflicting address ranges or size values

Assembly must terminate upon detection of any of these conditions.

# 4. Imports, Exports, and Visibility

## 4.1 Module-Scope Import Syntax

Imports are permitted only at module scope.

The syntax is:

```
import <module_name>
```

Imports must not appear inside sections.

Import position within a file does not affect layout.

---

## 4.2 Import Semantics

An `import` statement performs two actions:

1. **Symbol Visibility**
   All exported symbols from the imported module become visible for name resolution according to qualification rules.

2. **Section Contribution Registration**
   All section contributions declared in the imported module are registered for merging under their section keys.

Import does not:

- Perform textual inclusion.
- Paste content at the location of the import statement.
- Assign addresses.
- Override anchor rules.

Layout is determined solely by section keys and anchors.

---

## 4.3 Export Semantics

A declaration is exported by prefixing it with the `export` keyword.

Exports may apply to:

- Function declarations
- Variable declarations
- Type declarations
- Enum declarations
- Constant declarations

Only exported symbols are visible to importing modules.

Non-exported symbols remain private to their defining module.

---

## 4.4 Sectionless Symbols

Types, enums, and constants do not contribute bytes to layout.

Such declarations:

- Do not participate in section merging.
- Do not require anchors.
- Do not influence placement.

They participate only in symbol visibility and name resolution.

Variables and functions contribute to layout only when declared inside a section.

---

## 4.5 Qualified Name Resolution

Imported symbols must be accessed using qualified names unless otherwise specified by language rules.

Given:

```
import foo
```

An exported symbol `bar` from module `foo` is referenced as:

```
foo.bar
```

ZAX does not implicitly merge namespaces.

There is no wildcard import.

---

## 4.6 Library-Internal Imports

A module may import other modules.

Library-internal imports:

- Provide visibility for symbol resolution inside the module.
- Register section contributions of dependencies for inclusion in the final program.

Section contributions from transitively imported modules are merged according to the same rules as directly imported modules.

Duplicate imports of the same module must not result in duplicate section contributions.

The assembler must ensure that each module contributes at most once to each section key in a build.

Module identity for duplicate suppression is the canonical resolved module path after import resolution.

# 5. Merge and Concatenation Semantics

## 5.1 Contribution Collection Phase

After parsing the root program and all imported modules, the assembler performs a contribution collection phase.

During this phase:

- All section declarations without `at` are recorded as section contributions.
- All section declarations with `at` are recorded as anchors.
- All exports and imports are resolved for visibility.

Each section contribution is associated with a section key.

Each anchor is associated with a section key.

No addresses are assigned during this phase.

The root program may also declare section contributions in addition to anchors.

---

## 5.2 Deterministic Import Traversal

The assembler must process modules in a deterministic order.

The traversal order is defined as:

1. The root program.
2. Modules imported by the root program, in the lexical order of their `import` statements.
3. For each imported module, its dependencies are processed in lexical import order.
4. Each module is processed at most once.

Root-program section contributions participate in merge order first because the root program is processed first.

If a module is imported multiple times (directly or transitively), it contributes only once.

The traversal order determines the concatenation order of section contributions.

Given identical source inputs and identical import order, the assembler must produce identical layout.

Import traversal order is determined solely by lexical order of import statements within each compilation unit.

---

## 5.3 Per-Section Merge Algorithm

For each section key:

1. Collect all contributions from modules processed in traversal order.
2. Identify the single anchor corresponding to the section key.
3. Concatenate contributions in traversal order.
4. Assign addresses sequentially starting at the anchor base address.

Concatenation is linear. No reordering is performed.

---

## 5.4 Address Assignment

Let:

- `base` be the anchor address.
- `offset` be initialized to `0`.

For each contribution in merge order:

- Assign all emitted bytes of the contribution starting at `base + offset`.
- Increase `offset` by the number of bytes emitted by that contribution.

The final `offset` must not exceed the region capacity if capacity is declared.

Address assignment must be deterministic.

---

## 5.5 Cross-Section References and Fixups

Symbols defined in one section may be referenced from another section.

All symbol references are resolved after address assignment.

Forward references are permitted.

Fixups must be applied after final addresses are known.

Section merging does not alter symbol identity.
Symbol resolution is independent of merge order.

---

## 5.6 Duplicate Contribution Suppression

If a module is imported more than once, directly or transitively, it must contribute its section content only once.

The assembler must track module identity and suppress duplicate contributions.

Duplicate suppression applies at the module level, not at the section level.

---

## 5.7 Stability Guarantees

The merge process must satisfy:

- Deterministic output for identical inputs.
- No dependency on physical file ordering outside defined import traversal.
- No dependency on textual location of import statements beyond traversal ordering.

ZAX guarantees that section layout is a pure function of:

- The set of modules
- The import graph
- The section declarations
- The anchors and region definitions

# 6. Data Initialization Semantics

## 6.1 Unified Declaration Syntax

Variables are declared using:

```
<name>: <type> [= <initializer>]
```

Variable declarations must appear inside a `data` section.

If a variable declaration appears outside a section, this is an error.

Variable declarations inside a `code` section are a compile error in v0.5.

A variable declaration contributes bytes to the section in which it appears.

---

## 6.2 Zero-Initialization Rule

If a variable declaration omits an initializer:

```
counter: byte
```

The variable is defined to be zero-initialized at program start.

ZAX does not define uninitialized storage.

The absence of an initializer is semantically equivalent to initialization to zero.

---

## 6.3 Explicit Initialization

If a variable declaration includes an initializer:

```
value: byte = 42
buffer: byte[4] = { 1, 2, 3, 4 }
```

The initializer defines the initial runtime value of the variable.

Initializer expressions must be compile-time constant expressions.

The size of the initializer must match the declared storage size.

A size mismatch is an error.

---

## 6.4 ROM-Resident and RAM-Resident Data

The placement of a `data` section determines where its runtime storage resides.

Section kind alone does not define whether a region is writable or read-only.

In v0.5, writable-versus-read-only classification is not inferred from the
anchor address and is not yet controlled by source syntax.

Instead, the initial v0.5 implementation must use an implementation-defined
root-program configuration rule to classify anchored `data` regions as either:

- writable (runtime storage, such as RAM), or
- read-only (directly emitted storage, such as ROM)

This classification rule must be deterministic for a given build and must be
applied before startup-initialization planning.

If a `data` section is classified as read-only, its bytes are emitted directly
into the anchored region and no runtime copy is required.

If a `data` section is classified as writable, initialization semantics apply as
defined below.

---

## 6.5 Compiler-Emitted Startup Initialization

For `data` sections classified as writable, the compiler must emit startup
initialization sufficient to establish correct runtime state before user code
begins execution.

The compiler-owned startup initialization is responsible for:

1. Copying explicitly initialized variables from stored initializer bytes to
   their runtime addresses.
2. Zeroing variables without explicit initializers.

In the initial v0.5 implementation, the exact entry handoff sequence is
implementation-defined, but the compiler-generated startup must execute before
the user-visible program entrypoint.

---

## 6.6 Placement of Initializer Data

For writable `data` sections with explicit initializers:

- the initializer bytes must be stored in the output binary
- the compiler must preserve a deterministic association between those stored
  bytes and the runtime destination addresses

In the initial v0.5 implementation, these initializer bytes may be emitted in a
compiler-owned initialization region or equivalent compiler-owned metadata area.

This region is not source-declarable in v0.5.

The exact binary encoding is implementation-defined, but it must be stable and
must allow deterministic reconstruction of runtime state for every writable
initialized declaration.

---

## 6.7 Banked Data Initialization

This section is future-direction only. Banked initialization is deferred until
banked sections themselves enter implementation scope.

If a `data` section is banked:

- Initialization must occur within the correct bank context.
- The assembler must associate initializer bytes with the appropriate section key, including bank.

Overflow and overlap rules apply independently per bank.

Banking does not alter initialization semantics, only placement identity.

---

## 6.8 Determinism

Given identical declarations, anchors, and import graphs, data layout and initialization data must be identical across builds.

No implicit padding, reordering, or implicit region growth is permitted.

Initialization behavior must be a pure function of:

- Variable declarations
- Section anchors
- Merge order
- Banking configuration

# 7. Worked Examples

## 7.1 Simple ROM and RAM Layout

### Library Module

```zax
section code kernel
  export func add(a: byte, b: byte): byte
    ; implementation
  end
end

section data bss
  export counter: byte
end
```

### Root Program

```zax
import math

section code kernel at $0000 size $4000
end

section data bss at $8000 size $2000
end
```

### Result

- `math` contributes to `code kernel` and `data bss`.
- `kernel` is anchored at `$0000`.
- `bss` is anchored at `$8000`.
- Contributions are concatenated in import traversal order.
- `counter` is zero-initialized at runtime.

---

## 7.2 Split ROM Layout

### Modules

```zax
section code vectors
  export func reset(): void
  end
end
```

```zax
section code kernel
  export func main(): void
  end
end
```

### Root

```zax
import crt
import app

section code vectors at $0000 size $0100
end

section code kernel at $0100 size $3F00
end
```

### Result

- Reset vector placed at `$0000`.
- Kernel code placed starting at `$0100`.
- No overlap permitted.
- If kernel exceeds `$3F00`, assembly fails.

---

## 7.3 Banked ROM Window

This example illustrates future-direction banking semantics only. It is not part
of the initial v0.5 implementation target.

### Module

```zax
section code banked_code
  export func level1(): void
  end
end
```

### Root

```zax
import levels

section code banked_code at $C000 bank 0 size $4000
end

section code banked_code at $C000 bank 1 size $4000
end
```

### Result

Each `(code, banked_code, bank)` forms a distinct section key.

If `levels` does not specify banking in its section declaration, it contributes to the unbanked key.

Because v0.5 contributions are unbanked, this example is an error unless there is also an unbanked anchor for `(code, banked_code)`.

If two anchors exist for the same `(kind, name, bank)` tuple, assembly fails.

---

## 7.4 Error Cases

### Duplicate Anchor

```zax
section code kernel at $0000
end

section code kernel at $1000
end
```

Error: Multiple anchors for section key `(code, kernel)`.

---

### Missing Anchor

Module declares:

```zax
section code kernel
  export func main(): void
  end
end
```

Root does not anchor `code kernel`.

Error: Missing anchor for section key `(code, kernel)`.

---

### Overflow

```zax
section code kernel at $0000 size $0100
end
```

If merged contributions exceed `$0100` bytes:

Error: Region overflow for `(code, kernel)`.

---

### Overlap

```zax
section code kernel at $0000 size $2000
end

section data bss at $1000 size $2000
end
```

Ranges overlap in same bank.

Error: Region overlap detected.

---

### Duplicate Import

If a module is imported twice:

```zax
import foo
import foo
```

`foo` contributes only once.

Duplicate contribution is suppressed.

Assembly proceeds without duplication.

---

# 8. Error Model and Determinism Guarantees

## 8.1 Fatal Errors

The assembler must terminate with a fatal error for:

- Duplicate anchors for a section key.
- Missing anchor for a section key with contributions.
- Region overflow.
- Region overlap within the same bank.
- Size mismatch in variable initializers.
- Section declarations outside permitted syntax.

No recovery or implicit correction is performed.

---

## 8.2 Determinism

ZAX guarantees deterministic output.

The final binary is a pure function of:

- Source modules
- Import graph
- Section declarations
- Anchor definitions
- Banking configuration

Import statement position affects only traversal order, not physical placement location.

No nondeterministic ordering is permitted.

---

# 9. Future Extension Points

## 9.1 Banking Formalization

Future revisions may refine:

- Whether bank is part of section key
- Whether banking may be specified at module level
- Whether bank selection can be overridden

---

## 9.2 Multiple Address Spaces

Future revisions may introduce explicit address spaces beyond banking, such as:

- ROM
- RAM
- Memory-mapped I/O

---

## 9.3 Optional Sections

Future revisions may allow optional section contributions that do not require anchors.

---

## 9.4 Explicit Ordering Controls

Future revisions may allow optional explicit ordering directives within a section key.

---

## 9.5 Debug Map Integration

Future revisions may define:

- Debug metadata mapping sections to address ranges
- Per-section symbol tables
- Bank-aware debug output
