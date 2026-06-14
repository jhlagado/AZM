---
layout: default
title: 'Chapter 4 - Ops and Register Contracts'
parent: 'AZM Engineering Manual'
nav_order: 4
---

[<- Assembly and Z80 Emission](03-assembly-and-z80-emission.md) | [Interfaces and Output Artifacts ->](05-interfaces-and-output-artifacts.md)

# Chapter 4 - Ops and Register Contracts

Ops and register contracts are the two AZM-specific subsystems that sit above plain
Z80 instruction assembly. Ops expand source into visible inline assembly.
Register contract analysis checks the resulting routines and calls.

These features belong together in the codebase tour because they meet at the
same boundary: parsed source items. Ops produce source items. Register contract analysis
reads source items.

## Ops as Visible Expansion

Ops are named inline instruction idioms. They let source define a small
operation once and expand it visibly at each use site. The implementation lives
in `src/expansion/`. `op-expansion.ts` coordinates the subsystem. Operand
splitting, overload selection, selected expansion, instruction instantiation
and local-label rewriting live in focused helper modules.

An op is closer to a typed inline template than to a text macro. The op parser
understands operands, chooses an overload and parses the expanded body back
through the normal AZM parser. The result is visible assembly with the same
diagnostic and register contract behaviour as handwritten source.

For example:

```asm
op clear(reg8 r)
        xor     r
end

        clear a
```

The expansion stage matches `a` as a register operand, substitutes it into the
template and emits the source item for `xor a`. Address planning and emission
then treat that instruction exactly like a line written directly in the source.

## Op Collection and Invocation

`collectOps()` scans logical lines before normal parsing. It finds top-level
`op` blocks, parses their parameter lists, records the body template and marks
the source lines that belong to the definition body.

An op declaration has:

- a name
- a parameter list
- matcher information for overload selection
- a body template
- source location metadata for diagnostics

The registry is complete before invocation parsing starts. `parseOpInvocation()`
checks whether a source line could be an op call. If the name matches a
collected op, `expandOpInvocation()` selects an overload and instantiates the
body.

The parser handles op invocations before `parseLogicalLine()`. An op head can
look like an instruction head at the source level. The expansion stage resolves
it before ordinary line parsing.

Top-level parsing also recognises chained instruction lines separated by a
spaced backslash. Each segment is parsed independently, with labels only
allowed before the first segment and directives still restricted to their own
physical lines. That lets short instruction runs compact onto one source line
without changing directive or declaration shape.

## Overloads and Templates

Ops support overloads. `op-selection.ts` compares invocation operands against
each candidate signature. It prefers the most specific matching overload and
emits diagnostics for arity errors, unsupported operands, ambiguous matches and
invalid expansions.

The matcher vocabulary recognises fixed tokens, registers, register pairs,
immediates, conditions, ports and indexed operands. It stays close to the Z80
operand model, so op dispatch and instruction parsing describe operands in the
same terms.

An op body template is parsed into template items. During expansion, operands
from the call site are substituted into the template by
`op-instruction-instantiation.ts`. The result is formatted as ordinary source
text and parsed through the same line parser used for top-level source.

Op bodies now accept the same chained-instruction form as top-level source.
`collectOps()` splits a spaced-backslash body line into template segments before
it decides whether each segment is a parameterised instruction template, an
ordinary source-item fragment or a nested op invocation. A first label may lead
the chain and becomes an ordinary label item in the expanded body.

Local label rewriting lives in `op-local-labels.ts`. A local label in an op
expansion becomes unique at the use site so each expansion receives its own
generated label. Once the rewritten labels become source items, address planning
defines and resolves them through the ordinary symbol path.

## Op Diagnostics and Register Contracts

Op diagnostics point at the call site while explaining the definition that
matched or failed. Invalid expanded instructions are reported as op expansion
failures with the underlying Z80 parser diagnostic included.

Ops expand before register contract analysis builds routines. AZM sees the
expanded instructions. An op is visible inline assembly, so its register effects
belong to the caller.

## Register Contract Analysis

Register contract analysis checks how routines use Z80 registers. It reads routine
boundaries, instruction effects and AZMDoc contract comments, then reports
conflicts where a caller still needs a register value that a callee may change.

The implementation lives in `src/register-contracts/`. The public analysis entry
point is `analyzeRegisterContracts()` in `src/register-contracts/analyze.ts`.

Register contract analysis is a data-flow analysis over assembled source
structure. It works with routines, calls, instruction effects and contracts. It
analyses the source structure to find values live across a call and callee
summaries that can change those values.

## A Register Contract Conflict

This source shape captures the problem:

```asm
@Caller:
        ld      b,8
Loop:
        call    Worker
        djnz    Loop
        ret

;! clobbers B
@Worker:
        ld      b,0
        ret
```

`Caller` uses `B` as the `djnz` counter. `Worker` declares that it clobbers
`B`. Liveness sees that `B` is still needed after the call because `djnz Loop`
reads it. The register contract conflict is at the call site: `Caller` passes
through a routine boundary that may change a live unit.

