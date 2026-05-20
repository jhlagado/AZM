# AZM

AZM is a Z80 assembler in the ASM80 tradition, with a stricter native surface and modern safety tooling.

The goal is not to turn assembly into a high-level language. AZM keeps the machine visible: labels, directives, instructions, explicit branches, explicit data, and visible generated metadata.

## Direction

AZM keeps:

- ASM80-style `.asm` / `.z80` assembly as the baseline
- textual `.include`
- directive aliases for importing common assembler spellings
- register-care analysis and AZMDoc contracts
- AST-level `op` extensions
- compile-time layout constants such as `sizeof(...)`, `offset(...)`, and layout casts

AZM native source rejects old ZAX high-level features such as `func`, modules/imports, formal arguments, locals, typed assignment, structured control, generated frames, typed storage blocks, and named section blocks. Those inherited paths are temporary removal work, not product compatibility.

## Install

Requires Node.js 20+.

```sh
git clone https://github.com/jhlagado/AZM.git
cd AZM
npm install
npm run azm -- path/to/program.z80
```

Output files for each compiled source:

| Extension  | Contents                  |
| ---------- | ------------------------- |
| `.hex`     | Intel HEX                 |
| `.bin`     | Flat binary               |
| `.lst`     | Byte dump plus symbols    |
| `.z80`     | ASM80-compatible emission |
| `.d8.json` | Debug80 map               |

```text
azm [options] <entry.asm|entry.z80>

  -o, --output <file>    Primary output path
  -t, --type <type>      Primary output type: hex|bin
  -I, --include <dir>    Add include search path
  --aliases <file>       Load directive aliases
  --rc <mode>            Register-care mode
  --contracts            Update AZM contract comments
  --fix                  Apply conservative register-care fixes
  -V, --version
  -h, --help
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
