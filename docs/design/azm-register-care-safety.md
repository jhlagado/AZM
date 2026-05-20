# AZM register-care safety

Status: design research capture
Date: 2026-05-15

## Purpose

This note captures a fresh design pass based on the TETRO source tree, treating
TETRO as the practical baseline rather than treating the current AZM language
direction as settled.

The question is narrow:

> What minimal assembler features would make ASM80-style Z80 programming safer
> and more pleasant, especially around register clobbering, without hiding the
> machine?

The answer should start from the caller's perspective. A callee can destroy
registers, but the bug only matters when the caller still needs one of those
pre-call values. The useful compile-time check is therefore a conflict between
two inferred facts:

- what the called routine may modify before it returns
- what pre-call register or flag values remain live after this call site

The design direction should use automatic inference to verify and generate
contracts, while still treating explicit callee contracts as valuable
documentation. The Z80 is small, finite, and well documented. If AZM has an
effect table for every opcode, including flag effects, it can infer both routine
effects and caller-side liveness from ordinary ASM80-style source.

## Implementation status

The first implementation target is `--rc audit` plus
`--reg-report`. This mode emits routine summaries and high-confidence
direct-call conflicts without changing generated machine code. Warning and error
modes use the same analysis results after the audit report has been validated
against real ASM80 corpora.

## What TETRO already shows

TETRO is well-organized ASM80-style assembly. Its comments already form a
lightweight interface language. Routine headers commonly document:

- inputs in registers, flags, or RAM
- outputs in registers, flags, or RAM
- clobbered registers
- preserved registers where that preservation matters
- carry and zero flag return meanings
- range assumptions such as `A = 0..7`
- table bounds assumptions such as "no bounds check"
- tail-call paths that widen the effective clobber set

Examples from the TETRO and shared modules show the pattern clearly:

- `CHECK_COLLISION_AT_DE` takes `D` and `E`, returns carry as a collision result,
  and declares only `A` clobbered even though it uses `BC`, `DE`, and `HL`
  internally by saving and restoring them.
- `APPLY_GRAVITY` has a small clobber set on the normal commit path, but a wider
  clobber set when it tail-calls the lock path.
- `FB_OR_ROW_COLOR_MASK` clobbers `A` and `HL` while explicitly preserving `BC`.
- `POLL_INPUT_AND_UPDATE` depends on the MON-3 scan-key flag contract and can
  cascade through paths with wider clobbers.
- `LCD_PUTC_FROM_TABLE` states that it performs no bounds check.

That discipline is exactly what a modern assembler should learn to verify.
TETRO's comments are useful as a validation corpus for the analyzer, but the
stronger goal is to infer the same facts from the code itself without requiring
comments or annotations.

## The caller-side problem

A callee clobber list by itself is not enough.

If a routine clobbers `DE`, that is harmless when the caller has no meaningful
value in `DE` after the call. It is a bug when the caller still needs `DE`.
Compile-time safety therefore needs to know what the caller cares about at a
particular point in the instruction stream.

That caller-care set is local and movable:

```asm
        ld      de,BOARD_ROWS
        ld      b,ROW_COUNT

loop:
        ld      a,(de)
        call    CHECK_SOMETHING
        inc     de
        djnz    loop
```

In this sketch, the caller cares about `DE` and `B` across the call because they
carry loop state. If `CHECK_SOMETHING` clobbers either register, the call is
suspicious unless the caller saves and restores the affected register or
rewrites the code so the value is no longer live across the call.

The same caller may not care about `DE` later:

```asm
        ld      de,BOARD_ROWS
        ; use DE fully here

        call    SOUND_TRIGGER_LOCK      ; DE no longer live, so a DE clobber is fine
```

The contract belongs to the call site, not only to the whole caller routine. In
the automatic model, this contract is not written down by the programmer. It is
the liveness set at that instruction.

## Automatic inference as the primary model

The preferred design is an assembler-side analysis pass over ordinary source:

1. parse the source into instructions, labels, directives, and data regions
2. attach a register and flag effect summary to every Z80 instruction
3. build a control-flow graph for each routine
4. infer each routine's externally visible effects
5. run caller-side liveness at each call site
6. report conflicts where a live pre-call value is killed by the called routine

This gives the safety benefit without changing source syntax:

```asm
        ld      de,BOARD_ROWS
        ld      b,ROW_COUNT

loop:
        ld      a,(de)
        call    CHECK_SOMETHING
        inc     de
        djnz    loop
```

If `CHECK_SOMETHING` may modify `D`, `E`, or `B`, the analyzer can report that
the call destroys loop state before later instructions use it.

