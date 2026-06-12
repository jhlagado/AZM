# AZM

AZM is the Z80 assembler used by the Debug80 toolchain. It assembles `.asm`
and `.z80` source into Intel HEX, flat binary and Debug80 map artifacts for
hardware, emulators and Debug80.

This README is the condensed manual. The Debug80 website contains the detailed
AZM manual and broader Debug80 documentation:

- [Debug80 documentation](https://debug80.com/)
- [AZM Book 0 — Assembler Manual](https://debug80.com/azm-book/book0/)
- [AZM Book 4](https://jhlagado.github.io/debug80-docs/azm-book/book4/)

## Install

AZM requires Node.js 20 or newer.

```sh
npm install -g @jhlagado/azm
azm path/to/program.asm
```

From a checkout, build first and then use the local CLI:

```sh
npm ci
npm run build
npm run azm -- examples/hello.asm
```

## First Program

```asm
        .org $0100

@Start:
        ld      a,42
        ret
```

Assemble it:

```sh
azm start.asm
```

`.org` means origin. It sets the assembly address for the bytes that follow.
`@Start:` is an address label and also a public routine entry for register contracts
analysis. The Z80 instructions assemble at `$0100`.

## Source Style

AZM source is built from labels, declarations, directives, Z80 instructions,
data definitions, layout declarations, register contract comments and optional
inline `op` definitions.

Canonical AZM directives are lowercase and dotted:

```asm
.org
.equ
.db
.dw
.ds
.field
.type
.endtype
.union
.endunion
.typealias
.enum
.include
```

Z80 instruction mnemonics and registers are case-insensitive. Labels, constants,
enum names, type names and AZM function names are case-sensitive.

Use a colon for address labels:

```asm
Loop:
        djnz    Loop
```

Use name-left declarations for constants, enums, records, unions and type
aliases:

```asm
COUNT       .equ 8
Colour      .enum Red, Green, Blue
SpriteArray .typealias Sprite[16]
```

### Style Guide

AZM is stricter than many older Z80 assemblers. It accepts compatibility aliases
so existing source can be assembled, but source that you control should use the
canonical syntax below. These rules are intended to make AZM source predictable
for people and coding agents.

Use lowercase dotted directives, not legacy aliases:

```asm
        .org     0x4000
        .include "../shared/constants.asm"

MOVE_PERIOD     .equ     128

Message:
        .db      "READY",0

StatePtr:
        .dw      0

Buffer:
        .ds      32
```

Use `@Name:` for callable routine entries. The `@` marks a register contracts
routine boundary; call sites still write the symbol name without `@`:

```asm
;! in A; out A; clobbers BC
@MxMask:
        LD      C,A
        OR      A
        LD      A,0x80
        JR      Z,MxMaskDone
MxMaskLp:
        SRL     A
        DJNZ    MxMaskLp
MxMaskDone:
        RET
```

Use plain labels for data and internal branch targets. Plain labels are global,
so give branch labels names that stay unique across the whole include tree.
Prefer descriptive labels such as `MxMaskLoop`, `MxMaskDone`, `SpawnFailed` and
`HeldDirRateSet` rather than generic names such as `Loop` or `Done`.

Use uppercase with underscores for constants, following the usual C-style
convention. Group related constants with clear prefixes:

```asm
PORT_DIGITS     .equ     0x01
PORT_LCD_DATA   .equ     0x84

API_SCAN_KEYS   .equ     16
KEY_LEFT        .equ     0x11
KEY_RIGHT       .equ     0x10

COLOR_RED       .equ     0x01
COLOR_GREEN     .equ     0x02
COLOR_YELLOW    .equ     COLOR_RED + COLOR_GREEN
```

Use PascalCase for routine entries, branch labels, data labels, type names and
enum names. Use lower camel case for fields and enum members when that makes
layout expressions easier to read. The assembler enforces uniqueness, not style,
but symbols are case-sensitive: `ColorRed`, `COLOR_RED` and `colorRed` are
different names.

Put declaration names on the left and do not use a colon for constants, enums,
types or type aliases:

```asm
MOVE_PERIOD     .equ     128
Colour          .enum    Red, Green, Blue
SpriteArray     .typealias Sprite[16]

Sprite          .type
x               .field   byte
y               .field   byte
tile            .field   byte
flags           .field   byte
                .endtype
```

Use a colon only for address labels. `COUNT .equ 8` declares a constant;
`Count:` declares an address label. Do not write `COUNT: .equ 8` in canonical
AZM.

Use indentation to make columns easy to scan. Put labels at the left margin,
indent instructions and standalone directives, and align operands enough to keep
dense assembly readable. Exact tab width is less important than keeping one
source file internally consistent.

## Literals

AZM accepts the usual Z80 numeric forms:

```asm
$FF         ; hexadecimal
0FFH        ; hexadecimal with trailing H
%10101010   ; binary
42          ; decimal
'A'         ; character literal
"HELLO"     ; string literal
```

A trailing `H` hexadecimal literal must start with a decimal digit, so `0FFH`
is hexadecimal 255. Double quotes are used for strings. Single quotes are used
for character literals.

`$` also names the current assembly address when it appears as a bare
expression term:

```asm
TableStart:
        .db 1,2,3,4
TableEnd:
TABLE_SIZE .equ $ - TableStart
```

## Data and Storage

`.db` emits bytes. `.dw` emits 16-bit words in Z80 little-endian order, with the
least significant byte stored first. `.ds` reserves storage.

```asm
Message:
        .db "READY",0

Vector:
        .dw Handler

Buffer:
        .ds 32
```

String directives encode common string layouts:

```asm
NameC:
        .cstr "READY"     ; C string, terminated by zero

NameP:
        .pstr "READY"     ; Pascal string, length byte first

NameI:
        .istr "READY"     ; high bit set on final character
```

## Layout Types

AZM has assembler-time layout declarations for records, unions and arrays. They
describe byte layout so the assembler can calculate sizes, field offsets and
structured addresses.

Start with explicit fields:

```asm
Sprite .type
x      .field byte
y      .field byte
tile   .field byte
flags  .field byte
       .endtype
```

Each `.field` receives a layout type expression. `byte` allocates one byte and
`word` allocates two bytes. Arrays use square brackets:

```asm
Palette .type
entries .field byte[16]
        .endtype
```

`sizeof` gives the byte size of a type expression. `offset` gives the byte
offset of a field path:

```asm
SPRITE_SIZE .equ sizeof(Sprite)
FLAGS_OFF   .equ offset(Sprite, flags)
```

Type aliases give a reusable name to a layout expression:

```asm
SpriteArray .typealias Sprite[16]

Sprites:
        .ds SpriteArray

SPRITES_SIZE .equ sizeof(SpriteArray)
```

A type alias is transparent. `SpriteArray` means `Sprite[16]` anywhere a layout
type expression is valid.

Layout casts apply a type to an address expression so fields can be addressed by
name:

```asm
        ld      hl,<SpriteArray>Sprites[3].flags
        ld      a,(<SpriteArray>Sprites[3].tile)
```

The cast performs assembler-time address calculation. Runtime indexing still
uses Z80 instructions.

## Enums

Enums are grouped constants. Members are qualified by the enum name:

```asm
Colour .enum Red, Green, Blue

        .db Colour.Red
        .db Colour.Green
        .db Colour.Blue
```

In this example `Colour.Red` is `0`, `Colour.Green` is `1` and `Colour.Blue` is
`2`.

## Includes

`.include` inserts another source file at the current point:

```asm
        .include "hardware.asm"
        .include "sprites.asm"
```

Include search paths are added with `-I`:

```sh
azm -I include -I vendor program.asm
```

Included source contributes labels, constants, enums, types, ops and routines to
the same assembly.

## Imports

`.import` is AZM's module-style source composition directive:

```asm
; main.asm
        .import "keyboard.asm"

@Start:
        call    ReadKey
        ret
```

```asm
; keyboard.asm
@ReadKey:
        call    ScanMatrix
        ret

ScanMatrix:
        xor     a
        ret
```

Imported source assembles at the point where `.import` appears, so native
`.bin`, `.hex` and `.d8.json` output contain the imported bytes as part of the
same program. Paths resolve like includes: relative to the importing file first,
then through `-I` include directories.

The difference is visibility. In an imported file, labels written with `@` are
public exports. Code outside `keyboard.asm` can call `ReadKey`, using the name
without `@`. Plain labels in an imported file, such as `ScanMatrix`, are private
to that imported file or import unit. The imported file may call its own private
helpers, but outside references fail with a direct visibility diagnostic.

`.include` remains textual. Included text belongs to the including source unit
and is intended for shared constants, declarations and compatibility source.
Use `.import` when a source file should behave like a module with public `@`
entry points and private implementation labels.

Repeated imports of the same resolved file are idempotent: the first import
loads and emits the module, later imports of that same file are skipped.
Repeated includes are still textual and repeat every time. Recursive includes or
imports are rejected with source diagnostics.

Register contracts use the same `@` routine boundaries across imported files.
Imported public routines are analyzed as internal routines under `--rc strict`,
and private helpers called inside an imported public routine are summarized as
part of the same program analysis.

ASM80-compatible lowered `.z80` output does not yet support imported source
units. If `--asm80` is requested for a program that uses `.import`, AZM reports
an explicit `AZMN_ASM80` diagnostic instead of silently flattening the module
boundary. Use native `.bin`, `.hex` and `.d8.json` output for imported programs.

## Register Contracts

Register contracts check whether subroutines preserve the register values that their
callers still need. It is designed to catch register collisions, a common source
of assembly bugs.

The benefit is practical: AZM can stop a plausible-looking routine at compile
time when it reads a register after calling code that may clobber it. In larger
Z80 projects this encourages smaller routines, clearer `@` boundaries, explicit
helper outputs, and proof or test harnesses that stay honest under
`--rc strict`. The friction is intentional: strict contracts make hidden
register and stack assumptions visible before they become debugger sessions.

Routine entry labels start with `@`:

```asm
;! in A,HL; out carry; clobbers B
@CheckTile:
        ld      b,(hl)
        cp      b
        ret
```

The label is written as `@CheckTile:` at the routine entry. Calls use the public
name:

```asm
        call    CheckTile
```

AZMDoc register contract comments use `;!` and may record inputs, outputs,
clobbered registers and preserved registers. Separate clauses on the same line
with semicolons. Older one-clause-per-line comments are still accepted, but AZM
generated annotations use the compact single-line form. `clobbers B` means the
routine may change `B`. `preserves B` means the value that enters in `B` is
still present when the routine returns.

Run the analysis with:

```sh
azm --rc audit program.asm
azm --rc warn program.asm
azm --rc error --interface monitor.asmi program.asm
azm --rc strict program.asm
```

The main modes are `audit`, `warn`, `error` and `strict`. Use `audit` for a
non-blocking check, `warn` for visible diagnostics with a successful compile,
`error` to fail on proven caller/callee register conflicts, and `strict` to fail
on any register contracts issue AZM cannot prove safe, including unknown call
boundaries and unbalanced or unknown stack effects.

The normal register contracts interface is compiler diagnostics plus source
contracts. Use `--contracts` or `--fix` when you want AZM to update compact
AZMDoc contract comments in source. Use `.asmi` files for externally assembled
routines or monitor/system APIs. Text report files are available with
`--reg-report`, but they are an explicit debug/export option and are not part of
the normal workflow.

## Ops and Aliases

`op` definitions name short inline instruction idioms:

```asm
op clear_a()
        xor     a
end

        clear_a
```

The operation expands inline at the use site.

AZM also has directive aliases for common legacy source. Native AZM style uses
lowercase dotted directives such as `.org`, `.equ`, `.db`, `.dw` and `.ds`.
Legacy source can use familiar undotted directive heads such as `ORG`, `EQU`,
`DB`, `DW` and `DS`.

## Command Line

The command form is:

```sh
azm [options] <entry.asm|entry.z80>
```

The entry file is the final argument. Source entries use `.asm` or `.z80`.
External register contract interfaces use `.asmi` and are loaded with
`--interface`.

Basic use writes the default artifact set next to the source file:

```sh
azm program.asm
```

Write a specific primary output:

```sh
azm --type bin --output build/program.bin program.asm
azm --type hex --output build/program.hex program.asm
```

Add include search paths:

```sh
azm -I include -I vendor program.asm
```

Normalize Debug80 map source paths against the project root:

```sh
azm --source-root . --output build/program.hex src/program.asm
```

Load project directive aliases:

```sh
azm --aliases azm.aliases.json program.asm
```

Suppress selected default artifacts:

```sh
azm --nod8m program.asm
azm --nobin program.asm
azm --nohex program.asm
```

Generate ASM80-compatible lowered source:

```sh
azm --asm80 program.asm
```

Run register contracts analysis:

```sh
azm --rc audit program.asm
azm --rc warn program.asm
azm --rc error --interface monitor.asmi program.asm
azm --rc strict program.asm
azm --contracts --rc audit program.asm
```

The main switches are:

| Option                                        | Meaning                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `-o, --output <file>`                         | Primary output path. The extension matches `--type`.                |
| `-t, --type <hex\|bin>`                       | Primary output type. Default: `hex`.                                |
| `--nobin`                                     | Skip `.bin` output.                                                 |
| `--nohex`                                     | Skip `.hex` output.                                                 |
| `--nod8m`                                     | Skip `.d8.json` output.                                             |
| `--asm80`                                     | Write lowered assembler source as `.z80`.                           |
| `--source-root <dir>`                         | Emit project-relative source paths in `.d8.json`.                   |
| `--case-style <mode>`                         | Lint mnemonic, register and op-head case style.                     |
| `--rc, --register-contracts <mode>`           | Register contracts mode: `off`, `audit`, `warn`, `error`, `strict`. |
| `--reg-report, --emit-register-report`        | Opt-in debug report: write `.regcontracts.txt`.                     |
| `--reg-interface, --emit-register-interface`  | Write inferred `.asmi` interface metadata.                          |
| `--contracts, --annotate-register-contracts`  | Update AZMDoc contract comments in source.                          |
| `--fix`                                       | Apply conservative register contract source fixes.                  |
| `--accept-out <routine:carrier>`              | Promote an inferred output candidate while annotating.              |
| `--interface <file>`                          | Load external register contracts from `.asmi`.                      |
| `--reg-profile, --register-profile <profile>` | Register contracts profile. Currently `mon3`.                       |
| `--aliases <file>`                            | Load project directive alias JSON.                                  |
| `-I, --include <dir>`                         | Add an include search path.                                         |
| `-V, --version`                               | Print package version.                                              |
| `-h, --help`                                  | Print CLI help.                                                     |

See the [AZM Engineering Manual](docs/codebase/) for the maintained codebase,
CLI and package-interface reference.

## Output Artifacts

By default, AZM writes the requested primary output plus useful side artifacts
using the same base path.

| Extension           | Contents                                     |
| ------------------- | -------------------------------------------- |
| `.hex`              | Intel HEX                                    |
| `.bin`              | flat binary                                  |
| `.d8.json`          | Debug80 map                                  |
| `.z80`              | ASM80-compatible lowered source when enabled |
| `.regcontracts.txt` | opt-in register contracts debug report       |
| `.asmi`             | register contracts interface when enabled    |

## Programmatic API

`@jhlagado/azm` exposes stable Node entry points for tools. Import from these
package paths:

- `@jhlagado/azm`
- `@jhlagado/azm/tooling`
- `@jhlagado/azm/compile`

Install the package:

```sh
npm install @jhlagado/azm
```

Use `@jhlagado/azm/tooling` when an editor, linter or debugger integration
needs parsing, diagnostics, symbols, semantic checks or register contract facts in
memory:

```ts
import {
  analyzeProgram,
  analyzeRegisterContractsForTools,
  loadProgram,
} from '@jhlagado/azm/tooling';

const loaded = await loadProgram({
  entryFile: '/abs/path/to/main.asm',
  includeDirs: ['/abs/path/to/includes'],
});

if (loaded.loadedProgram) {
  const analysis = analyzeProgram(loaded.loadedProgram, {
    caseStyle: 'consistent',
    requireMain: false,
  });

  const registerContracts = analyzeRegisterContractsForTools(loaded.loadedProgram, {
    mode: 'audit',
    registerContractsProfile: 'mon3',
  });

  console.log(analysis.diagnostics);
  console.log(registerContracts.candidateDiagnostics);
}
```

`loadProgram()` also accepts `preloadedText` for an unsaved editor buffer and
`signal` for cancellation.

Use `@jhlagado/azm/compile` when a tool needs assembled bytes, Intel HEX,
Debug80 map data or other artifacts in memory:

```ts
import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

const result = await compile(
  '/abs/path/to/main.asm',
  {
    includeDirs: ['/abs/path/to/includes'],
    outputType: 'hex',
    emitBin: true,
    emitHex: true,
    emitD8m: true,
    sourceRoot: '/abs/path/to/project',
    d8mInputs: {
      hex: '/abs/path/to/project/build/main.hex',
      bin: '/abs/path/to/project/build/main.bin',
    },
    registerContracts: 'audit',
    registerContractsInterfaces: ['/abs/path/to/monitor.asmi'],
  },
  { formats: defaultFormatWriters },
);

console.log(result.diagnostics);

const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
const binary = result.artifacts.find((artifact) => artifact.kind === 'bin');
console.log(d8m, binary);
```

The compile API returns artifacts in memory. The CLI uses the same writers to
write those artifacts to disk.

Common programmatic options include:

| Option                          | Use                                                       |
| ------------------------------- | --------------------------------------------------------- |
| `includeDirs`                   | Include search paths, like repeated `-I`.                 |
| `directiveAliasFiles`           | Project directive alias JSON files.                       |
| `sourceRoot`                    | Stable project-relative paths in Debug80 maps.            |
| `d8mInputs`                     | Intended artifact paths recorded in Debug80 map metadata. |
| `outputType`                    | Primary output type, `hex` or `bin`.                      |
| `emitBin`, `emitHex`, `emitD8m` | Select in-memory artifact kinds.                          |
| `emitAsm80`                     | Request lowered `.z80` artifact.                          |
| `registerContracts`             | Register contracts mode.                                  |
| `registerContractsInterfaces`   | External `.asmi` contract files.                          |

Public tooling types include `Diagnostic`, `LoadedProgram`,
`AnalyzeProgramResult`, `LoadProgramResult`, `RegisterContractsCandidateDiagnostic`
and the Debug80 map artifact types `D8mArtifact`, `D8mJson` and `D8mSymbol`.

See the [public surface reference](docs/codebase/appendices/c-public-surface-reference.md)
for current API notes.

## Development

Useful local verification lanes:

```sh
npm run build
npm run typecheck
npm run lint
npm run test:azm:alpha
npm run test:azm:corpus
npm test
```

The live source map is maintained in the
[AZM Engineering Manual](docs/codebase/).

## License

GPL-3.0-only. See [LICENSE](LICENSE).
