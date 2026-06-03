# AZM response to the Debug80 D8 source-map roadmap

Status: draft discussion response
Date: 2026-05-27

## Purpose

Debug80's roadmap in
`/Users/johnhardy/projects/debug80/docs/design-azm-d8-source-map-roadmap.md`
is directionally aligned with AZM. The important point is not that Debug80 wants
more JSON fields. The important point is that AZM is the program that already
knows the assembled bytes, source graph, symbol table, data declarations,
layouts, enums, routine contracts, and register contracts mode. Debug80 should be
able to consume those facts instead of reconstructing a partial assembler inside
the extension.

This response sets the AZM-side position:

- richer source-map metadata is a good direction;
- additions should be assembler-owned, structured, and emitted with tests;
- D8 version 1 should remain usable while new fields are added conservatively;
- metadata must describe the machine-visible program, not imply hidden typed
  runtime behavior;
- Debug80 fallback behavior should remain honest when metadata is absent.

## Current agreement

AZM already treats the D8 sidecar as the supported debugger integration path.
The public tooling contract in `docs/reference/tooling-api.md` says Debug80
should use `bin + d8m`, not lowered `.z80`, for debugger integration.

The current D8 map is intentionally useful but small:

- project-relative source file keys when `sourceRoot` is provided;
- source-attributed address segments;
- global and per-file symbols;
- constants with `value` rather than `address`;
- addressable labels and data symbols with `address`;
- generator metadata, including known artifact inputs.

That shape should remain the stable floor. Debug80 can continue to implement
breakpoints, source stepping, Go to Definition, basic workspace symbols, and
basic hovers from today's fields.

The roadmap's larger request is also valid: richer editor and debugger features
should be driven by facts emitted by AZM, because those facts are already part
of assembly, semantic analysis, register contracts, layout handling, or artifact
generation.

## Boundary conditions

The response must stay consistent with the current AZM language direction.

AZM is an assembler with advanced compile-time expressions. It is not a
compiler, and source-map metadata should not make it look like one. In
particular:

- layout metadata may describe packed type sizes and field offsets;
- a data symbol may say it reserves `Sprite[16]` bytes if the source declared
  that storage;
- Debug80 may use that to render expandable memory views;
- none of this implies implicit typed load/store syntax or generated runtime
  address arithmetic;
- routine metadata should describe labels, calls, returns, and register/flag
  contracts, not high-level functions or hidden calling conventions.

This matches the existing layout and register contracts design notes:

- `docs/design/exact-size-layout-and-indexing.md`
- `docs/design/azm-register-contracts-safety.md`
- `docs/spec/azmdoc.md`

The source map should be a precise description of what AZM assembled and what
AZM can prove or read from source annotations. It should not become a place for
Debug80-specific guesses.

## Format evolution policy

D8 should evolve additively until there is a clear reason to break the shape.
The practical policy should be:

- keep current v1 fields valid;
- add optional structured fields before changing existing field meanings;
- prefer explicit `subkind`, `storage`, `typeRef`, `display`, `contract`, and
  `sourceRange` fields over overloading `kind`;
- let Debug80 ignore unknown fields;
- document every emitted field in `docs/reference/tooling-api.md`;
- cover each addition with writer tests and at least one compile/API contract
  test;
- only bump the top-level version when an existing consumer would otherwise
  misread the map.

The roadmap suggests either expanding `kind` or adding `subkind`. AZM should
prefer a conservative split:

```json
{
  "name": "GAME_LOOP",
  "kind": "label",
  "subkind": "routine",
  "address": 16480
}
```

That preserves the broad current grouping while allowing Debug80 to present a
more specific UI. If the distinction later proves too awkward, a versioned
schema change can promote the richer categories.

## Proposed AZM priorities

### 1. Source graph and freshness metadata

This is the most mechanical improvement and should be first. Debug80 already
needs clear source-map stale/missing warnings, and AZM already has the loaded
source graph when compiling.

Useful fields:

- project root used for path normalization;
- entry file;
- included source files;
- include edges;
- source file size and content hash at build time;
- AZM version;
- compile options that affect metadata, especially register contracts mode and
  interface files.

This should be framed as source-map freshness data, not as Debug80 UI language.
Debug80 can choose the user-facing warning text.

### 2. Declaration and storage metadata

Data display in the Variables panel is the highest-value debugger improvement.
AZM can emit the declaration shape without needing new language semantics.

For memory-backed symbols, emit the directive and size facts AZM already used:

```json
{
  "name": "PLAYER_X",
  "kind": "data",
  "address": 17281,
  "size": 1,
  "storage": {
    "directive": ".db",
    "unit": "byte",
    "count": 1
  }
}
```

For reserved layout storage:

```json
{
  "name": "SPRITES",
  "kind": "data",
  "address": 17408,
  "size": 128,
  "storage": {
    "directive": ".ds",
    "reserved": true,
    "type": "Sprite[16]",
    "unit": "layout",
    "count": 16
  },
  "typeRef": "Sprite"
}
```

The emitted metadata describes the source declaration and byte extent. It does
not permanently bind every future use of `SPRITES` to a type in AZM semantics.

### 3. Routine contract metadata

AZMDoc and register contracts are already designed as structured metadata.
D8 should eventually carry the routine-facing subset so Debug80 can show compact
hovers and call-site help without parsing comments.

This work should include an AZMDoc compact register contract format. AZM
should continue to parse the existing multi-line contract form, but generated
contract updates should prefer a single canonical line:

```asm
;! in: A,HL; out: carry; clobbers: B,C; preserves: DE,IX
@CheckTile:
```

The compact line starts with `;!` and contains one or more semicolon-separated
clauses. Each clause has the form:

```text
key: value-list
```