The important distinction is between a register value produced by a call and a
register value that must survive across the call. If the caller reads `HL` after
a call and the value before the call was not live, then `HL` can be treated as a
call-produced value. If the caller has a pre-call `HL` value that reaches a
post-call use, and the callee may modify `H` or `L`, that is the preservation
conflict.

This is a data-flow problem, not a convention problem.

## Feasibility

This is hard, but it is feasible because the target is a small, closed machine.
The Z80 instruction set is finite. Each opcode form has knowable effects on the
main registers, alternate registers, index registers, stack pointer, memory, and
flags. Once those effects are encoded, the remaining problem is conventional
data-flow analysis.

The useful checker does not need to prove every possible program perfectly on day
one. It can start with the common subset that appears in TETRO:

- direct `CALL` targets
- direct `RET` exits
- local labels and conditional relative branches
- balanced `PUSH`/`POP` save/restore
- direct register and flag reads/writes
- worst-case summaries for routines with multiple exits

That is enough to catch the common bug class: a loop cursor, counter, temporary,
or flag is live across a call that may destroy it.

The implementation risk is not the CPU model. The implementation risk is noisy
diagnostics when intent is ambiguous. That should be managed by conservative
wording and phased rollout: start with high-confidence diagnostics, then widen
coverage as the analyzer proves itself on real corpora.

## Routine boundaries and local labels

Register-care inference depends on knowing where a routine starts and ends. The
more robust AZM policy is to mark routine entries, not every internal label. In
ASM80-compatible source, `@Name:` marks `Name` as an AZM routine entry:

```asm
@CHECK_COLLISION_AT_DE:
        push    bc
CheckCollRow:
        djnz    CheckCollRow
CollExit:
        pop     bc
        ret
```

The callable symbol is still `CHECK_COLLISION_AT_DE`; callers do not write the
`@`. AZM uses the prefix to define the analysis span. Plain labels inside the
span are internal waypoints for register-care purposes, even though they remain
ordinary ASM80-compatible symbols until AZM adopts a stricter privacy mode.

When any `@` entry labels are present in a file or translation unit, AZM should
prefer this explicit routine model:

- an `@Name:` label starts a callable/addressable entry point
- consecutive `@` labels before that entry body's first instruction are aliases
  for the same entry point
- plain labels inside the entry body do not end the routine
- the next `@OtherName:` starts the next routine boundary
- direct `CALL Name` and direct `JP Name` to an `@` entry use that entry's
  inferred contract

For older source without `@` entries, AZM may retain the plain-label fallback
heuristic: a non-local executable label after one or more instructions starts a
new routine boundary, while leading-dot labels are private local labels inside
the current routine.

This distinction is not cosmetic. A routine that saves registers with `PUSH`,
uses them as scratch, and restores them with `POP` can only be summarized
correctly if the analyzer sees the complete body. If an internal branch target
is written as a non-local label, the analyzer must assume the original routine
ended there. The saved registers then appear to be pushed but never popped, and
scratch values loaded before the split can be misclassified as `out` values.

The source policy should be:

- use `@` labels for true callable routines, public jump targets, tail-call
  targets, and intentional aliases
- use plain or leading-dot local labels for loops, joins, exits, error paths,
  and fall-through targets
- keep non-local data labels outside routine-contract generation; inline data
  labels need an explicit source convention before register-care can analyze
  around them safely
- if a mid-body entry is genuinely public, factor it into a real routine whose
  entry stack state and contract are valid from that label
- do not repair routine-boundary mistakes by adding `preserves` or hand-written
  `out` annotations; fix the label structure first, then regenerate contracts

AZM should eventually add a lint diagnostic for suspicious non-local labels that
appear inside an unfinished routine, especially when the preceding body has
unbalanced `PUSH`/`POP` state or the label has no routine doc block and is only
targeted by intra-file branches.

## Opcode effect table

Automatic inference depends on a complete Z80 effect table. Every opcode form
needs a summary that describes:

- registers read
- registers written
- flags read
- flags written, preserved, reset, set, or undefined
- stack effect
- memory read/write shape where it matters for stack tracking
- control-flow behavior

Examples:

```text
LD HL,nn       writes H,L; preserves flags
LD H,n        writes H; preserves flags
ADD HL,DE     reads H,L,D,E; writes H,L; writes H,N,C; preserves S,Z,P/V
INC B         reads B; writes B; writes S,Z,H,P/V,N; preserves C
CP n          reads A; writes S,Z,H,P/V,N,C
SCF           writes C,H,N; preserves S,Z,P/V
PUSH DE       reads D,E; SP -= 2; writes memory[SP..SP+1]
POP DE        reads memory[SP..SP+1]; writes D,E; SP += 2
CALL nn       pushes return address; transfers to routine summary
RET           returns to caller; requires stack depth to match routine entry
```

