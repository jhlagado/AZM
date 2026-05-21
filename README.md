# AZM

AZM is a Z80 assembler in the ASM80 tradition: plain assembly input, predictable
object output, and modern safety tooling for projects that still want to see the
machine.

The project goal is a good assembler, not a high-level language. AZM keeps
labels, directives, instructions, branches, data bytes, register effects, and
generated metadata visible in source and artifacts.

## Product boundary

AZM keeps:

- ASM80-style `.asm` / `.z80` source as the input baseline
- `.asmi` external interface files for register-care contracts
- textual `.include`
- directive aliases for importing common assembler spellings
- register-care analysis, compact AZMDoc comments, and `.asmi` external
  contracts
- AST-level `op` extensions
- enums as constant namespaces
- `.type` / `.union` layout metadata
- compile-time layout constants such as `sizeof(...)`, `offset(...)`, scalar
  layout sizes, and constant-only layout casts
- assembler data directives including `.db`, `.dw`, `.ds`, `.cstr`, `.pstr`,
  and `.istr`

AZM `.asm` and `.z80` source rejects old ZAX high-level features such as
modules/imports, `func`, formal arguments, locals, typed assignment/storage
lowering, structured control, generated frames, typed storage blocks, and named
section blocks. Those inherited paths are removal work, not product
compatibility.

## Install

Requires Node.js 20+.

```sh
npm install -g @jhlagado/azm
azm path/to/program.z80
```

From a checkout, use the local CLI after building:

```sh
npm ci
npm run build
npm run azm -- examples/hello.asm
```

Output files for each compiled source:

| Extension  | Contents                  |
| ---------- | ------------------------- |
| `.hex`     | Intel HEX                 |
| `.bin`     | Flat binary               |
| `.lst`     | Byte dump plus symbols    |
| `.z80`     | Plain Z80 source emission |
| `.d8.json` | Debug80 map               |

Small input example:

```asm
        ORG 0100H
START:
        LD A,42
        RET
```

Compile a binary and listing:

```sh
azm --type bin --output build/start.bin start.asm
```

```text
azm [options] <entry.asm|entry.z80>

Options:
  -o, --output <file>   Primary output path (must match --type extension)
  -t, --type <type>     Primary output type: hex|bin (default: hex)
  -n, --nolist          Suppress .lst
      --nobin           Suppress .bin
      --nohex           Suppress .hex
      --nod8m           Suppress .d8.json
      --asm80           Emit assembler-valid lowered source (.z80)
      --source-root <d> Normalize D8 source paths relative to this directory
      --case-style <m>  Case-style lint mode: off|upper|lower|consistent
      --rc <m>            Register-care mode: off|audit|warn|error|strict
      --reg-report       Emit .regcare.txt report
      --reg-interface    Emit inferred register-care interface (.asmi)
      --fix             Apply conservative register-care source fixes
      --contracts       Update source AZM contract blocks in place
      --accept-out <r:c> Promote inferred output candidate while annotating
      --interface <file> Load register-care interface contracts
      --reg-profile <p> Register-care profile: mon3
      --aliases <file>  Load project directive alias JSON (repeatable)
  -I, --include <dir>   Add include search path (repeatable)
  -V, --version         Print version
  -h, --help            Show help
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
      listing: '/abs/path/to/project/build/main.lst',
    },
  },
  { formats: defaultFormatWriters },
);

console.log(result.diagnostics);
```

See [docs/reference/cli.md](docs/reference/cli.md) for the full CLI reference
and [docs/reference/tooling-api.md](docs/reference/tooling-api.md) for the
current API notes.

## Verification

Useful local verification lanes:

```sh
npm run build
npm run test:azm:alpha
npm run test:azm:corpus
npm test
```

## License

GPL-3.0-only. See [LICENSE](LICENSE).
