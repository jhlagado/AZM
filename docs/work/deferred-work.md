# Deferred Work

This file records deferred and backburner items that are intentionally not part of the current implementation stream.

## Format

For each item record:
- Status
- Why deferred
- Preconditions
- Source
- Notes

## Deferred Items

### User-authored op contracts
- Status: deferred
- Why deferred: no register-effect analysis mechanism exists for arbitrary op bodies
- Preconditions:
  - per-instruction effect model
  - verifier scope definition
  - failure behavior when verification is impossible
- Source:
  - historical addressing-design discussion from removed ZAX-era notes
- Notes:
  - this is separate from current parser/spec cleanup work

### Typed cast surface `<Type>base.tail`
- Status: landed; monitor follow-up cleanup only
- Why deferred: the feature itself is no longer deferred, but any further
  expansion beyond the accepted v1 shape should wait until post-landing review
  is complete
- Preconditions:
  - post-landing docs/spec cleanup completed
  - any remaining `LANG-02` implementation tickets closed or re-scoped
- Source:
  - GitHub issue `#736 (LANG-02)`
- Notes:
  - landed as additive language work, not as part of an `addr` revival

### Redundant converted fixture cleanup
- Status: low priority
- Why deferred: fixture pruning should not interrupt higher-signal AZM language
  boundary and ZAX-retirement work
- Preconditions:
  - current removed-syntax guardrail remains clean
  - each candidate fixture is mapped to the test that uses it
  - overlapping coverage is identified before deletion
- Source:
  - user request during the AZM good-assembler cleanup
- Notes:
  - remove fixtures that only exercised old ZAX behavior and, after conversion
    to `.asm`, no longer cover a distinct AZM behavior
  - keep fixtures that exercise ASM80 baseline compatibility, register-care,
    directive aliases, ops, layout constants, enums, `.asmi`, or meaningful
    diagnostics
  - prefer deleting redundant fixtures over preserving converted historical
    material for its own sake
