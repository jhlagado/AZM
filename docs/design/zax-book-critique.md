# Critique: *Learning ZAX* — A Pedagogical Review

*A reading for the author, with a novice's eyes and an educator's concern.*

---

## First Impression: What the Book Gets Very Right

Let me say this clearly before I take it apart: the underlying architecture of this book is excellent. The decision to show raw machine code first, let the reader feel the pain of it, and then introduce ZAX features as targeted solutions to specific felt problems is exactly the right pedagogical strategy. Most assembly tutorials either bury you in theory or throw you into code with no context; this one constructs a narrative in which each new concept earns its place by solving a problem the reader has already experienced. Chapter 9 — the "hinge" chapter — is particularly well-conceived. Showing a working program that has genuine friction, naming that friction explicitly, and then fixing it piece by piece over the following four chapters is the kind of sequencing that separates a thoughtful educator from someone who just knows a lot about assembly.

The prose itself is disciplined. Sentences are short. Technical claims are specific. There is very little hand-waving. When the book says "A `ld` between your comparison and your `jp` leaves the flags exactly as they were; a `dec` between them replaces them," that is a precise statement of a real problem, and the surrounding context makes it stick. The writing standard is high and it is maintained consistently across both parts.

That said, the book has structural problems, pedagogical gaps, and moments where the novice reader — the one the book says it's targeting — will silently founder. Here is where I think it needs work.

---

## The Missing Front Door

The book begins with no introduction. The root README is a table of contents. Part 1's README states "No prior knowledge assumed" and then describes the learning arc. What it never does — what the book never does, anywhere — is answer the question a complete beginner will ask on page one: *Why am I doing this?*

Why should a person who has never programmed before want to learn assembly language? Why the Z80 specifically? What will they be able to do when they're done? Is this for retro computing? For embedded hardware? For understanding how computers work at a fundamental level? The book is presumably written for people who are already motivated, but even a motivated reader needs to know what they're walking toward. A single opening page — not a chapter, just a page — that says "here is what assembly is for, here is why the Z80 is a good machine to learn it on, here is what you will be capable of by the end" would make every subsequent chapter easier to absorb. Right now the reader is handed a map with no sense of the territory.

The Part 2 introduction is better in this respect — it tells you what it assumes, what it covers, and how to use the chapters. The same discipline needs to be applied to Part 1 and to the book as a whole.

---

## Chapter 1: You're Asking for a Lot Before the Reader Has a Reason to Care

Chapter 1 is technically strong. The explanation of bits, bytes, hex, the register set, and the fetch-execute cycle is accurate and well-written. But it asks the reader to absorb and care about a great deal of dry material before they have touched anything that runs.

The positional-value table for `%01110101` is a good example. It's a perfectly clear table. But the reader has no reason yet to care that `%01110101` equals 117. They don't know what values they'll be handling, don't know what a register is for, and don't know why the hex representation `$75` is useful. The explanation is answering a question the reader hasn't asked yet.

The flags register table appears in Chapter 1, listing all six flags with their meanings. But the reader won't use most of these for several chapters. The C (carry) and Z (zero) flags are immediately relevant; H, N, and P/V are not. Presenting all six upfront gives the reader nothing actionable and a lot to try to remember. The book could defer the full table to the appendix (where it already lives as a reference) and introduce flags contextually — the way the chapter on flags actually does in Chapter 4.

The deeper problem is that Chapter 1 has no code. It describes an abstract machine without showing the reader what it feels like to give that machine an instruction. Even a single byte of machine code — "here's what `$3E` does" — placed somewhere in Chapter 1 would give the reader a foothold in the material. The current chapter is all scaffolding and no building.

---

## The Hex and Binary Conversion Problem

The book teaches hex-to-binary conversion in Chapter 1, which is correct sequencing. But the presentation makes it feel more like arithmetic homework than like a skill the reader needs.

The split-into-groups-of-four technique is elegant and correct. What's missing is a framing that tells the reader *when they'll actually use this*. In practice, a Z80 programmer reads hex values in the assembler output, in memory dumps, and in instruction tables. They rarely convert them to binary by hand. The conversions they care about are: "what are the individual bits in this status byte?" and "what decimal value does this hex address correspond to?" A brief sentence connecting the technique to a concrete use case — "when you're testing whether bit 4 of a status register is set, you'll need to see the hex value as individual bits" — would make the table feel like a tool rather than a test.

---

## Chapter 3: The Chapter That Is Trying to Do Everything

Chapter 3 is where the book starts to show strain. In a single chapter, the reader encounters the full LD instruction in all its forms (twelve separate family entries plus a summary table), sections and memory layout, the difference between constants and labels, named storage, ADD/INC/DEC, *and* signed versus unsigned values with two's complement.

The LD instruction table alone — twelve rows with variants — is enough material for one chapter. Two's complement is conceptually demanding and genuinely important, but it appears here as an aside and is then mostly dormant until signed arithmetic becomes relevant in Chapter 4. The reader is asked to understand and remember it without immediately using it. That's a bad pedagogical situation: material learned without use is quickly forgotten.