The table should decompose register pairs into 8-bit registers. `LD HL,0` writes
`H` and `L`. `AF` is `A` plus the individual flags. `F` is not modeled as a
normal register-care unit.

The table can start conservative. If an instruction has awkward or undocumented
flag behavior, mark the uncertain flags as written unknown. A conservative false
warning is acceptable early; silently missing a real clobber is worse.

## Routine effect inference

The analyzer should infer routine summaries from bodies rather than require
explicit clobber signatures.

At routine entry, every register and flag starts with an identity token:

```text
A0, B0, C0, D0, E0, H0, L0, F0
```

Instructions transform those tokens. At every `ret`, the analyzer compares the
current token for each register and flag to the entry token.

- If a register still holds its entry token on every return path, it is
  preserved.
- If it may hold a different token on any return path, it is modified.
- If a flag is returned with a defined meaning, that fact can be inferred only in
  limited cases; otherwise it is simply a written flag.

Push/pop handling matters. A routine like TETRO's collision checker may use
`HL`, `DE`, and `BC` internally but restore them before returning. The analyzer
should recognize:

```asm
        push    hl
        ; use HL
        pop     hl
        ret
```

as preserving `H` and `L`, provided the stack model proves the matching pop on
all return paths.

Routine summaries should be worst-case by default. If one path modifies `DE` and
another path preserves it, the routine summary says `DE` may be modified. This
encourages decomposition of routines with divergent behavior.

## Caller-side liveness

At each call site, the analyzer asks:

```text
Which pre-call register and flag values can be read later before being
overwritten?
```

Those values are the inferred caller-care set.

The conflict check is:

```text
live pre-call values after call  INTERSECT  callee may-modify set
```

If the intersection is non-empty, the assembler reports a diagnostic. For
example:

```text
DE is live across CALL CHECK_SOMETHING, but CHECK_SOMETHING may modify D,E.
Save DE, move the call, or rewrite the loop so DE is not live across the call.
```

This avoids needing `.keep`, `.care`, or AZMDoc hints for the common case.
The source code itself determines whether the caller cares.

The diagnostic should be phrased in terms of values, not just registers:

```text
The DE value loaded before the loop is used by INC DE after this call, but the
call may modify D,E.
```

That wording makes clear that the problem is loss of the pre-call value, not the
mere fact that the callee writes a register.

## Call outputs versus killed values

The automatic model must avoid warning on normal return-value use:

```asm
        call    MAKE_POINTER
        ld      a,(hl)
```

If the pre-call `HL` value is not live, then this is not a preservation conflict.
The read of `HL` after the call uses the call-produced `HL` value.

The analyzer should warn when a pre-call value is live across the call:

```asm
        ld      hl,BUFFER
        ld      a,(hl)
        call    DO_WORK
        inc     hl
```

If `DO_WORK` may modify `H` or `L`, the pre-call `HL` cursor cannot safely reach
`inc hl`.

This distinction is essential. Without it, every call that returns a register
value would look like a clobber conflict.

## Caller hints are an escape hatch

The preferred steady state should not require caller-care annotations. The
assembler should infer the caller-care set from ordinary instruction use.

This means no required call-site syntax such as:

```asm
        .keep   de,b
        call    CHECK_SOMETHING
```

and no required region syntax such as:

```asm
.care de,b
        ...
.uncare de,b
```

Those forms may still be useful later as debugging aids or warning suppressions,
but they should not be the design center. If the analyzer can see that `DE` is
read after the call and not overwritten first, then the analyzer already knows
the caller cares about the pre-call `DE` value.

There is still an important ambiguous case. A caller may pass a value in a
register and intentionally expect the callee to normalize or transform that same
register:

```asm
        ld      de,RAW_COORD
        call    NORMALISE_COORD_IN_DE
        ld      a,(de)
```

From instruction flow alone, post-call `DE` use is ambiguous. It could mean:

- the caller expected the old `DE` value to survive
- the caller expected the callee to return a transformed `DE` value

The better permanent fix is a callee contract declaring `DE` as both input and
output. For legacy code or one-off exceptions, the caller should be able to add a
narrow AZMDoc hint near the call site:

```asm
        ; @expect-out DE normalized_coord
        call    NORMALISE_COORD_IN_DE
        ld      a,(de)
```

The hint means: this caller expects post-call `DE` to be callee-produced, so the
pre-call `DE` value is intentionally consumed. It suppresses the specific
register-care diagnostic at that call site. It should not globally change the
callee summary, and it should not suppress unrelated conflicts.

Caller hints are therefore a controlled suppression system, not the primary
contract language. If many call sites need the same hint, the callee is missing
an explicit or generated contract.

## AZMDoc contracts

