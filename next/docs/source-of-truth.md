# AZM Next Source of Truth

Status: mandatory implementation rule

AZM Next is a greenfield implementation, not a greenfield language design. The
architecture should be clean, but the observable behavior must be derived from
authoritative AZM evidence.

## Evidence Hierarchy

Use this order when deciding what AZM Next should do:

1. Current AZM tests, fixtures, and corpus comparison gates.
2. Current AZM observable CLI/API behavior.
3. AZM docs under `docs/spec`, `docs/design`, and `docs/reference`.
4. AZM book examples and course source in the sibling `debug80-docs/azm-book`
   repository when that checkout is available.
5. External ASM80 behavior only where AZM docs, tests, or corpora make it part
   of the AZM compatibility target.

The current AZM source code may explain behavior, but it is not the design to
copy. Use it only to understand an observable behavior that is already supported
by tests, fixtures, docs, or examples.

## Required Workflow

Before implementing a new AZM Next feature:

1. Identify the relevant current AZM tests, fixtures, docs, and book examples.
2. Summarize the behavior those sources prove.
3. Mark any remaining conclusion as an inference, not as fact.
4. Update or add AZM Next tests that encode the proved behavior.
5. Implement only the behavior backed by evidence or explicitly approved.
6. Update `next/docs/parity-matrix.md` when the compatibility status changes.

Do not implement generic assembler behavior merely because it is common in other
assemblers. AZM has project-specific rules, and those rules win over industry
defaults.

## Design Discipline

AZM Next should stay small and accurate:

- Prefer narrow behavior that is proven by AZM evidence.
- Keep compatibility normalization separate from canonical AZM syntax.
- Preserve strict symbol semantics unless evidence says otherwise.
- Avoid carrying ZAX-era behavior unless it is explicitly retained in AZM docs
  and tests.
- Treat unsupported behavior as unsupported until an AZM source of truth brings
  it into scope.

When evidence conflicts, stop and classify the conflict before coding:

- current AZM bug
- documentation bug
- obsolete ZAX behavior
- intentional AZM tightening
- unresolved design decision

Only intentional, documented differences should survive promotion.
