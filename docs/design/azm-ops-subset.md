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
features should be deprecated as the subset is enforced.

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

export func main()
  clear_a
end
```

The resulting code contains the same `xor a` instruction the programmer could
have written directly. The op adds naming, operand matching, and reuse; it does
not add a hidden runtime mechanism.

## Current Implementation Map

The inherited implementation already follows the shape AZM wants to keep:

| Area | Current file(s) | AZM decision |
|------|-----------------|--------------|
| Op parsing | `src/frontend/parseOp.ts` | keep, but document inherited syntax as provisional |
| Operand matching | `src/lowering/opMatching.ts` | keep as the core advantage over text macros |
| Operand substitution | `src/lowering/opSubstitution.ts` | keep AST substitution only |
| Expansion execution | `src/lowering/opExpansionExecution.ts` | keep inline lowering into ordinary assembly |
| Stack analysis | `src/lowering/opStackAnalysis.ts` | keep as a guardrail, not a hidden preservation model |

## Syntax Position

The alpha keeps inherited ZAX op declaration syntax temporarily:

```asm
op load8(dst: reg8, value: imm8)
  ld dst, value
end
```

That syntax is not yet the final AZM surface. The important alpha decision is
semantic: ops are structured assembly expansions with operand matchers. A later
syntax pass may decide whether the declaration spelling changes for native AZM
source.

## Relationship To Register-Care

An op does not create a call boundary. It has no return address and no callee
contract. Register-care analysis should see the expanded instruction stream, so
an op's register and flag effects are exactly the effects of the instructions it
expands to.

Future work may allow ops to declare documentation metadata, but that metadata
must not override the machine-visible effects of the expanded instructions.

## Relationship To Future Control Stack

Ops are the likely library surface for future structured assembly helpers. The
primitive control-stack operations should stay small and explicit; higher-level
forms such as `if_z`, `then`, `begin`, and `again` can be built as ops only if
their emitted branch and patch behavior remains inspectable.

## Open Questions

- Whether op declarations keep inherited ZAX syntax for the first AZM alpha.
- Whether ops can declare documentation-only register-care effects.
- Whether ops may interact with a future typed control stack.
- Whether AZM-native source should warn on structured control flow inside op
  bodies until the control-stack design is settled.
- Whether generated local labels should eventually use AZM naming rather than
  inherited `__zax_op_*` internals.
