# Reader Model — ZAX Course

This document defines who the reader is, what they know coming in, and what the course may and may not assume at each stage. Every prose decision should be testable against this model.

---

## Who the Reader Is

The reader is a beginner. They are curious and motivated, but they do not come in with a background in machine code, Z80, or assembly language. They may know very little about programming at all. They chose to work at this level — close to the hardware — but that does not mean they find it easy yet. They need things explained, not gestured at.

They are not reading documentation. They are learning a skill. The difference matters: a person reading documentation already knows what they are looking for. A person learning a skill needs to be brought to the point where they know what questions to ask.

---

## What the Reader Wants

By the end of the course, the reader wants to be able to:
- Write Z80 programs in ZAX without constantly consulting a reference
- Understand what the assembler is doing and why
- Read existing ZAX programs and understand them
- Trust their own understanding rather than copying patterns blindly

The course achieves this by building genuine understanding at each step, not by covering maximum surface area. A reader who deeply understands 80% of the material is more capable than one who has been exposed to 100% of it.

---

## What the Reader Does Not Know (at Start)

Do not assume any of the following without earning it in earlier chapters:

**Machine model:**
- What a byte is, what a bit is
- What hexadecimal means
- What a register is
- What a memory address is
- What the CPU does at the hardware level
- What the program counter does
- What a flag is or why it exists

**Z80 specifics:**
- The register names and their roles
- What HL vs DE vs BC are for
- What the flags register records
- How indirect addressing works
- What the stack is
- What little-endian means

**ZAX specifics:**
- What `section data` means
- What `func` means
- What `export` means
- What `const` vs a label vs a variable means
- Why sections need addresses

**Assembly concepts:**
- What a label is
- What an immediate value is
- What "the flags" means in context
- What a conditional branch does

---

## What the Reader Does Know (by Chapter)

### After Chapter 1
- Bit, byte, word
- Hexadecimal (base 16), `$` prefix
- Memory: 64K flat array, addresses $0000–$FFFF
- ROM vs RAM, memory map
- Little-endian word storage
- All named Z80 registers and their widths
- What PC, SP, HL, DE, BC, A, F do
- The flags register (S, Z, H, P/V, N, C) and their meanings
- The fetch-execute cycle

### After Chapter 2
- Opcodes: what they are, multi-byte forms
- What a running program looks like in memory (concrete hex example)
- What labels are and why they exist
- Why raw machine code is impractical
- The core advantage of assembly over machine code

### After Chapter 3
- ZAX syntax: `export func main()`, `end`
- `LD` in all its forms (register, immediate, indirect, indexed, direct)
- The parentheses rule: parentheses always mean memory access
- `section data state at $XXXX` — what it does, why the address is required
- Why functions appear at module scope (not inside section code)
- Constants (`const`) vs labels vs named storage
- Signed/unsigned, two's complement
- `INC`, `DEC`, `ADD` and their in-place semantics
- `EX DE, HL`

### After Chapter 4
- The flags register in practice (Z, C, S, P/V as used by branches)
- `cp n` — what it does, what flags it sets
- `sub n` — same flags as cp, stores result in A
- `or a` — what it does, when to use it
- `and n`, `or n`, `xor n` — bitwise logical ops; all clear C and set Z
- `xor a` — canonical zero-A-and-clear-flags idiom
- `jp label`, `jp cc, label` — unconditional and conditional jumps
- `jr` — relative jump, range limitation
- The label-based if/loop skeleton
- `neg`
- The `cp $80` technique for detecting a negative signed byte

### After Chapter 5
- `djnz` — what it does, how it differs from `dec b / jp nz`
- The zero-count hardware semantic (B=0 → 256 iterations)
- Post-loop register state (B=0, pointer advanced past last element)
- Sentinel loops (cp/jr z as exit, djnz as bound)
- Flag-exit loops

---

## What the Course May Assume

The course may assume:
- The reader has read every chapter before the current one
- The reader has run the example programs for each chapter
- The reader is motivated enough to reread a confusing paragraph
- The reader does not know what is coming in future chapters

The course may not assume:
- The reader remembers every detail from earlier chapters (a brief reminder is allowed)
- The reader has any programming background beyond what the course has provided
- The reader will infer something the prose has not stated

---

## How to Test a Section Against This Model

Before submitting any section, ask:

1. Does this section use any term that has not been introduced in this chapter or an earlier one?
2. Does this section assume the reader already knows why something matters, before explaining it?
3. Would a reader with exactly the Chapter N-1 knowledge set — no more — be able to follow this?
4. Is there a sentence that introduces two unfamiliar things at once?

If the answer to 1, 2, or 4 is yes, or the answer to 3 is no, the section needs work.

---

## The Knowledge Contract

The course makes an implicit contract with the reader: nothing will be used before it is explained. Breaking that contract — even once, even for a concept the writer considers obvious — teaches the reader that they are expected to keep up with things they do not yet understand. That is the fastest way to lose them.

When in doubt, explain. The cost of one extra sentence is much lower than the cost of a reader who gives up.
