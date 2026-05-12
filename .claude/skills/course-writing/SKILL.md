---
name: course-writing
description: This skill should be used whenever the user asks to write, draft, rewrite, or improve prose in the ZAX learning course, or whenever a writer or reviewer agent is working on chapter text. Also use when the user asks to critique, review, or audit course prose for quality, AI writing patterns, or voice. Use proactively when working on any file under learning/part1/ or learning/part2/ that contains explanatory prose. Invoke before generating any chapter text — not after. This is the authoritative writing standard for the ZAX course.
---

# ZAX Course Writing Skill

This skill governs all prose written for the ZAX learning course. It applies equally in writer mode (drafting or rewriting) and reviewer mode (critiquing existing prose). Both modes share the same principles; the difference is whether you are producing text or evaluating it.

For the full rules with before/after examples, read `references/banned-patterns.md` (20 banned patterns).
For the teacher/student model and knowledge assumptions, read `references/reader-model.md`.
For the structured review checklist, read `references/review-checklist.md`.

---

## The Fundamental Principle

Every paragraph must measurably advance the target reader's understanding. If a paragraph cannot pass that test, cut it, rewrite it, or move it. Never keep prose because it sounds polished, balanced, or nicely introductory.

---

## The Teacher and the Student

The writer is a person who likes Z80 and finds ZAX genuinely useful, talking to another person who wants to learn. Not producing documentation for an organisation. Not filing a report.

The student is a beginner: curious, motivated, but without a background in Z80, machine code, or assembly. They may know very little about programming at all. They need things explained, not gestured at.

The teacher's job in every section: take the student from not-knowing to knowing, without losing them on the way. That means:

- setting up each idea before introducing it
- one thing at a time
- acknowledging when something takes a moment to see
- sounding like a person who is pleased to explain this

The single test: if a motivated beginner read this section right now, would they come away knowing what I wanted them to know — and would they feel like continuing? If the answer is no to either part, the section is not finished.

---

## Two-Level Reading

Every section must work on two levels at once.

The **information level** carries facts: what the instruction does, what the register holds, what the flag means. This is the minimum.

The **intent level** carries the reason it matters: why you reach for this instruction over that one, what goes wrong when you miss it, where this pattern saves time or prevents a bug.

Both must be present. A section that only delivers facts is a reference manual. A section that only discusses why without grounding in mechanics is too vague. When a section feels weak, ask: which level is missing?

---

## Writer Mode

When drafting or rewriting course prose, follow this sequence for each section:

1. **State the problem first.** Before explaining how something works, say what problem it solves. Before describing how `cp` sets flags, say why you need a way to test A without changing it.

2. **Show, then explain.** When a concept is non-obvious, show it in code first, then explain what happened. Do not front-load explanation of something the reader has not yet seen.

3. **One idea per paragraph.** Do not compress two unfamiliar mechanisms into one paragraph because they are technically related. If the reader needs A before B makes sense, give them A first.

4. **Name the difficulty.** If there is a common mistake, say so: "This is the part that catches people." The reader is not fragile. Naming the difficulty is reassuring.

5. **End on the last sentence that taught something.** Do not add a closing sentence that restates what was just shown. Cut it.

6. **Use "you".** Never write "the reader" or "the programmer" or "one". If you would not say it to someone sitting next to you, do not write it.

Before producing any prose, read `references/banned-patterns.md` to load all 20 banned patterns. After drafting, run a self-check against the AI-specific tic list in that file. Pay particular attention to Rules 17–20 (false uplift structures, bold-term lists, em dash count, stock filler phrases) — these are the patterns most likely to survive a first-pass review.

---

## Reviewer Mode

When critiquing existing prose, structure the review in three passes.

**Pass 1 — Technical accuracy**
- Does every claim about ZAX/Z80 behaviour match reality?
- Does every code excerpt do what the surrounding text says it does?
- Does the text assume knowledge the course has not yet earned?

**Pass 2 — Structural**
- Does each section open with the problem before the mechanism?
- Does each section work on both the information and intent levels?
- Is there a section that is just a list of facts with no reason to care?
- Is there a section with no code grounding for its claims?

**Pass 3 — Prose quality**
Run the AI-specific tic check from `references/banned-patterns.md`. Search for each pattern explicitly. Do not assume you have noticed all occurrences — grep for them.

Rate each finding as:
- **Blocker**: incorrect language behaviour, wrong code claim, assumed knowledge the course has not earned
- **Significant**: structural failure, repeated filler, misframed section
- **Polish**: tighter wording, lighter repetition, cleaner transitions

For each finding, state: the exact location, the exact problem, and the kind of rewrite needed. Do not say "this feels weak" — say what is wrong.

---

## Chapter Structure

Every chapter must be buildable from this skeleton:

1. What changed from the previous chapter, or what problem this chapter addresses
2. A first program or example that uses the new concept
3. Sections that teach one concept each, with code grounding
4. The examples section (referencing the companion .zax files)
5. A summary bullet list

A chapter introduction must:
- orient the reader
- state what new thing this chapter adds
- not justify the whole language again
- not wander into philosophy
- not define the subject by saying what it is not

---

## Positive Writing Model

Prefer this pattern:

1. name the thing
2. state what it does
3. show where it appears (code)
4. explain why it matters now
5. move on

That is enough. Do not surround it with atmospheric prose.

---

## Additional Resources

Read these before working on course prose:

- **`references/banned-patterns.md`** — All 16 banned prose patterns with before/after examples, plus the AI-specific tic checklist. Read this in full before drafting or reviewing.
- **`references/reader-model.md`** — Detailed model of the target reader: what they know, what they do not know, what the course may assume.
- **`references/review-checklist.md`** — Structured pass/fail checklist for the reviewer role, organised by severity.
