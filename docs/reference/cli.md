# AZM CLI Reference

Status: active user reference

The `azm` command assembles `.asm` and `.z80` source files and writes the
requested object artifacts.

```sh
azm [options] <entry.asm|entry.z80>
```

The entry file must be the final argument. AZM source uses `.asm` or `.z80`.
Register-care interface files use `.asmi`; they are loaded with `--interface`
and are not compile entries.

## Basic Use

Build the default artifact set next to the source file:

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

Load project directive aliases:

```sh
azm --aliases azm.aliases.json program.asm
```

Normalize Debug80 map source paths against the project root:

```sh
azm --source-root . --output build/program.hex src/program.asm
```

## Output Artifacts

By default AZM writes the primary output plus useful side artifacts using the
same base path.

| Artifact       | Meaning                          |
| -------------- | -------------------------------- |
| `.hex`         | Intel HEX output                 |
| `.bin`         | flat binary output               |
| `.d8.json`     | Debug80 map                      |
| `.z80`         | lowered assembler source         |
| `.regcare.txt` | register-care report             |
| `.asmi`        | inferred register-care interface |

Disable standard artifacts when they are not needed:

```sh
azm --nod8m program.asm
azm --nobin --nohex --reg-report --rc audit program.asm
```

## Options

| Option                                        | Meaning                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `-o, --output <file>`                         | Primary output path. The extension must match `--type`.              |
| `-t, --type <hex\|bin>`                       | Primary output type. Default: `hex`.                                 |
| `--nobin`                                     | Do not write `.bin`.                                                 |
| `--nohex`                                     | Do not write `.hex`.                                                 |
| `--nod8m`                                     | Do not write `.d8.json`.                                             |
| `--asm80`                                     | Write lowered assembler source as `.z80`.                            |
| `--source-root <dir>`                         | Emit project-relative source paths in `.d8.json`.                    |
| `--case-style <mode>`                         | Lint opcode/register case: `off`, `upper`, `lower`, or `consistent`. |
| `--rc, --register-care <mode>`                | Register-care mode: `off`, `audit`, `warn`, `error`, or `strict`.    |
| `--reg-report, --emit-register-report`        | Write `.regcare.txt`.                                                |
| `--reg-interface, --emit-register-interface`  | Write inferred `.asmi` interface.                                    |
| `--contracts, --annotate-register-contracts`  | Update AZMDoc contract comments in source.                           |
| `--fix`                                       | Apply conservative register-care source fixes and update contracts.  |
| `--accept-out <routine:carrier>`              | Promote an inferred output candidate while annotating.               |
| `--interface <file>`                          | Load external register-care contracts from `.asmi`. Repeatable.      |
| `--reg-profile, --register-profile <profile>` | Register-care profile. Currently `mon3`.                             |
| `--aliases <file>`                            | Load project directive alias JSON. Repeatable.                       |
| `-I, --include <dir>`                         | Add an include search path. Repeatable.                              |
| `-V, --version`                               | Print package version.                                               |
| `-h, --help`                                  | Print CLI help.                                                      |

## Debug80 Maps

The `.d8.json` artifact records AZM as the generator, the package version, and
the input/output paths used for the map. When `--source-root` is supplied, file
keys and generator input paths are written relative to that directory with `/`
separators. Constants are emitted as `value` metadata without fake addresses;
labels and addressable data carry `address`.

## Register-Care Examples

Audit inferred contracts without failing the build:

```sh
azm --rc audit --reg-report program.asm
```

Treat contract conflicts as build failures:

```sh
azm --rc error program.asm
```

Generate compact AZMDoc blocks in source:

```sh
azm --contracts --rc audit program.asm
```

Load external contracts for monitor/library routines:

```sh
azm --rc error --interface mon3.asmi program.asm
```

## `.asmi` Interfaces

External register-care interfaces are plain metadata files:

```text
extern MON_PRINT_CHAR
in A
clobbers A
end
```

Use `.asmi` for these files so they are clearly distinct from assembler source.

## Exit Behavior

The CLI exits with a non-zero status when parsing, semantic checks, register-care
mode, lowering, or artifact writing reports an error. Diagnostics are printed
with file, line, column, severity, and diagnostic ID where that information is
available.