Callee contracts are documentation first and machine-checkable metadata second.
They should be explicit for stable APIs, external routines, ROM monitor calls,
or source that the analyzer cannot inspect. Ordinary project-local routines can
also get inferred summaries from their opcode stream, and AZM should be able to
generate AZMDoc contracts from those summaries.

For ASM80-compatible source, hand-written contracts can be represented as AZMDoc
comments: ordinary semicolon comments with known `@` metadata tags inside the
prose. Old assemblers ignore them, while AZM treats them as structured metadata.
The normative draft is `docs/spec/azmdoc.md`.

```asm
; CHECK_COLLISION_AT_DE
; Tests candidate active-piece placement against walls, floor, and board rows.
; Candidate x is supplied in @in D candidate_x.
; Candidate y is supplied in @in E candidate_y.
; The result is returned in @out carry collision.
; Scratch use is limited to @clobbers A.
CHECK_COLLISION_AT_DE:
```

For routines that intentionally transform an input register into an output
register, the same carrier should appear as both `@in` and `@out`:

```asm
; NORMALISE_COORD_IN_DE
; Reads @in DE raw_coord.
; Returns @out DE normalized_coord.
; Uses @clobbers A.
NORMALISE_COORD_IN_DE:
```

The assembler can then build or override a symbol table of routine effects:

- registers read as inputs
- registers or flags returned as meaningful outputs
- registers consumed and returned as transformed values, represented by matching
  `@in` and `@out` carriers
- registers clobbered as scratch
- registers explicitly preserved, only when the API needs to say so
- flags returned as semantic outputs
- RAM or port side effects, where declared

The callee contract should describe externally visible effects, not every
temporary used internally. If a routine pushes `HL`, uses it, and pops it before
returning, `HL` is preserved from the caller's perspective. Likewise, `@in`
means semantic input from the caller, not every physical read the implementation
performs while saving, restoring, or shuffling scratch state.

AZMDoc contracts are also the compatibility carrier for boundary
metadata:

- MON-3 `RST` services
- ROM routines
- imported binary blobs
- indirect call targets
- deliberately hand-waived hardware routines

External contracts can also be generated rather than handwritten. If MON-3
source is available, AZM can run the same inference engine over that source and
emit reusable AZMDoc contract metadata for programs that call into MON-3 without
assembling it as part of the same project. Handwritten annotations remain useful
for gaps, but generated contracts should be preferred whenever source exists.

AZM should also be able to add inferred callee contracts back into source as
AZM-owned contract blocks, either in-place when explicitly requested or as a
patch/report:

```asm
; CHECK_COLLISION_AT_DE
; Human prose remains outside the generated block.
;!      in        DE
;!      out       carry
;!      clobbers  A
CHECK_COLLISION_AT_DE:
        ...
```

Generated contracts make the analysis tangible. They turn inference into a
maintainable interface layer for existing ASM80-style code. The programmer can
then edit the generated contract when inference cannot distinguish a scratch
clobber from an intentional input-to-output transformation.

When regeneration runs again, AZM replaces the existing `AZM` block rather than
appending another one. Prose outside the block is user-owned and must be left
unchanged. During migration, older interspersed `@in`, `@out`, and `@clobbers`
lines can either be retained as prose for compatibility or converted into plain
human comments once the generated block carries the machine-readable contract.
For in-place source annotation, AZM should append new generated blocks only to
labels that already have a contiguous routine comment block, while still
replacing any existing generated block. This prevents internal branch labels
from accumulating machine-generated comments simply because they are visible to
the analyzer. Empty generated blocks should be omitted, or removed if they were
created by an older pass.

## Register effect model

The checker should model registers at the smallest practical unit.

For the main Z80 register set, register pairs are not independent objects for
clobber analysis. They are composed from 8-bit registers:

```text
BC = B + C
DE = D + E
HL = H + L
AF = A + carry + zero + sign + parity + halfCarry
```

Therefore:

- `LD HL,0` writes `H` and `L`
- `LD H,0` writes `H`, which means `HL` is no longer preserved as a pair
- `EX DE,HL` writes `D`, `E`, `H`, and `L`
- `PUSH HL` reads `H` and `L`
- `POP HL` writes `H` and `L`

External contracts may still spell `HL` for human readability, but the checker should
normalize it to `H,L`. A caller that cares about `HL` is really saying it cares
about both `H` and `L`.

`AF` follows the same rule only as a source-level compatibility shorthand.
Internally, `F` does not exist as a true register-care unit. Source-facing
contracts should name individual flags such as `carry` or `zero` only when those
flags are semantic outputs; tools may accept bare `F` as compatibility shorthand
for all flags, but generated metadata should avoid both `F` and `AF`.

This avoids treating register pairs as a separate type that can drift out of sync
with their constituent registers.