My recommendation would be to split Chapter 3. Make one chapter about the LD instruction in its most common forms — register-to-register, immediate into register, the (HL) indirect form, and named storage — with examples that the reader can actually run. Defer the full LD forms table to the appendix and introduce the rarer forms (BC, DE indirect; the 16-bit memory forms) at the point in the narrative where they're first needed. Defer two's complement to Chapter 4, where signed arithmetic is actually taught. Two's complement needs to be understood before `cp` with signed values, not before the student has written any jumps.

The "parentheses always mean memory" rule is one of the most important concepts in the chapter and it's right. But it's slightly underemphasized given how often beginners get this wrong. This rule deserves its own callout, a box, something that signals "stop and memorize this, right now."

---

## The Flag-Tracking Problem: Explaining It Is Not the Same as Teaching It

The book knows that flag tracking is hard. It says so explicitly and repeatedly. "Tracking this is one of the things that takes time to do automatically when reading Z80 code." "Getting this wrong is one of the most common sources of silent bugs in Z80 programs." These are honest statements. The book is right. But identifying a difficulty is not the same as helping the reader develop a skill.

Here is what the book doesn't do: give the reader a method. How should a beginner actually trace flag state through a sequence of instructions? The book shows worked examples where the author does it implicitly, but never gives the reader a procedure they can apply. Something as simple as "when you write a jump, ask yourself: which instruction last touched the flag I'm testing? does anything between that instruction and the jump also touch it?" would be a practical tool the reader could use independently. Without it, they're left to absorb flag discipline by osmosis — which works eventually, but costs a lot of bugs along the way.

The problem shows up most sharply in the treatment of `while NZ`. The `ld a, b / or a` pattern for establishing flags before a loop appears in at least eight separate places across Parts 1 and 2, each time with a short explanation. By the fourth or fifth time, the re-explanation isn't helping the reader understand something they missed — it's signaling that the author isn't confident the reader learned it. The right approach would be to teach flag establishment as a *named* technique the first time it appears in Chapter 4 or 5, give it a name ("flag-before-branch"), and then simply invoke the name in later chapters. "Use the flag-before-branch pattern here" would remind the reader to apply what they already know rather than repeating the whole explanation.

---

## The IX Frame Notation Needs More Space

Chapter 10 introduces the `(ix+tbl+0)` and `(ix+tbl+1)` notation for accessing frame slots. This is explained — the `+0` selects the low byte, `+1` the high byte — but the explanation is brief and the notation is quite alien to a reader who has only ever seen `(ix+d)` with a numeric displacement.

The underlying idea — that every parameter gets a 16-bit slot on the stack regardless of whether it's declared as `byte` or `word`, and that `+0` and `+1` select which of those two bytes you're accessing — needs to be made absolutely explicit with a diagram or a concrete memory layout. What does the stack look like, numerically, when a `func` with two parameters is called? Where is each parameter's slot? What does IX point to? Without this picture, the reader is memorizing syntax without understanding the mechanism, which means they won't know what to do when something goes wrong.

The sentence "the `+0` and `+1` suffixes select which byte of a slot you want" is there, but it deserves a full worked example. Take a two-parameter function, show what the stack frame looks like in memory, label each byte, and show exactly which `(ix+name+0)` expression corresponds to which byte. This is one of the most conceptually important moments in the entire book — it's where raw Z80 and ZAX features first overlap in a non-trivial way — and it gets roughly half a page.

---

## Chapter 9's Push/Pop Is a Bit Unfair

The `count_above` function in Chapter 9 contains a `push bc / ld d, 0 / pop bc` block that the book then characterizes as an example of raw Z80 friction. The specific claim is: "you cannot name your variables in raw Z80 — you have to pick a register, and you cannot easily see at a glance which registers are already in use for what. When you cannot name things, you save everything and hope."

This is a real phenomenon and the chapter makes a valid point. But an experienced Z80 programmer looking at that specific code would just write `ld d, 0` directly, because `ld d, 0` does not touch B or C. The push/pop was never mechanically necessary. The example somewhat constructs the problem it claims to diagnose. A more honest framing might be: "you'd know this was safe only if you traced through and verified that `ld d, 0` doesn't affect B or C. In a bigger function, with more registers in use, that tracing gets genuinely difficult." The friction is real, but the specific instance is a slight straw man. A reader who knows their LD instruction — which the book has taught them — might notice this and lose a little trust.

---

## There Are No Exercises in Part 1

Part 2 ends each chapter with four exercises. They're good exercises — concrete, graded, and directly connected to the chapter material. Part 1 has none.

A beginner learning assembly language has to write code. Reading about assembly and understanding assembly are related but not identical activities, and the gap between them is large. Part 1 is the part where the reader is building foundational skills — the ones that will underpin everything in Part 2. The absence of practice exercises at exactly this stage is the most significant pedagogical gap in the book.

