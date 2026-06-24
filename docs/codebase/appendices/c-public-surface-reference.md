---
layout: default
title: 'Appendix C - Public Surface Reference'
parent: 'Appendices'
grand_parent: 'AZM Engineering Manual'
nav_order: 3
---

[<- Appendix B](b-compile-flow-reference.md)

# Appendix C - Public Surface Reference

This appendix lists the public package surfaces that should remain stable across
ordinary implementation changes.

## Package Paths

```text
@jhlagado/azm
@jhlagado/azm/compile
@jhlagado/azm/tooling
@jhlagado/azm/cli
@jhlagado/azm/package.json
```

## Root Exports

`@jhlagado/azm` re-exports the stable compile, tooling, diagnostic,
register contract and output types. It is the broad package entry for consumers that
want one import path.

## Compile Exports

`@jhlagado/azm/compile` exposes:

- `compile`
- `defaultFormatWriters`
- `writeHex`
- compile option and result types
- artifact types
- D8 map types
- output writer types

Use this path for build tools, Debug80 integration and scripts that need bytes
or artifacts.

## Tooling Exports

`@jhlagado/azm/tooling` exposes:

- `loadProgram`
- `loadProgramNext`
- `analyzeProgram`
- `analyzeProgramNext`
- `analyzeRegisterContractsForTools`
- diagnostic types
- case-style mode types
- register contract tooling result types

Use this path for editors, linters and language tooling.

`analyzeRegisterCareForTools` remains as a deprecated compatibility export.

Tooling consumers should treat parsed item spans as provenance-bearing data.
When present, `sourceUnit` names the owning source unit, `sourceRelation`
records whether the physical file edge was `entry`, `include` or `import`, and
`sourceUnitRelation` records whether the owning unit entered the load through
`entry` or `import`.

## CLI Export

`@jhlagado/azm/cli` exposes the compiled CLI module and backs the `azm` binary.
The user-facing command is the package binary:

```sh
azm [options] <entry.asm|entry.z80>
```

## Package Metadata Export

`@jhlagado/azm/package.json` exposes package metadata for tools that need the
installed package version or package fields without importing implementation
modules.

## Public Data Shapes

Treat these as public contracts:

- `Diagnostic`
- `CompileNextFunctionOptions`
- `CompileNextResult`
- `Artifact`
- `D8mJson`
- `D8mArtifact`
- `D8mSegment`
- `D8mSymbol`
- `LoadedProgramNext`
- `AnalyzeProgramNextResult`
- `RegisterContractsCandidateDiagnostic`
- `RegisterContractsCodeAction`

For tooling consumers, this contract also includes the optional
`SourceSpan.sourceUnit`, `SourceSpan.sourceRelation` and
`SourceSpan.sourceUnitRelation` fields carried on parsed items.

When these shapes change, update package tests, TypeScript type tests, README
examples, repo-local reference docs and this manual.