## Automatic call-site conflict checking

At each call, the assembler compares inferred facts:

```text
live pre-call values after call  INTERSECT  callee may-modify set
```

If the intersection is empty, the call is safe with respect to register
preservation.

If the intersection is non-empty, the assembler reports a conflict:

```text
CALL CHECK_SOMETHING may modify D,E, but the pre-call DE value is used later.
```

If the conflict reflects real intent, the programmer can make that intent
explicit. A stable routine API should use a callee AZMDoc contract:

```asm
; CHECK_SOMETHING
; Reads @in DE.
; Returns @out DE.
; Uses @clobbers A.
CHECK_SOMETHING:
```

A local exception can use a call-site AZMDoc hint:

```asm
        ; @expect-out DE normalized_coord
        call    CHECK_SOMETHING
```

The compiler can then either fail, warn, or apply an autofix depending on mode.
Autofix should be conservative:

- if a call clearly needs preservation, suggest or insert `push`/`pop`
- if a call is ambiguous and looks like an intentional input-to-output
  transformation, suggest a caller hint or callee contract rather than inserting
  code
- if an inferred routine summary is stable, offer to add or update the callee
  AZMDoc contract

Autofix must never silently change machine behavior. Adding AZMDoc comments is
safe because ASM80 ignores them. Inserting `push`/`pop` is behavior-changing and
should require an explicit autofix mode or reviewed patch.

The programmer has several valid repairs:

```asm
        push    de
        call    CHECK_SOMETHING
        pop     de
```

or:

```asm
        ; Move the call after the last use of DE.
        inc     de
        call    CHECK_SOMETHING
```

or:

```asm
        ; Rewrite so the value is recomputed after the call.
        call    CHECK_SOMETHING
        ld      de,BOARD_ROWS
```

This is the assembly equivalent of type checking: the assembler rejects a call
where a value's inferred lifetime crosses an instruction that may destroy it.

## Flags need the same treatment

Flags are part of the inferred state. TETRO already uses carry as a return value
from collision routines. A modern assembler should track flags just like
registers.

Caller-side examples:

```asm
        call    CHECK_COLLISION_AT_DE
        jr      c,blocked
```

Here carry is consumed immediately, so the flow is safe. But this should warn:

```asm
        call    CHECK_COLLISION_AT_DE
        call    SOUND_TRIGGER_LOCK
        jr      c,blocked
```

The second call may modify carry before it is consumed. This is a classic
assembly-language bug and a strong candidate for automatic compile-time
diagnostics.

## Stack value preservation

The full register-care system needs to model the stack, not just registers. In
real Z80 code, saving a register before a call and restoring it afterward is the
normal repair for a clobber conflict:

```asm
        push    de
        call    CHECK_SOMETHING
        pop     de
        inc     de
```

This should not warn merely because `CHECK_SOMETHING` may modify `D` and `E`.
The caller has made the value survive by moving it through the stack.

The right model is symbolic value identity. At any point, registers contain
tokens such as `D_before_call` and `E_before_call`. A stack model tracks where
those tokens are stored:

```text
before PUSH DE:
    D = D1
    E = E1

after PUSH DE:
    stack[SP+0] = E1
    stack[SP+1] = D1

after POP DE:
    D = D1
    E = E1
```

The exact byte order is an implementation detail, but the analyzer must be byte
accurate internally. Register pairs remain decomposed into their 8-bit
constituents. `PUSH DE` stores the current `D` and `E` tokens. `POP DE` writes
whatever tokens are at the top of the abstract stack back into `D` and `E`.

That means a register write is not automatically a destructive clobber. It is a
destructive clobber only if the value later needed by the caller can no longer be
proven to reach that later use.

### Abstract stack model

The analyzer does not need absolute addresses to model ordinary stack behavior.
It can track stack depth relative to a routine entry or a call site:

- `PUSH rr` decrements abstract `SP` by two bytes and writes the source tokens to
  the new top stack slots.
- `POP rr` reads the top stack slots, writes those tokens to the destination
  registers, and increments abstract `SP` by two bytes.
- `EX (SP),HL` exchanges the `H,L` tokens with the two tokens at the current
  stack top.
- `CALL target` pushes a return address and transfers control to the callee
  summary; from the caller's continuation, `SP` must be the same as it was before
  the call.
- `RET` pops a return address; for routine summary inference, the routine must
  reach `RET` with the same abstract stack depth it had on entry.

This is enough to prove common local preservation idioms:

```asm
        push    hl
        push    de
        call    ROUTINE_THAT_CLOBBERS_HL_DE
        pop     de
        pop     hl
        ret
```

The same model also handles intentional renaming through the stack:

```asm
        push    de
        call    ROUTINE_THAT_CLOBBERS_DE
        pop     hl
        ld      a,(hl)
```

Here the old `DE` value has not been preserved in `DE`. It has been preserved as
a value and renamed into `HL`. If the later code reads `HL`, there is no problem.
If the later code reads `DE`, the analyzer should warn because `DE` no longer
carries the original token.

This distinction matters:

```asm
        push    de
        call    ROUTINE_THAT_CLOBBERS_DE
        pop     hl
        inc     hl          ; safe: old DE value is now in HL
        inc     de          ; suspicious: old DE carrier was not restored
```

So the checker should distinguish two related concepts:

- **register preservation:** the same carrier returns with the same value, such
  as `DE_out = DE_in`
- **value preservation:** the value still exists, but it may have moved to a new
  carrier, such as `HL_out = DE_in`

Caller-side diagnostics should be based on the value required by a later use and
the carrier that later instruction actually reads. A later `ld a,(hl)` cares
that the pointer value reaches `HL`. It does not care that the value originally
entered the sequence in `DE`.

If the pop order is accidentally wrong, the token model exposes that too:

```asm
        push    hl
        push    de
        call    ROUTINE_THAT_CLOBBERS_HL_DE
        pop     hl          ; DE tokens are now in HL
        pop     de          ; HL tokens are now in DE
```

This is not inherently illegal, because it might be an intentional swap. It is a
bug only if later code expects `HL` to still contain the old `HL` value or `DE`
to still contain the old `DE` value. Again, the decisive fact is not which
register was written, but whether the value token needed by a later instruction
can be proven to reach the carrier that instruction reads.

Routine summaries can eventually expose the same information at procedure
boundaries. A routine that returns with `HL` containing its entry `DE` value is
not merely "clobbers HL, preserves DE" or "clobbers DE, returns HL"; it has a
value relation:

```text
HL_out = DE_in
```

The first checker can still collapse this to may-modify and preserved sets for
simpler diagnostics. The deeper model should retain value relations internally,
because that is what makes renaming, swapping, stack saves, and register-pair
movement precise.

### Caller saves across calls

For `push de / call foo / pop de` to be accepted as preservation, the analyzer
also needs a stack-discipline summary for `foo`. It must know, or conservatively
assume from inferred evidence, that `foo`:

- returns with `SP` restored to its entry value
- does not write into caller-owned stack slots below the return address
- does not discard the return address except through normal `RET` behavior
- does not replace `SP` with an unrelated value

This is inferable for ordinary routines. A callee may use `PUSH` and `POP`
internally and still be stack-disciplined if every return path restores its entry
stack depth. A callee becomes suspicious if it performs arbitrary `LD SP,rr`,
unmatched `POP`, writes through computed stack-relative addresses, or indexes
into positive offsets from its entry `SP` in ways the analyzer cannot classify.

The caller's saved value sits below the return address after the `CALL`. At
callee entry, the return address is at `SP+0`, and the caller's saved bytes are
deeper in the stack. A well-behaved callee should not modify those deeper slots
unless the program is deliberately using stack arguments or caller-allocated
frame storage. That means stack arguments and caller saves eventually need a
shared ownership model, but the common save/restore idiom can be handled before a
full frame system exists.

### Stack arguments and caller-owned slots

Stack arguments complicate the model because they intentionally live in the
caller's stack area:

```asm
        push    de          ; argument
        call    DRAW_AT
        pop     de          ; caller cleanup, not necessarily preservation
```

This has the same instruction shape as a register save but a different meaning.
The analyzer should not guess too aggressively. A practical first rule is:

- if the popped value is used later as the same pre-call value, treat the sequence
  as a preservation candidate
- if the pushed value is consumed only by the callee and not used after cleanup,
  treat it as an argument or temporary stack slot
- if the callee writes to caller stack offsets, require a known contract or emit a
  conservative warning

This keeps the first implementation useful without pretending to understand every
possible stack protocol.

## Memory-backed preservation

The same symbolic token idea can model preservation through RAM, but memory
introduces aliasing. A simple absolute save can be proven:

```asm
        ld      (saved_de),de
        call    CHECK_SOMETHING
        ld      de,(saved_de)
        inc     de

saved_de:
        ds      2
```

This is safe only if the analyzer can prove that no intervening instruction or
call may write to `saved_de`. For known absolute symbols, the model is feasible:

- `LD (symbol),A` writes the current `A` token to memory cell `symbol`
- `LD A,(symbol)` reads the token from memory cell `symbol`
- `LD (symbol),DE` writes the current `D,E` tokens to `symbol` and `symbol+1`
- `LD DE,(symbol)` reads those tokens back into `D,E`

