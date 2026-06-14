---
layout: default
title: 'AZM Engineering Manual'
nav_order: 91
has_children: true
has_toc: false
---

# AZM Engineering Manual

This book is a technical reference for engineers working on the AZM assembler.
It explains the repository structure, the compile pipeline, the public APIs, the
source parser, the assembly model, the Z80 encoder, register contract analysis,
artifact writing and the verification lanes that support the implementation.

This manual is updated against the AZM codebase state through **2026-06-04**.
Use it as the map when planning changes. Use the TypeScript source and tests as
the final authority when a detail has changed.

AZM is deliberately compact. The codebase is organised around one central path:
load source, parse it into source items, expand visible ops, build assembler-time
facts, emit bytes, resolve fixups and write artifacts. Most files either support
one step on that path or expose the path to the CLI, Debug80 or tests.

Recent implementation work split several broad modules into smaller files and
renamed the register contract subsystem around the `register-contracts` term.
Parsing, expression evaluation, Z80 encoding, ASM80 lowering, D8 map writing,
register contract summaries and CLI artifact writing now have dedicated helper
modules. The directory appendix is the current file map for those modules.

---

## Chapters

- [Chapter 1 - Orientation and Repository Layout](01-orientation-and-repository-layout.md)
- [Chapter 2 - Source Loading and Parsing](02-source-loading-and-parsing.md)
- [Chapter 3 - Assembly and Z80 Emission](03-assembly-and-z80-emission.md)
- [Chapter 4 - Ops and Register Contracts](04-ops-and-register-contracts.md)
- [Chapter 5 - Interfaces and Output Artifacts](05-interfaces-and-output-artifacts.md)
- [Chapter 6 - Verification and Maintenance](06-verification-and-maintenance.md)

## Appendices

- [Appendix A - Directory and File Reference](appendices/a-directory-file-reference.md)
- [Appendix B - Compile Flow Reference](appendices/b-compile-flow-reference.md)
- [Appendix C - Public Surface Reference](appendices/c-public-surface-reference.md)

## Related References

- [AZM Grammar Reference](../reference/azm-grammar.md)