The exercises don't need to be elaborate. "Modify `01_register_moves.zax` to also swap HL into BC" or "extend the loop in `03_flag_tests_and_jumps.zax` to count down from 10 instead of 5" would give the reader something to do with what they've learned. The exercises in Part 2 show that the author knows how to write good ones. Apply that same discipline to Part 1.

---

## No Guidance on What To Do When Things Go Wrong

The book teaches you to write programs. It never tells you what to do when they don't work. Assembly is notoriously hard to debug — the CPU doesn't tell you "you wrote to the wrong address" or "you forgot to reload HL." You get wrong results, silently.

Even a single paragraph near the beginning of Part 1 — "here is how to trace your program: compile it, run it in the emulator, inspect the registers at each step, compare what you expected with what you got" — would give the reader a framework for independent learning. Right now, if the reader's first program doesn't work, they have no tools to find out why. That's a point where many beginners give up.

---

## The Missing "Why ZAX" Conversation

Throughout the book, ZAX features are introduced as solutions to Z80 friction. This is effective. But the reader is never given a clear statement of where the line between Z80 and ZAX is. Is `ld hl, de` a Z80 instruction? No — it's a ZAX pseudo-opcode. Is `func` a Z80 concept? No. Is `djnz` a ZAX addition? No — it's native Z80. The reader assembles a partial mental model by inference, but it would be much cleaner to have one paragraph that says "raw Z80 is X; ZAX adds Y on top of it, and generates the same machine code as if you had written the Z80 by hand."

This matters practically when the reader tries to look something up in external Z80 documentation. If they search for `func` or `if NZ` in a Z80 reference, they won't find it. Knowing that those are ZAX constructs, not Z80 instructions, would save confusion.

---

## Interrupts Are Absent

The Z80's interrupt system — modes 0, 1, and 2, the `EI`/`DI` instructions, the interrupt service routine — is absent from the book entirely. This is a defensible editorial choice for a course of this scope, but it should be acknowledged. A student who finishes this course and tries to write a real-time hardware application will need interrupts almost immediately. Even a brief section in Chapter 8 or an appendix entry saying "this course doesn't cover interrupts; here is what they are and where to learn about them" would close the gap gracefully.

---

## Part 2's Structural Tension

Part 2 was designed to work as a standalone entry point for readers who already know Z80 from other sources. That's a legitimate goal. But it creates an awkward double audience: the reader who just finished Part 1 and the experienced Z80 programmer who's just discovered ZAX. The result is that Part 2 Chapter 1 re-introduces `:=`, `func`, and `while NZ` with fairly detailed explanations that a Part 1 graduate doesn't need. Meanwhile, it occasionally drops into Part 1 material without explanation, assuming the reader knows it.

The specific tension is in the flag-establishment re-explanations. By the time a Part 1 reader reaches Part 2 Chapter 1, they have seen `ld a, 1 / or a` before `while NZ` enough times that they know the pattern. Re-explaining it adds length without adding understanding. For a new-to-Part-2 reader, it's useful. The book needs to decide who it's primarily serving in each section, or find a way to layer the material so both audiences are served without redundancy — perhaps a brief "if you've read Part 1, skip to the examples" note where the recaps occur.

---

## Two Smaller but Real Issues

**The book doesn't tell the reader what system they're running on.** The memory map `$0000–$1FFF = ROM`, `$2000–$7FFF = RAM` in Chapter 1 is described as "a typical small Z80 board." The TEC-1 gets a brief mention in Chapter 8. But the examples themselves use `at $8000` for their data sections. What machine is this? Where does this code actually run? A beginner needs a concrete mental image of the hardware they're programming. Even if the book is deliberately platform-agnostic (for portability), it should say so, and explain what "platform-agnostic" means in practice.

**The book ends on a minor key.** Chapter 9 of Part 2 — the final chapter — is about the language's known limitations. This is intellectually honest and I respect it. But it means the course ends with a list of things ZAX can't do yet. The eight-queens example is described as a "lens on the current ZAX surface" that shows "what it still requires workarounds." After working through a long and demanding course, the reader deserves a moment of "look what you can do now." The limitations are worth documenting, but they shouldn't be the last thing the reader encounters. Move the friction log to an appendix or to the design documentation, and end the final chapter with a genuine forward-looking close: here is what you built, here is where you can go from here, here is what this knowledge opens up.

---

## Summary

This is a good book that is not yet a great one. The technical content is accurate, the sequencing of ideas is mostly sound, and the writing is clear. The gaps are largely pedagogical rather than technical: a missing introduction, no exercises in Part 1, insufficient guidance on debugging, and a tendency to explain concepts before the reader has a reason to need them.

The book knows how to be a good teacher — the chapter 9 friction analysis, the "before and after" code comparisons, the explicit naming of where things get hard. It should apply that same thoughtfulness more consistently throughout. The reader who needs this book is not someone who will fill in the gaps themselves. They need the context, the motivation, and the practice that is currently missing. Give them those things and this becomes the assembly language tutorial it was meant to be.