The analyzer can keep exact facts for known static cells until something may
alias them. Unknown writes must invalidate memory facts conservatively:

- `LD (HL),A` may write an unknown address unless `HL` has a known symbolic
  address
- block operations such as `LDIR` may write a range
- external calls may write unknown RAM unless their contract says otherwise
- interrupt handlers and hardware DMA are outside the first model

This makes stack preservation the better first target. The stack is structured,
LIFO, and local. General RAM preservation is feasible, but useful precision
depends on alias analysis and external memory-effect summaries.

## Phased feasibility

A full register-care system is best built in layers:

1. **Register and flag tokens.** Track identity through normal register
   operations, pair operations, exchanges, and flag-producing instructions.
2. **Routine summaries.** Infer may-modify and preserved sets by comparing
   return-state tokens against entry tokens.
3. **Stack depth.** Require every routine return path to restore entry stack
   depth.
4. **Stack value tokens.** Track `PUSH`, `POP`, and `EX (SP),HL` so save/restore
   idioms prove preservation rather than suppress diagnostics by convention.
5. **Caller save recognition.** At call sites, accept stack preservation only
   when the callee is stack-disciplined.
6. **Known static memory cells.** Track simple `LD (symbol),r` and
   `LD r,(symbol)` preservation through RAM when aliasing is absent.
7. **Stack slot ownership.** Add a model for explicit positive `SP`, `IX`, or
   `IY` offsets so caller saves and documented scratch slots can be
   distinguished cleanly.
8. **Broader memory effects.** Add range analysis, port/RAM side-effect
   contracts, interrupt assumptions, and hardware-specific profiles.

The first five layers are enough to make inferred clobber summaries materially
better than handwritten comment headers, because they recognize the difference
between "this routine uses `HL` internally" and "this routine fails to return
the caller's `HL` value." That catches many real mistakes without requiring a
high-level frame model.

## Conditional effects and decomposition pressure

Some routines have different clobber behavior on different paths. TETRO has
examples where a normal path has a small clobber set, while a lock or game-over
tail path cascades into a wider set.

The first inference model should treat this as a worst-case union:

```text
effective may-modify set = modifications from every possible exit path
```

This is conservative and easy to reason about. It may reject some calls that are
safe on a particular path, but that pressure is useful. Divergent clobber
behavior is often a sign that the routine wants to be decomposed into smaller
routines with tighter contracts.

Path-sensitive effects can be deferred. They are useful later, but they should
not be required for the first safety model.

## Jumps to known routines and tail calls

In this note, a "tail call" does not mean an optimization performed by the
assembler. It means a source-level idiom:

```asm
        jp      OTHER_ROUTINE
```

used where the current routine is finished and wants `OTHER_ROUTINE` to return
directly to the current routine's caller. In machine terms, this avoids pushing a
new return address. `OTHER_ROUTINE` eventually executes `ret`, and that `ret`
uses the return address that was already on the stack.

This is different from an internal branch:

```asm
        jp      local_label
```

The checker should not blindly treat every `JP label` as a tail call. A minimal
rule is:

- `JP` to a local label inside the same routine is ordinary control flow
- `JP` to a declared routine at a routine exit can be treated as a tail call
- an explicit directive can remove ambiguity when needed

For example:

```asm
        .tail
        jp      LCD_SHOW_SCRIPT
```

For analysis, a tail call means the current routine's inferred summary includes
the tail target's worst-case effects. There is no caller continuation after the
`JP`, so caller-side liveness applies at the routine boundary rather than to
instructions after the jump.

## Caller-care lifetime

The hard part is not opcode effects. The hard part is caller liveness.

A pragmatic assembler can support three levels:

1. **Instruction-local effects.** Every opcode form has explicit register and
   flag read/write behavior.
2. **Routine summaries.** The assembler infers may-modify and preserved sets for
   labels targeted by `CALL`.
3. **Local caller liveness.** The assembler finds obvious pre-call values read
   after a call in straight-line code and simple loops.
4. **Path-aware liveness.** The assembler handles branches, conditional returns,
   tail calls, and flag lifetimes across a full control-flow graph.

The design should invest in levels 1 through 3 first. Level 4 is desirable and
probably achievable, but useful diagnostics should appear before the full proof
engine is perfect.

## Analysis boundaries

The automatic model still needs honest boundaries.

Some code cannot be inferred from local source:

- ROM monitor calls such as MON-3 `RST 0x10`
- indirect jumps or calls through registers
- self-modifying code
- code included only as binary data
- deliberate hardware entry points outside the assembled program

Those need built-in platform contracts or conservative defaults. This does not
make the source annotated. It means the assembler ships with effect summaries for
known external APIs, just as it ships with opcode summaries for the CPU. The
`mon3` profile, for example, can refine `RST 0x10` when the immediately
preceding instruction loads `C` with a known service selector such as
`API_SCANKEYS`.

