# Register-Care User Guide Brief

Purpose: upgrade AZM Book 0's register contracts chapter so new users and coding
agents understand how to use register contracts as an active development discipline,
not just as a report generator.

## Core Message

Register contracts check whether callable Z80 routines obey the register and stack
contracts their callers rely on. It is deliberately stricter than casual
assembly style. The feature is useful because it forces hidden calling
conventions into visible source comments and catches accidental clobbers before
the program reaches the emulator or hardware.

## `@` Routine Boundaries

Explain that `@Name:` is more than a public label marker. It defines a routine
region for register contracts analysis.

- The source label is written `@DrawSprite:`.
- Calls use `call DrawSprite`; the `@` is not part of the callable symbol.
- The next `@OtherRoutine:` starts a new routine region.
- Plain labels inside the region are still global assembler labels.
- Plain labels are not local labels and must still be globally unique.

The manual should say directly: register contracts proves stack and register
discipline inside these `@` routine regions. Legal assembly that jumps outside a
routine region can still be hard or impossible for register contracts to prove.

## Stack Discipline

Add a practical section on stack balance:

- Keep `PUSH`/`POP` save-restore pairs inside the same `@` routine region.
- Avoid shared epilogues that live after another `@` routine boundary.
- If code has a shared exit, keep that exit inside the same routine region, or
  refactor it into a real callable routine with its own `@` boundary and
  contract.
- Cross-boundary jumps are legal Z80 assembly, but they are not
  register-contracts-clean unless AZM can model the target as a known routine or
  external contract.

Use an example like this as the "bad shape":

```asm
@CopyName:
        push    bc
        jr      z,SharedFail
        pop     bc
        ret

@LoadConfig:
        ; ...
SharedFail:
        pop     bc
        ret
```

Then show the preferred shape:

```asm
@CopyName:
        push    bc
        jr      z,CopyNameFail
        pop     bc
        ret
CopyNameFail:
        pop     bc
        ret

@LoadConfig:
        ; separate routine region
```

The important lesson is not "never share code"; it is "make routine boundaries
match the units whose register and stack effects you want AZM to prove."

## Mode Guidance

Document the intended mode ladder:

- `off`: no register contracts analysis.
- `audit`: generate report/interface/annotations without blocking the build.
- `warn`: emit diagnostics but keep the compile successful.
- `error`: fail on proven register conflicts.
- `strict`: fail on any register contracts issue AZM cannot prove safe, including
  unknown direct-call/tail-call boundaries and unbalanced or unknown stack
  effects.

For Debug80-style workflows where the user edits and then presses Restart,
recommend `strict` for deliberate rebuilds and `audit`/`warn` only for
exploration.

## Contracts and AZMDoc

Teach the compact `;!` form with a concrete before/after:

```asm
;!      in        A,HL
;!      out       carry
;!      clobbers  BC
@CheckTile:
        ; ...
        ret
```

Clarify these terms:

- `in`: caller must provide this carrier.
- `out`: routine intentionally returns this carrier.
- `maybe-out`: candidate output that may be promoted by reviewed fix-up.
- `clobbers`: routine may change this carrier.
- `preserves`: routine guarantees the incoming value survives.

Prefer individual flags such as `carry` and `zero` when the routine returns
status in flags. Prefer register pairs such as `BC`, `DE`, and `HL` when the
routine treats the pair as a unit.

## External Interfaces

Explain `.asmi` files as contracts for routines AZM cannot see:

```text
extern MON_PRINT_CHAR
in A
clobbers A
```

Show `--interface monitor.asmi` and explain that strict mode treats missing
routine bodies or missing external contracts as build failures.

## Suggested Workflow

Recommended development loop:

1. Write or edit the routine.
2. Run `azm --rc audit --reg-report program.asm` to inspect inferred effects.
3. Add or regenerate `;!` contracts.
4. Run `azm --rc strict --reg-report program.asm`.
5. Fix code structure, contracts, or external `.asmi` interfaces until strict
   passes.

The chapter should emphasize that register contracts are allowed to make some
assembly styles feel uncomfortable. That is the point: it encourages localized,
reviewable routine boundaries while still assembling ordinary Z80 code.
