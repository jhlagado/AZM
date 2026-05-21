# AZM

AZM is a Z80 assembler in the ASM80 tradition, with a stricter assembler surface and modern safety tooling.

The goal is not to turn assembly into a high-level language. AZM keeps the machine visible: labels, directives, instructions, explicit branches, explicit data, and visible generated metadata.

## Direction

AZM keeps:

- ASM80-style `.asm` / `.z80` assembly as the baseline
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

AZM `.asm` and `.z80` source rejects old ZAX high-level features such as `func`, modules/imports, formal arguments, locals, typed assignment, structured control, generated frames, typed storage blocks, and named section blocks. Those inherited paths are temporary removal work, not product compatibility.

## Install

Requires Node.js 20+.

```sh
npm install -g @jhlagado/azm
azm path/to/program.z80
```

Output files for each compiled source:

| Extension  | Contents                  |
| ---------- | ------------------------- |
| `.hex`     | Intel HEX                 |
| `.bin`     | Flat binary               |
| `.lst`     | Byte dump plus symbols    |
| `.z80`     | Plain Z80 source emission |
| `.d8.json` | Debug80 map               |

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

See [docs/tooling-api.md](docs/tooling-api.md) for the current API notes.

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
