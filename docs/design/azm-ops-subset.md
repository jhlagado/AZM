# AZM Ops Subset

Status: alpha direction
Date: 2026-05-19

## Purpose

AZM keeps `op` as an AST-level assembly extension mechanism, not as a text macro
system. An op is a reusable instruction idiom that is parsed, matched, and
expanded as structured assembly at **each call site**. It should feel like a
disciplined custom instruction form, not like a preprocessor.

This is a deliberate ZAX innovation that AZM keeps. Ops **do** emit additional
opcodes (for example a multiply implemented as inline adds/shifts). That is not
“hidden compiler lowering”; it is the programmer-chosen, listing-visible expansion
of a named idiom — AZM’s answer to macros.

AZM will use a **simpler** op surface than ZAX: operand shapes and register
classes, not full ZAX type signatures or typed-storage contracts. ZAX-only op
features should be removed from the AZM assembler subset as it is enforced.

Directive **aliases** (`DEFB` → `.db`) are a separate mechanism: head
normalization only, not instruction expansion. See
`docs/design/azm-expression-and-visibility.md`.

This fits AZM's assembly-first direction: programmers name machine idioms without
losing visibility of registers, flags, memory operands, ports, and branches in
the expanded sequence.

## Allowed in alpha

An AZM-safe op may:

- parse operands as structured AST nodes
- match operands by declared shape, such as fixed registers, register classes,
  condition codes, immediates, effective addresses, and memory operands
- select the best matching overload from an op family
- substitute matched operands into ordinary assembly statements
- expand into ordinary Z80 instructions, labels, and local branch structure
- reuse small machine-visible instruction idioms
- participate in normal diagnostics, listings, and source-attributed output
- use explicit `push`/`pop` where the op author wants to preserve scratch state

The programmer must be able to read the expanded instructions and understand
the machine effect. Register and flag effects are the effects of the expanded
instruction sequence.

## Not Allowed In Alpha

An AZM-safe op must not introduce:

- arbitrary text substitution
- token concatenation
- generated public symbol-name tricks
- hidden structured control flow that cannot be inspected as branch-based
  assembly
- implicit register preservation
- hidden stack-frame protocols
- automatic calling conventions
- source rewrites outside the op invocation site
- behavior that depends on reparsing generated text

Ops are inline assembly helpers. They are not functions, text macros, compiler
plugins, or a second language layer.

## Required Smoke Behavior

An AZM-safe op must compile to ordinary assembly that an experienced Z80
programmer could have written manually. A minimal example is:

```asm
op clear_a()
  xor a
end

main:
  clear_a
```

The resulting code contains the same `xor a` instruction the programmer could
have written directly. The op adds naming, operand matching, and reuse; it does
not add a hidden runtime mechanism.

## Current Implementation Map

The implementation follows the shape AZM wants to keep:

| Area                 | Current file(s)                 | AZM decision                                     |
| -------------------- | ------------------------------- | ------------------------------------------------ |
| Op parsing           | `src/expansion/op-expansion.ts` | keep as canonical AZM structured op declarations |
| Operand matching     | `src/expansion/op-expansion.ts` | keep as the core advantage over text macros      |
| Operand substitution | `src/expansion/op-expansion.ts` | keep AST substitution only                       |
| Expansion execution  | `src/expansion/op-expansion.ts` | keep inline lowering into ordinary assembly      |

## Syntax Position

The AZM alpha op declaration surface is:

```asm
op load8(dst reg8, value imm8)
  ld dst, value
end
```

This is an AZM feature, even though the implementation lineage is inherited.
The important alpha decision is semantic: ops are structured assembly expansions
with operand matchers, not text macros or function calls.

## Relationship To Register-Care

An op does not create a call boundary. It has no return address and no callee
contract. Register-care analysis should see the expanded instruction stream, so
an op's register and flag effects are exactly the effects of the instructions it
expands to.

Future work may allow ops to declare documentation metadata, but that metadata
must not override the machine-visible effects of the expanded instructions.

## Verified Guardrail: Register-Care Sees Expanded Ops

Register-care analyzes inline op expansions. An invocation such as `clear_a`
is treated as the emitted `xor a` instruction for register and flag effects.
Ops do not create call boundaries or callee contracts.

## Verified Guardrails

| Check                                                              | Test / script                                       | Status   |
| ------------------------------------------------------------------ | --------------------------------------------------- | -------- |
| Op call sites expand to ordinary Z80 bytes in the object file      | `test/registerCare/opExpansion.integration.test.ts` | verified |
| Op invocation is not modeled as a `CALL` boundary in register-care | same                                                | verified |
| Register-care liveness/summary sees expanded instructions          | same (`clear_a` is analyzed as `xor a`)             | verified |

## Open Questions

- Whether ops can declare documentation-only register-care effects.
- Whether ops should expose any explicit branch/fixup helper effect.
- Whether generated local labels need a more specific AZM naming policy than
  the current `__azm_op_*` internals.
