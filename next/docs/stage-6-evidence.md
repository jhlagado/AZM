# Stage 6 Evidence: Directives, Storage, Strings, Ranges, and Image

Status: active evidence pack.

Stage 6 moves AZM Next beyond instruction encoding into source-layout behavior:
directives, initialized and reserved storage, string storage forms, binary image
boundaries, and output artifacts. Current AZM remains the source of truth; each
slice should cite current tests, fixtures, docs, or AZM book examples before
implementing behavior.

## Evidence Read

Current AZM tests and fixtures inspected for the initial Stage 6 boundary:

- `test/asm80/asm80_string_directives.test.ts`
- `test/asm80/asm80_directives_integration.test.ts`
- `test/pr786_raw_data_lowering.test.ts`
- `test/fixtures/pr786_raw_data_lowering.asm`
- `docs/reference/source-overview.md`
- sibling checkout `debug80-docs/azm-book/book1/03-assembly-language.md`
- sibling checkout `debug80-docs/azm-book/introduction.md`

The current evidence proves these broad Stage 6 responsibilities:

- `.org` places subsequent bytes at an explicit address, and source order does
  not determine final placement.
- `.db` emits initialized byte values; current AZM also accepts string
  fragments in `.db`, but that is not part of the first Stage 6 slice.
- `.dw` emits little-endian initialized word values, including symbolic fixups.
- `.ds` reserves zero-filled storage in the output image when it lies inside
  the selected binary range; current AZM can omit trailing reserve-only storage
  from the default loadable binary.
- `.cstr`, `.pstr`, and `.istr` emit initialized string bytes with C-style,
  Pascal-style, and high-bit-final termination respectively.
- `.binfrom` and `.binto` crop or pad the loadable BIN range, with `.binto`
  acting as an inclusive upper bound.
- HEX output is emitted from the assembled byte image.

## String Directive Slice

Additional evidence read for this slice:

- `test/asm80/asm80_string_directives.test.ts`
- `src/lowering/asmRawDataLowering.ts`
- `docs/reference/source-overview.md`
- sibling checkout `debug80-docs/azm-book/book1/03-assembly-language.md`

This slice implements only quoted-string operands for the three retained string
storage directives:

- `.cstr "OK"` emits `4F 4B 00`
- `.pstr "OK"` emits `02 4F 4B`
- `.istr "OK"` emits `4F CB`

The first slice deliberately keeps the parser boundary narrow:

- string directives accept exactly one double-quoted string operand
- labels before the directive are supported through the existing label-plus-
  statement parser path
- directive aliases `CSTR`, `PSTR`, and `ISTR` normalize to their dotted
  canonical forms
- backslash keeps the following character literally, matching current raw
  string parsing; this slice does not introduce C-style escape semantics
- non-string operands are diagnostics rather than symbolic expressions

Later Stage 6 slices should address `.db` string fragments, `.ds` fill and
range behavior, `.binfrom`/`.binto`, trailing reserve-only binary trimming, and
explicit BIN artifact modeling.
