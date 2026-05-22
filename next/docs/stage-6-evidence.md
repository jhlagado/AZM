# Stage 6 Evidence: Directives, Storage, Strings, Ranges, and Image

Status: implemented for the Stage 6 closeout surface.

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
- `.db` emits initialized byte values and quoted string fragments.
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

## Directive, Storage, Range, and Image Closeout

Additional evidence read for the closeout slice:

- `test/asm80/asm80_directives_integration.test.ts`
- `test/asm80/asm80_align_directive.test.ts`
- `test/pr786_raw_data_lowering.test.ts`
- `test/fixtures/pr786_raw_data_lowering.asm`
- `src/formats/writeBin.ts`
- `src/lowering/asmDirectiveLowering.ts`
- `src/frontend/asm80/parseAsmRawValues.ts`
- sibling checkout `debug80-docs/azm-book/book1/03-assembly-language.md`

This slice implements the remaining Stage 6 behaviors proven by those sources:

- `.db` accepts quoted string fragments inside comma-separated byte lists.
- One-character quoted values still participate in expressions, so
  `.db "a"-"A"` emits `20`.
- `.ds n` reserves zero-filled addresses when those addresses fall inside the
  selected binary range, but trailing reserve-only storage does not extend the
  default loadable binary.
- `.ds n,fill` emits initialized repeated fill bytes.
- `.align n` emits zero padding through the next multiple of `n`.
- `.end` stops ordinary source emission, while post-`.end` `.binfrom` and
  `.binto` controls remain active.
- `.binfrom` chooses the inclusive binary start address.
- `.binto` chooses the inclusive binary upper bound and pads with zero bytes
  through that bound.
- Multiple `.org` blocks are placed by address in the assembly image rather
  than by source order.
- The `bytes` result is the BIN-compatible selected byte range, and `hexText`
  is emitted from the same selected image range.
