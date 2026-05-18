# Bug Report: Register-Care Audit Introduced Pacmo Runtime Regression

## Summary

The register-care documentation/audit process used on the `tetro` repository caused a serious Pacmo runtime regression. The change was intended to add or improve register/flag contract comments, but it also rewrote executable Z80 code and Pacmo data. That made the audit destructive: it helped satisfy a contract-reporting process while corrupting program behavior.

The regression was first observed in Pacmo as:

- maze walls rendering cyan instead of blue
- scrolling and viewport behavior appearing broken or inconsistent
- Tetro continuing to behave correctly

The last confirmed working Tetro/Pacmo commit is:

```text
36e30b5 Merge pull request #33 from jhlagado/codex/inverted-t-controls
```

The first confirmed bad commit is:

```text
778770a Merge pull request #34 from jhlagado/codex/register-care-contracts
```

This is especially important for AZM because PR #34 was part of the register-care workflow. A register-care tool or migration assistant must not repair an audit finding by modifying program behavior unless explicitly asked to perform a code fix.

## Impact

Pacmo became visibly incorrect on real/manual testing. The wall colour changed from blue to cyan, which is consistent with wall and path bit masks being mixed together. Movement/scrolling also appeared wrong. Since Tetro still worked, the issue was not a general platform failure; it was isolated to Pacmo changes introduced by the register-care pass.

The change also reintroduced old Pacmo keypad mappings that had previously been removed:

- `A`
- `5`
- `7`

Those keys were part of the older diamond control scheme. The intended Pacmo alternate controls had already moved to an inverted-T scheme. Reintroducing those keys was another behavior change hidden inside a register-care PR.

## Root Cause

The register-care process treated contract mismatches as something to fix by editing code, not only by editing contracts. In PR #34, the diff included real instruction and data changes in Pacmo files:

- `src/games/pacmo/render.asm`
- `src/games/pacmo/movement.asm`
- `src/games/pacmo/data.asm`
- `src/games/pacmo/logic_dispatch.asm`

The highest-risk change is in `RENDER_WORLD_ROW_TO_BACK`.

Working version at `36e30b5`:

```asm
        CALL    WINDOW_BYTE_FROM_BC
        POP     DE
        PUSH    AF                      ; visible wall mask

        LD      HL,PACMO_EATEN_ROWS
        ADD     HL,DE
        LD      A,(HL)
        LD      B,A
        INC     HL
        LD      A,(HL)
        LD      C,A
        LD      A,(VIEW_X)
        CALL    WINDOW_BYTE_FROM_BC
        LD      B,A                     ; B = visible eaten mask
        POP     AF
        LD      C,A                     ; C = visible wall mask
        OR      B
        CPL                             ; A = visible uneaten open path mask
```

Bad version introduced by `778770a`:

```asm
        CALL    WINDOW_BYTE_FROM_BC
        POP     DE

        LD      HL,PACMO_EATEN_ROWS
        ADD     HL,DE
        LD      E,A                     ; E = visible wall mask
        LD      A,(HL)
        LD      B,A
        INC     HL
        LD      A,(HL)
        LD      C,A
        LD      A,(VIEW_X)
        CALL    WINDOW_BYTE_FROM_BC
        LD      B,A                     ; B = visible eaten mask
        LD      C,E                     ; C = visible wall mask
        OR      B
        CPL                             ; A = visible uneaten open path mask
```

Even if this particular rewrite looks register-contract motivated, it is not a contract-only change. It changes the generated machine code and the register lifetime strategy in a rendering routine. A register-care tool should flag the mismatch and ask for a human decision; it should not silently substitute stack preservation with a different register-based preservation scheme.

PR #34 also changed Pacmo input behavior by adding key matches in `NORMALIZE_INPUT_TO_DIRECTION`:

```asm
        CP      PACMO_KEY_5
        JR      Z,NORMALIZE_LEFT
        ...
        CP      PACMO_KEY_7
        JR      Z,NORMALIZE_RIGHT
        ...
        CP      PACMO_KEY_A
        JR      Z,NORMALIZE_UP
```

That was not related to documenting clobbers or preserves. It reintroduced a removed control scheme and should never have been bundled into a register-care contract pass.

## Why This Matters for AZM

Register-care analysis is supposed to improve confidence in assembly code. If the tooling or migration process responds to warnings by changing instructions, it can turn a static audit into an unsafe refactoring engine.

For Z80 code, small register-lifetime changes are not cosmetic. Replacing a `PUSH AF` / `POP AF` pair with temporary storage in `E`, `H`, or another register can be incorrect even when a local contract appears to allow it. The surrounding routine may have stack balance, flag, or register-lifetime assumptions that are not fully captured by comments yet.

The failure mode here is not that AZM detected too much. The failure is that contract remediation crossed the boundary from documentation into behavior-changing edits.

## Recommended AZM Improvements

1. Separate contract annotation from code transformation.

   A register-care annotation pass should only insert or update comments/metadata. It must not add, remove, or reorder executable instructions.

2. Treat executable diffs as high-risk.

   If a register-care workflow changes any non-comment assembly line, it should fail a safety gate unless the user explicitly requested a code rewrite.

3. Classify fixes as either contract fixes or code fixes.

   Contract fixes:
   - update `@in`
   - update `@out`
   - update `@clobbers`
   - update `@preserves`

   Code fixes:
   - add/remove `PUSH` or `POP`
   - move values between registers
   - change branch condition setup such as `OR A` to `XOR A`
   - add key mappings or constants
   - alter data tables or LCD strings

   These categories need different review gates.

4. Require binary equivalence for annotation-only migrations.

   For asm80-compatible targets, an annotation-only register-care PR should assemble before and after and require byte-for-byte identical `.bin` output. If the bytes differ, the tool should report the changed address ranges and stop.

5. Report contract violations instead of guessing repairs.

   For example:

   ```text
   RENDER_WORLD_ROW_TO_BACK: contract says E preserved, but code stores temporary wall mask in E.
   Suggested actions:
   - correct the contract if E is intentionally clobbered
   - or manually preserve E if callers require it
   ```

   The tool should not choose either action automatically.

6. Preserve user-visible data unless explicitly requested.

   PR #34 also changed LCD/control text and key mappings. A register-care workflow should never change data tables or strings unless that is the stated task.

## Suggested Regression Test for AZM Workflow

Use a fixture modeled on the Pacmo render bug:

```asm
RenderRow:
        CALL    WindowByte
        PUSH    AF
        CALL    WindowByte
        POP     AF
        LD      C,A
        RET

WindowByte:
        LD      D,A
        ; shifts using B,C,D
        LD      A,B
        RET
```

A register-care annotation process may document this code, but it must not rewrite `PUSH AF` / `POP AF` into storage in another register. The expected assembled bytes must be identical before and after annotation.

## Tetro Repository Recovery Plan

For the Tetro/Pacmo repository, the safe recovery path is:

1. Keep `36e30b5` as the last known good Pacmo baseline.
2. Reapply only comment/contract additions from PR #34 after manually excluding behavior changes.
3. Rebuild Pacmo and compare the binary against `36e30b5` when the intended change is comment-only.
4. Only after Pacmo is confirmed stable, resume the later label/path harmonisation work.