When no contract is known, the safe default is broad:

```text
unknown call target may modify all registers and flags
```

That may be noisy, but it is honest. Projects can add or extend platform
profiles without changing ordinary source.

## Minimal syntax sketch

The preferred automatic path needs no syntax in ordinary code:

```asm
        ld      de,BOARD_ROWS
        ld      b,ROW_COUNT
collision_loop:
        call    CHECK_COLLISION_AT_DE
        jr      c,blocked
        inc     de
        djnz    collision_loop
```

The analyzer knows `DE` and `B` are live across the call because later
instructions read them. If `CHECK_COLLISION_AT_DE` is inferred to preserve them,
there is no diagnostic. If another call may modify them, the analyzer reports the
conflict.

Optional contract syntax should remain available for external boundaries only:

```asm
; platform profile or optional compatibility comment
; @extern API_SCANKEYS
; @out A key_code
; @out carry new_key
; @out zero key_pressed
; @end
```

Native AZM should keep this metadata in comments. Human prose uses `@` tags for
interspersed metadata; generated source contracts use compact `;!` lines without
`@`. Older `;! @tag` and divider-block spellings remain compatibility input, but
current tools should not emit them.

## What this avoids

This design does not require:

- automatic stack frames
- generated callee prologues or epilogues
- high-level function syntax
- a new calling convention
- global register allocation
- hiding raw `call`, `jp`, `ret`, `push`, or `pop`

It improves ordinary assembly by checking the value lifetimes that are already
present in disciplined code.

## Recommended direction

The best minimal assembler improvement is an automatic effect and liveness
checking layer over normal ASM80-style source.

The first useful slice should support:

1. a complete register and flag effect table for Z80 opcode forms
2. register-pair decomposition into 8-bit constituent registers
3. flag-level effects for at least carry and zero, then the full individual flag set
4. routine summary inference for direct `CALL` targets
5. stack-balance tracking for `push`, `pop`, `call`, and `ret`
6. stack value-token tracking for `push`, `pop`, and `ex (sp),hl`
7. value-relation tracking for simple renames such as `HL_out = DE_in`
8. inferred stack-discipline summaries for callees
9. caller-side liveness across calls in straight-line code and simple loops
10. diagnostics when a live pre-call register or flag value is killed by a call
11. parsing AZMDoc callee contracts and caller hints
12. emitting inferred callee contracts as AZMDoc comments or external contract artifacts
13. built-in external contracts for MON-3 `RST` services

The first useful slice should defer:

- general RAM and port side-effect typing
- arbitrary memory alias proof
- full stack-argument and frame ownership typing
- deep data-flow proof across arbitrary branches
- path-sensitive return-value semantics
- indirect call target precision
- self-modifying code analysis
- automatic behavior-changing fixes such as inserting `push`/`pop` without
  explicit user approval

This is a modern assembler feature in the right sense. It does not make assembly
less explicit. It derives preservation expectations from ordinary machine code
and reports places where those expectations cannot hold.

## Current answers

1. Automatic inference should be the primary model. Caller-care annotations are
   optional scaffolding, not the desired steady state.
2. Inferred caller-care diagnostics should be the core feature, built from opcode
   effects and liveness.
3. Register pairs should decompose into their 8-bit constituents for clobber
   analysis.
4. `AF` should decompose into `A` plus individual flags for compatibility; `F`
   is not an internal register-care unit and should not appear in generated
   source-facing contracts.
5. Conditional effects should start as a worst-case union. Divergent effects
   are pressure to decompose routines.
6. `JP label` should be treated as a tail call only when it targets a declared
   routine at a routine exit, or when explicitly annotated.
7. Stack modeling is feasible and should be part of the first serious checker.
   It should track value identity through `PUSH`, `POP`, and disciplined calls,
   not merely check that the stack is balanced.
8. Register renaming should be treated as value preservation through a different
   carrier. `PUSH DE` followed by `POP HL` can preserve the old `DE` value as
   `HL`; later uses decide whether that rename is correct.
9. Callee contracts should use ASM80-compatible AZMDoc comments with known
   `@` tags inside ordinary `;` comments, and AZM should be able to generate
   those contracts from inference.
10. Caller hints should also use AZMDoc comments, but only as narrow suppressions
    for ambiguous call-site intent. Their presence may suppress a warning or
    error for the named conflict.
11. Conflicts can support fail, warn, report, and autofix workflows. Autofix may
    safely add AZMDoc comments, while behavior-changing fixes require explicit
    review.
12. RAM and port side-effect contracts are important but should be deferred to the
    next type-safety layer, except for simple known-symbol save/restore cases.
