# Platform and Course Strategy

Status: active strategy note
Audience: course author, designer, contributors

## Purpose

This document records the broader platform and content strategy around ZAX,
Debug80, and the planned course material.

It exists so that the project does not drift into a premature platform lock-in
while the language, tools, and teaching arc are still being established.

## Core position

The course system is larger than a single book.

It currently has three layers:

1. the ZAX language and compiler
2. the Debug80 execution and debugging environment
3. the course and media material that teaches software development on the Z80

These layers are related, but they do not have to mature at the same speed.

## Current teaching order

The current order remains correct:

- Book 1 (`learning/part1/`) stays generic and platform-neutral
- Book 2 (`learning/part2/`) stays the advanced practical-programming volume
- platform-specific material comes later, once the generic teaching core is stable

This is a sequencing decision, not a denial of platform importance.

## Why the core course stays generic first

The beginner-facing volume should not yet commit itself to a single machine
family, ROM monitor, or memory map.

Reasons:

- the language surface is still evolving
- the teaching arc is still being refined
- platform-specific examples would force early decisions about ROM calls,
  monitors, addresses, and I/O conventions that are not yet stable
- the same beginner material should remain usable across multiple Z80 systems
  and emulators

So the first course volume teaches generic Z80 programming in ZAX, using a
portable machine model and inspectable output.

## Debug80's role

Debug80 is not an external dependency in the strategic sense. It is part of the
same broader effort and is also your project.

That matters because it means the teaching material, the tools, and the target
platform story can evolve together.

Debug80 should be understood as:

- the runtime and debugging layer for ZAX programs
- the future execution environment for course examples
- the place where machine-specific platform support can mature without forcing
  the core prose to commit too early

This is one reason the generic-first Book 1 decision is defensible. A concrete
platform can be introduced later through Debug80 without rewriting the core
chapters.

## Platform strategy

Platform commitment is provisional.

The current likely flagship applied platform is:

- TEC-1G

Reason:

- it is the most capable and modern descendant of the original TEC-1
- you have direct personal and historical connection to the TEC-1 lineage
- it is a natural focal point for interesting ZAX + Debug80 projects

But this is still provisional, not exclusive.

The wider platform horizon remains open and may include:

- TEC-1
- TEC-1G
- RC2014
- other classic or modern Z80 systems
- Game Boy and related retro targets, if the project emphasis shifts that way

The project should therefore avoid language and course decisions that assume the
final flagship platform is already settled.

## TEC-1 and TEC-1G are distinct tracks

TEC-1 and TEC-1G should not be treated as one generic "TEC" platform.

They are related, but they are not the same environment.

Implication:

- future platform-specific material should treat them as separate tracks or
  appendices
- TEC-1G material may itself need separate treatment for different monitor or
  compatibility modes

This matters because monitor behaviour, memory layout, and workflow assumptions
can differ enough to affect teaching examples.

## Likely content evolution

The long-term direction is broader than one text course.

Near-term:

- text-first teaching material
- generic Book 1
- advanced Book 2

Later:

- platform appendices
- TEC-1G-flavoured applied projects
- Debug80-integrated tutorials
- video or YouTube-style teaching material

So the project should be seen as a teaching ecosystem, not only as a pair of
books.

## Audience reality

The current retro-computing audience often has a nostalgia bias and skews older.
That is real, but it should not define the long-term ambition of the project.

The broader aim is to make Z80 software development legible and attractive to a
newer audience as well, including people who are interested in retro and modern
8-bit-style development without having lived through the original era.

This is another reason not to bind the foundational course too tightly to one
historical machine identity too early.

## Operational consequence

For now:

- keep Book 1 generic
- keep platform notes out of the core early chapters
- let Debug80 platform support mature in parallel
- revisit platform-specific teaching once there is enough audience signal and
  enough tool stability to justify it

When the time comes, the first strong platform-specific teaching line is likely
to be:

- a TEC-1G-flavoured applied course or appendix series built on top of the
  generic Z80-in-ZAX foundation

## Relationship to existing planning docs

This note complements:

- `docs/work/z80-intro-course-plan.md`
- `docs/design/z80-programming-with-zax.md`
- `docs/archive/design/text-include.md`

If those documents define chapter structure or language behaviour, they take
precedence. This note exists to preserve strategic intent across future content,
tooling, and platform decisions.