Supported keys are the existing register contract keys:

```text
in
out
clobbers
preserves
```

The value list is comma-separated:

```asm
;! in: A,HL,IX; out: A,carry; clobbers: B,C,DE
```

Whitespace should be flexible. These examples should parse identically:

```asm
;! in:A,HL;out:carry;clobbers:B,C
;! in: A, HL; out: carry; clobbers: B, C
```

When AZM emits or rewrites contracts, clause order should be canonical:
`in`, `out`, `clobbers`, `preserves`. Missing clauses are allowed. Empty
clauses should not be emitted. Clause keys should parse case-insensitively.
Register names, register pairs, and condition/flag carriers should use AZM's
existing register contracts vocabulary.

The existing multi-line form remains valid:

```asm
;! in        A,HL
;! out       carry
;! clobbers  B,C
;! preserves DE,IX
@CheckTile:
```

AZM should preserve existing multi-line comments unless explicitly running
contract annotation or fix mode. When AZM rewrites or inserts contracts
automatically, it should prefer the compact format because it maps directly to
Debug80's compact hover display:

```text
in: A,HL    out: carry    clobbers: B,C    preserves: DE,IX
```

The multi-line form remains useful for long or manually documented routines,
but the compact form should be the default machine-emitted style. The AZMDoc
spec in `docs/spec/azmdoc.md` should be updated before implementation so the
parser, contract updater, and D8 metadata writer share one source-facing
contract grammar.

Example:

```json
{
  "name": "CHECK_COLLISION_AT_DE",
  "kind": "label",
  "subkind": "routine",
  "address": 16640,
  "contract": {
    "in": ["D", "E"],
    "out": ["carry"],
    "clobbers": ["A"]
  },
  "documentation": {
    "summary": "Tests candidate active-piece placement against walls, floor, and board rows.",
    "sourceRange": {
      "file": "src/collision.asm",
      "startLine": 20,
      "endLine": 24
    }
  }
}
```

The source of truth should be the same parser/analyzer used by register contracts
tools. Debug80 should not mine prose comments for meaning.

### 4. Richer symbol classification

Richer symbol kinds are valuable, but AZM should sequence them after the source
facts that make them defensible.

Near-term classifications:

- `label` plus `subkind: "routine"` for explicit `@Name:` routine entries;
- `label` plus `subkind: "code-label"` for ordinary code labels when known;
- `data` with storage metadata for memory declarations;
- `constant` for value-only symbols;
- `macro` or `op` for visible expansion definitions as the implementation
  makes that distinction reliable.

Later classifications can include enum members, layout fields, imported
interface routines, and references.

### 5. Layout and enum metadata

Layout and enum metadata should be emitted from AZM's semantic model, not
re-parsed from source text in the D8 writer. The intended shape is useful:

- layout type name;
- exact packed size;
- fields with offsets, sizes, scalar/layout type, and array count;
- union variants where relevant;
- enum name, members, values, and source locations.

This unlocks structured debugger memory views and better editor symbols while
staying inside AZM's compile-time layout model.

### 6. Source ranges and reference records

Column/range data and reference records are worthwhile, but they should follow
the source graph, storage, routine, and type work. They require reliable spans
through includes, aliases, visible `op` expansion, constants, layout paths, and
macro-like constructs.

The key design constraint is that references should be resolved assembler
references, not text search hits. If AZM cannot resolve a reference confidently,
it should omit or mark it as low-confidence rather than invite unsafe rename or
Find All References behavior.

## Debug80 fallback contract

Debug80's proposed fallback rules are the right posture and AZM should preserve
that contract in its documentation:

- no source map: ask the user to build;
- stale or uncertain source map: warn, but keep using it;
- no storage/type metadata: show raw bytes and avoid guessing;
- value-only symbol: show as a constant, not as a memory location;
- no routine contract: show name, address, and source location only;
- no layout metadata: do not invent structure from source text.

This keeps Debug80 useful before every roadmap item is implemented and prevents
metadata gaps from turning into false precision.

## Open design questions

### D8 naming

AZM currently emits `.d8.json` and uses D8/D8M names in code and docs. Debug80
should use user-facing language like "source map" or "build map". AZM can keep
the file and type names for compatibility while documenting the artifact as the
Debug80 source map.

### Type references versus display hints

`typeRef` should identify an assembler layout or enum fact. `display` should
remain a debugger hint. AZM should not need to decide every display policy.
Debug80 can choose whether to render bytes, words, ASCII, enum names, or layout
trees, with raw memory always available.

### Confidence levels

D8 segments already have confidence. Richer metadata may need the same idea for
classification and references. For example, an explicit `@Name:` routine entry
is high confidence; an inferred code label may be medium confidence; a text-like
data preview is only a display hint.

### Compatibility with external contracts

Imported `.asmi` routines may deserve source-map records even without addresses.
Those records are useful for hover/help but are not breakpoint anchors. The
schema should keep addressable symbols and interface-only symbols distinct.

## Recommended next step

The first AZM implementation slice should be small and evidence-backed:

1. add complete source graph/freshness metadata to D8;
2. add declaration/storage metadata for `.db`, `.dw`, `.ds`, `.cstr`, `.pstr`,
   and `.istr` data symbols;
3. update `D8mJson`/`D8mSymbol` types and `docs/reference/tooling-api.md`;
4. add unit tests for the writer and compile/API contract tests using a fixture
   with includes, constants, labels, and data declarations;
5. leave Debug80 to consume the new optional fields when ready.

After that, routine contract metadata is the next best slice because it connects
directly to retained AZMDoc/register contracts work and gives immediate value in
editor hovers. That slice should also update the AZMDoc spec to accept compact
single-line contracts and make compact contracts the preferred generated style.