The programmer can preserve `B`, choose a different counter register, change
`Worker` so it leaves `B` unchanged or update the calling sequence. Register
contract analysis identifies the conflict and the source location where the
caller crosses the boundary.

## Routine Model and Contracts

`src/register-contracts/programModel.ts` builds the program model from parsed source
items. Routine-specific extraction is split into
`programModel-boundaries.ts` and `programModel-routines.ts`. Together they find
routine boundaries, direct calls, labels and instructions. Routine entry labels
use `@` in source and become callable public routine names after the marker is
removed. When an imported public routine calls private labels inside the same
import unit, the routine builder keeps those direct call targets in the
internal routine set so strict analysis can follow imported helper routines
without exposing them outside the module.

`src/register-contracts/smartComments.ts` reads AZMDoc comments from the comment maps
captured during loading. Comment-block splitting and token parsing live in
`smartCommentBlocks.ts` and `smartCommentParsing.ts`. External `.asmi`
contracts are parsed in `interfaceContracts.ts`.

Contracts can describe:

- inputs
- outputs
- clobbered registers
- preserved registers
- expected outputs at call sites

Source comments and external interfaces describe the same kind of fact: a
routine contract. Source comments attach to routines in the current program.
`.asmi` entries attach to routines whose source is assembled elsewhere.
The compact source form can place several clauses on one `;!` line, for
example `;! in A; out A; clobbers F`.

## Effects, Summaries and Liveness

Register contract analysis depends on `src/z80/effects.ts`. Effects describe which registers
and flags an instruction reads, writes or preserves. `instruction-head.ts`,
`instruction-operands.ts`, `instruction-predicates.ts` and
`operand-register-name.ts` translate between Z80 instruction shapes and
register contract units such as `A`, `HL`, `carry` and register pairs.

`src/register-contracts/summary.ts` infers a summary for a single routine. Boundary,
contract, result, state and token-transfer logic now lives in
`summary-boundary.ts`, `summary-contract.ts`, `summary-result.ts`,
`summary-state.ts` and `summary-token-transfer.ts`. `routine-summaries.ts` and
`summaries.ts` combine routine summaries, external contracts and profile
summaries into lookup tables. A summary records the observable contract of a
routine: the units it reads, writes, preserves, clobbers and returns as outputs.

`src/register-contracts/liveness.ts` performs the caller-side analysis. It works
backwards through each routine. At a call, it compares the live-after set with
the callee summary. A live unit that the callee clobbers becomes a conflict. A
unit produced by the callee and read by the caller becomes an output candidate.

Stack behaviour is part of routine summaries. `summary.ts` tracks push, pop,
exchange-top and unknown stack effects. `routine-summaries.ts` infers summaries
to a fixed point so internal routine calls can see optimistic boundary
summaries before the final pass. Strict mode uses `stackBalanced` and
`hasUnknownStackEffect` to distinguish balanced stack use from a routine whose
boundary may leave the stack in an unknown state.

## Reports, Interfaces and Tooling

`report.ts` renders human-readable `.regcontracts.txt` reports and `.asmi` interface
metadata. It also renders generated source contracts as one compact `;!` line,
joining `in`, `out`, `maybe-out` and `clobbers` clauses with semicolons.
When a routine may clobber the full flag set, the source form uses `F` as the
compact carrier name. `annotate.ts`, `annotations.ts`, `fix.ts` and
`sourceText.ts` support source updates for generated AZMDoc comments and
conservative fixes.

The CLI can request these behaviours through:

- `--reg-report`
- `--reg-interface`
- `--contracts`
- `--fix`
- `--accept-out`

`src/register-contracts/tooling.ts` exposes editor-friendly diagnostics and code
actions through `analyzeRegisterContractsForTools()`. Tooling diagnostics carry
file, line, column, message, fixability and optional text edits. An editor can
show the same register contract information that the CLI reports while using
normal editor actions for accepted fixes.

## Changing Ops or Register Contracts

Op changes belong in `src/expansion/`, with tests under
`test/unit/expansion/` and integration tests for source-level behaviour.
Register contract changes usually begin in one of these files:

- Routine boundaries and calls: `programModel.ts`
- AZMDoc parsing: `smartComments.ts`, `smartCommentBlocks.ts`,
  `smartCommentParsing.ts`, `interfaceContracts.ts`
- Instruction effects: `z80/effects.ts`, `instruction-head.ts`,
  `instruction-operands.ts`, `instruction-predicates.ts`
- Summary inference: `summary.ts`
- Caller liveness: `liveness.ts`
- Output text: `report.ts`
- Source edits: `annotate.ts`, `fix.ts`, `annotations.ts`
- Tooling surface: `tooling.ts`

Run unit tests under `test/unit/register-contracts/`, integration tests under
`test/integration/register-contracts/` and CLI tests in
`test/cli/register_contracts_cli.test.ts`.
