# Course Program Plan

Status: active consolidated planning brief
Audience: course author, writer, reviewer

## Purpose

This document is the small active working document for course planning.

It replaces the older split of:

- part 1 authoring plan
- part 2 authoring plan
- intro course plan
- platform/course strategy note

Those documents are retained under `docs/archive/work/` for historical detail.

## Active course set

ZAX currently has a two-volume teaching direction:

1. **Volume 1** — beginner-facing Z80 programming in ZAX
2. **Volume 2** — algorithms and data structures in ZAX

The language/compiler remains the primary product. Course work should support the
current language surface, not invent a parallel one.

## Active planning rules

- Use `docs/work/course-writing-standard.md` as the editorial gate.
- Use `docs/design/z80-programming-with-zax.md` for the reader model and overall
  teaching direction.
- Use `docs/design/zax-algorithms-course.md` for the algorithms-volume rationale
  and scope.
- Use `docs/spec/zax-spec.md` for normative language behavior.
- Use `docs/reference/ZAX-quick-guide.md` for practical syntax checks.

## Operational priorities

### Volume 1

Keep this as the beginner-first path.

Current intent:

- teach Z80 programming through ZAX from the beginning
- avoid assuming prior assembler experience
- prefer short, direct examples that expose registers, memory, control flow,
  and calling conventions clearly

### Volume 2

Keep this as the second-stage practical volume.

Current intent:

- use classic algorithms and small data-structure examples
- treat the examples as both teaching material and language-pressure tests
- record language friction separately in active design docs, not inside the
  course plan itself

## Archive policy

If a course-planning note becomes tranche-specific, speculative, or stale, move
it to `docs/archive/work/` rather than expanding the active working set again.
