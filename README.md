# AZM

AZM is the Z80 assembler used by the Debug80 toolchain. It assembles plain
`.asm` and `.z80` source into machine-code artifacts for hardware, emulators,
and Debug80: Intel HEX, flat binary, Debug80 maps, and optional
ASM80-compatible lowered source.

The user manual is the AZM book in the Debug80 documentation site:

[AZM Assembler Manual](https://jhlagado.github.io/debug80-docs/azm-book/book4/)

## What AZM Is

AZM is an assembler, not a high-level language or macro preprocessor. Source is
intended to stay close to the machine: labels, directives, instructions, data,
register contracts, and generated artifacts remain visible.

AZM keeps the parts of the original assembler that matter for real Z80 work:

- Z80 instructions with case-insensitive mnemonics and registers
- case-sensitive labels and symbols
- global labels, with `@NAME:` labels marking routine entries for register-care
  analysis
- canonical dotted directives such as `.org`, `.equ`, `.db`, `.dw`, and `.ds`
- exact compatibility spelling for common undotted directive heads such as
  `ORG`, `EQU`, `DB`, `DW`, and `DS`
- lowercase, case-sensitive canonical dotted directives; compatibility spellings
  are handled as directive aliases, not as canonical AZM style
- colon labels are address labels only; declarations use name-left forms such as
  `Name .equ`, `Name .enum`, `Name .type`, `Name .union`, and
  `Name .typealias`
- textual `.include`
- conditional source inclusion with lowercase `.if`, `.else`, and `.endif`
- register-care contracts, AZMDoc comments, and `.asmi` external interfaces
- `op` definitions for structured inline instruction idioms
- enums and qualified enum constants
- `.type` / `.union` layout metadata and `Name .typealias TypeExpr` layout aliases
- compile-time layout constants such as `sizeof(...)`, `offset(...)`, scalar
  layout sizes, constant-only layout casts, `LSB(...)`, and `MSB(...)`
- case-sensitive AZM function names with documented spelling, such as
  `sizeof(...)`, `offset(...)`, `LSB(...)`, and `MSB(...)`
- data directives including `.db`, `.dw`, `.ds`, `.cstr`, `.pstr`, and `.istr`
- single quotes are character literals; double quotes are strings

AZM does not implement text macros, local labels, modules/imports, `func`,
formal arguments, generated stack frames, runtime structured control flow, typed
assignment lowering, hidden typed load/store lowering, or named section blocks.
Those features belong to older high-level ZAX-era code paths, not current AZM
source.

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

## Command Line

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

Run register-care analysis:

```sh
azm --rc audit --reg-report program.asm
azm --rc error --interface monitor.asmi program.asm
```

See [docs/reference/cli.md](docs/reference/cli.md) for the complete option
reference.

## Output Artifacts

By default, AZM writes the requested primary output plus useful side artifacts
using the same base path.

| Extension      | Contents                                      |
| -------------- | --------------------------------------------- |
| `.hex`         | Intel HEX                                     |
| `.bin`         | flat binary                                   |
| `.d8.json`     | Debug80 map                                   |
| `.z80`         | ASM80-compatible lowered source when enabled  |
| `.regcare.txt` | register-care report when enabled             |
| `.asmi`        | inferred register-care interface when enabled |

The `.z80` output is a generated compatibility artifact for ASM80-style
workflows and comparison tooling. BIN, HEX, Debug80 maps, and
register-care reports are the normal production outputs.

## Small Example

```asm
        .org 0100H

@START:
        ld      a,42
        ret
```

Compile it:

```sh
azm --type bin --output build/start.bin start.asm
```

## Programmatic API

`@jhlagado/azm` exposes Node entry points for tools:

- `@jhlagado/azm`
- `@jhlagado/azm/tooling`
- `@jhlagado/azm/compile`

Minimal compile example:

```ts
import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

const result = await compile(
  '/abs/path/to/main.asm',
  {
    outputType: 'hex',
    sourceRoot: '/abs/path/to/project',
    d8mInputs: {
      hex: '/abs/path/to/project/build/main.hex',
    },
  },
  { formats: defaultFormatWriters },
);

console.log(result.diagnostics);
```

See [docs/reference/tooling-api.md](docs/reference/tooling-api.md) for current
API notes.

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

The live source map is maintained in
[docs/reference/source-overview.md](docs/reference/source-overview.md).

## License

GPL-3.0-only. See [LICENSE](LICENSE).
