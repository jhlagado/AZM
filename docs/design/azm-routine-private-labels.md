# AZM Routine-Private Labels

Status: future direction
Date: 2026-05-21

## Purpose

AZM already uses `@Name:` as a routine entry marker for register-care analysis.
That gives AZM a natural place to define private labels without adding a
high-level function system.

The future direction is to make `@` labels public entry points and make ordinary
labels between those entries private to the current routine scope.

```asm
@DrawSprite:
Loop:
        djnz    Loop
Done:
        ret

@MovePlayer:
Loop:
        djnz    Loop
Done:
        ret
```

In a routine-private-label mode, the two `Loop` labels and two `Done` labels are
different internal symbols. The exported callable symbols are `DrawSprite` and
`MovePlayer`.

## Desired Semantics

When routine-private labels are enabled:

- `@Name:` defines a public callable entry point named `Name`.
- non-`@` labels after `@Name:` belong to that routine until the next `@Other:`.
- references inside the routine resolve private labels first, then public
  symbols.
- external references can call or jump to `Name`, not to the routine's private
  labels.
- consecutive `@` labels before the first instruction remain public aliases for
  the same routine entry.
- register-care routine boundaries use `@` labels as the source of truth.

This is source-level symbol scoping. It must not introduce functions, arguments,
locals, generated frames, or hidden control flow.

## ASM80-Style Blocks

ASM80-style `.block` / `.endblock` directives are a useful precedent and may be
worth supporting later as explicit symbol scopes:

```asm
.block
@DrawSprite:
Loop:
        djnz    Loop
        ret
.endblock
```

However, `.block` should not be required for normal AZM routines. The existing
`@` convention already marks public entry points, so routine-private labels can
be expressed without extra structural directives.

If `.block` / `.endblock` are added, they should be treated as explicit scope
tools rather than as a high-level module system:

- labels inside a block may be private to the block unless marked with `@`.
- `@` labels remain exported from the block.
- nested blocks should be deferred until there is a real need.
- emitted bytes and listings must stay ordinary assembly output.

## Suggested Modes

The first implementation should be opt-in:

```text
off       current global-label behavior
routine   non-@ labels between @ entries are routine-private
file      non-@ labels are file-private, @ labels are exported
```

The likely first CLI/API shape is a switch such as:

```sh
azm --private-labels routine program.asm
```

Do not make routine-private labels the default until the main corpora have been
tested under the mode.

## Implementation Notes

The parser does not need a large grammar change for the routine mode. The harder
work is symbol resolution:

- build a scope map from source position to current public `@` entry.
- internally qualify private labels, for example as `DrawSprite.Loop` or an
  equivalent hidden symbol.
- resolve local references inside the current scope before global references.
- keep public output symbols stable and unmangled.
- ensure fixups, listings, `.asm80` output, and register-care diagnostics refer
  to understandable names.
- detect duplicate private labels within one routine and duplicate public
  labels globally.

The implementation should avoid changing the meaning of existing imported
ASM80-style code unless the mode is enabled.

## Risks

- Existing source may intentionally jump into another routine's internal label.
  Routine-private mode should reject or require an explicit qualified form for
  that.
- ASM80 compatibility expectations may differ from AZM's routine-private mode.
  Keep corpus compatibility tests separate from strict AZM scoping tests.
- If `.block` is implemented first, it may add syntax noise without solving the
  common routine-label problem.

## Recommendation

Implement routine-private labels before `.block` / `.endblock`.

Keep it opt-in, test it on Tetro/Pacmo/MON3-style source, and only consider a
future default once the behavior has proven useful. `.block` / `.endblock` can
come later as an explicit scope construct for files that need more structure
than routine boundaries provide.
