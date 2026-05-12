# ZAX Course Writing Standard

Status: active editorial standard
Audience: writer, editor, reviewer, designer

## Purpose

This document defines the writing, editing, and review standard for
educational prose in the ZAX course materials.

It exists to prevent two failure modes that often occur together:

- vague, rhetorical, LLM-style prose that sounds intelligent but does not teach
- accurate but compressed prose that is technically correct and exhausting to read

The standard is intentionally strict. It tells the writer not just what to
remove but what to aim for.

---

## The teacher and the student

This is the most important section. Everything else follows from it.

The writer is a teacher. The reader is a student. That is not a metaphor — it
is the actual relationship. The student wants to learn how to use ZAX to write
Z80 programs. The teacher's job is to make that happen in a way that keeps the
student engaged and leaves them feeling capable, not confused.

**Who the student is.** The student is a beginner. They are curious and
motivated, but they do not come in with a background in machine code, Z80, or
assembly language. They may know very little about programming at all. They
chose to work at this level — close to the hardware — but that does not mean
they find it easy yet. They need things explained, not gestured at.

**What the student needs.** They need to understand what they are looking at
before they are told how it works. They need to know why something matters
before they can care about the mechanism. They need to feel that the material
is within their reach. And they need enough momentum — enough sense of progress
— to keep going when a concept is hard.

**What the teacher is trying to do.** In every section, the teacher is trying
to do one thing: take the student from not-knowing to knowing, without losing
them in the process. That means:

- setting up each idea before introducing it
- explaining one thing at a time
- acknowledging when something takes a moment to see
- sounding like a person who is pleased to explain this, not a person filing a report

**What the teacher is not trying to do.** The teacher is not trying to sound
impressive. The teacher is not producing a reference document. The teacher is
not compressed for efficiency. The teacher wants the student to come away from
each chapter knowing something they did not know before, and feeling good about
having learned it.

**The single test.** After writing a section, ask: if a motivated beginner read
this right now, would they come away knowing what I wanted them to know — and
would they feel like continuing? If the answer is no to either part, the
section is not finished.

---

## Who the writer is

The writer is someone who likes Z80 and finds ZAX genuinely useful. They are
not producing documentation for an organization. They are a person talking to
another person who wants to learn.

**Motive**: The writer wants the reader to understand how this works and feel
the satisfaction of it clicking into place. Not to admire the language from a
distance, but to be able to use it.

**Tone**: Direct. Warm but not cheerful. Like sitting next to someone at a
keyboard. You would not say "the reader should note that" — you would say
"notice that." You would not say "this imposes a bookkeeping overhead" — you
would say "this means you have to track the values yourself."

**What this rules out**:
- Neutral third-person distance ("the reader", "one might observe")
- Documentation language ("this section describes", "it is worth noting")
- Academic hedging ("in general", "it may be said that")
- Writing that is correct but has no human behind it

If a sentence could have been produced by a committee, rewrite it.

---

## Narrative and voice

The course is not a reference manual. It is a story told in order, and each
chapter is a conversation with the reader.

**Use "you".** The second person is not informal — it is direct. "You will
see" is better than "the reader will observe." "You need to know X before Y
makes sense" is better than "X is a prerequisite for Y."

**Chapters lead somewhere.** Each section should feel like it is moving toward
something. The reader should sense forward motion — not just a list of facts
to absorb, but a path being walked. Use short signposts: "That pattern has a
cost, which the next chapter addresses." "Now that you have seen the loop
structure, here is the one thing the hardware does differently from what you
expect."

**Show, then explain.** When a concept is surprising or non-obvious, show it
first in code, then explain what just happened. Do not front-load explanation
of something the reader has not yet seen.

**Name the moment of confusion.** If there is a common mistake or a thing
that trips people up, say so directly: "This is the part that catches people."
"The easy mistake here is to forget the init." The reader is not fragile.
Naming the difficulty is reassuring, not discouraging.

**Short sentences carry more weight.** Long sentences make readers work harder.
If a sentence runs past 25 words, see whether it can be split. One idea per
sentence is not a style rule — it is a teaching rule.

**The writer has a point of view.** It is fine to say "this is the cleaner
approach." It is fine to say "this pattern is worth memorising." The writer
does not have to be neutral about everything. What they cannot do is claim
something is good without showing why.

---

## Explanatory generosity

Removing jargon is not the same as being readable. A chapter can pass every
voice and tone check and still feel like reading cleaned-up notes — technically
correct, no bad words, but terse and effortful. This section addresses that
failure mode.

**Background before mechanics.** Before explaining how something works, say
what problem it solves. Before describing the lowering detail of `:=`, say what
a programmer is trying to do and why a plain `ld` doesn't cover it. The reader
needs to care before they can absorb.

**One idea at a time.** Do not compress three new concepts into one paragraph
because they are technically related. If the reader needs to understand A before
B makes sense, give them A first and B second. A paragraph that introduces two
unfamiliar mechanisms at once will be reread or skipped.

**The first-read test.** Ask: could the intended reader understand this paragraph
on a single reading? If the answer is probably not — even if every sentence is
accurate — the paragraph is too compressed. Slow it down. Add one explanatory
sentence. Give one more example. Earn the next step.

**Terminology burden.** Count the unfamiliar technical terms in a paragraph. One
or two is fine. Three or more means the paragraph is trying to do too much.
Delay some terms to a later sentence or section, or define them before use.

**Warmth without fluff.** The writer should sound like they want the reader to
get it. Not performed enthusiasm — just the small signals that come from someone
who actually cares whether the explanation works: anticipating confusion,
offering a second way to say a hard thing, acknowledging when something takes a
moment to see. These do not require extra words. They require presence.

**The pleasantness test.** After writing a section, ask: does this feel like
being taught by a person, or like reading an accurate but impersonal summary?
The goal is not entertainment. The goal is that the reader feels accompanied
through the material, not handed a document to process alone.

---

## Non-negotiable rule

Every paragraph must measurably advance the target reader's understanding.

If a paragraph does not clearly do that, it should be:

- cut
- rewritten
- or moved

Do not keep prose because it sounds polished, balanced, philosophical, or
"nicely introductory." Keep it only if it helps the reader understand the
subject more clearly.

## Terms before use

Every term the student might not know must be explained before it is used,
not after. This applies to:

- Z80-specific terms (`flag`, `register pair`, `carry`, `stack`, `opcode`)
- ZAX-specific terms (`func`, `var`, `:=`, `section data`, `op`)
- General programming terms if the reader level does not guarantee familiarity
  (`frame`, `local variable`, `call stack`, `unsigned`)
- Notation that has not yet appeared (`$` for hex, `0x` prefix, binary bit
  notation)

The test is simple: if the intended reader could plausibly not know this term,
it needs a definition on first use. Not a paragraph — often one clause is
enough: "the carry flag (a single bit the CPU sets when an addition overflows)."

Technical jargon is unavoidable in a course about machine code. The problem is
not jargon itself. The problem is jargon used without introduction, or jargon
that sounds technical but carries no information ("assembler surface",
"ergonomic cost"). The distinction:

- **Introduce and use**: acceptable. "The Z flag is set when the result is zero.
  The `if Z` block runs when Z is set."
- **Use without introduction**: not acceptable. A term the reader has not
  encountered should not appear naked in a sentence.
- **Bureaucratic jargon**: not acceptable. Words that sound like they mean
  something but do not help the reader read or write code.

## Reader-first rule

Before writing any chapter or section, state:

1. who the reader is
2. what they already know
3. what they do not know yet
4. what they should understand by the end of the section

If these are not clear, stop and define them first.

The writer must never assume knowledge that the current volume has not earned.

## Mandatory drafting skeleton

Every chapter draft should be built from this skeleton:

1. chapter purpose
2. prerequisites
3. main concept sequence
4. example-bearing sections
5. chapter close

At minimum, the writer should be able to name:

- the exact concept each section introduces
- the exact file or code excerpt that carries it
- the exact understanding the reader should gain before moving on

If the writer cannot name those three things, the section is not ready.

## Allowed paragraph jobs

Every paragraph must have exactly one primary job.

Allowed jobs:

- define one concept
- distinguish two concepts the reader may confuse
- explain why a concept matters at this point
- walk through one concrete example
- state one rule the reader can apply
- connect the current section to the next step

If a paragraph is doing none of these, it is probably filler.

If it is trying to do several at once, it is probably muddy.

## Paragraph contract

A good paragraph should let a reviewer answer all of these quickly:

- what single thing is this paragraph trying to teach?
- what sentence does the real teaching work?
- what prior knowledge does it rely on?
- what would be lost if this paragraph were deleted?

If the answer to the last question is "not much," cut it.

## Banned prose patterns

The writer should treat the following as high-risk and usually unacceptable.

### 1. Negative-definition padding

Avoid paragraphs built around:

- "X is not Y"
- "X is not merely Y"
- "X is neither Y nor Z"

unless the contrast is immediately necessary and the reader already knows Y and
Z well enough for the contrast to teach something.

If the reader does not understand the negated thing, the paragraph teaches
nothing.

The tightest form of this failure is the "inversion pair": one sentence states
the negative, the next states the positive. The positive sentence already
contains everything the reader needs. Cut the negative one.

But stripping the negative is only the first step. The better fix is to deepen
the positive with a concrete verb or specific detail — not just restate it more
cleanly.

Bad:
> A sentinel loop does not count iterations. It tests each element against a
> known value and stops when it finds a match.

Stripped (better, but still flat):
> A sentinel loop tests each element against a known value and stops when it
> finds a match.

Deepened (best):
> A sentinel loop tests each element against a known value. The data tells it
> when to stop; there is no count to set in advance.

The last version teaches something the stripped version does not: why you would
choose this shape over a counted loop.

### 2. Empty rhetoric

Avoid words and phrases like:

- honest
- elegant
- powerful
- flexible
- expressive
- defensible
- robust
- natural
- clean

unless the next sentence proves the claim concretely in code or behaviour.

These words are not explanations.

### 3. Philosophy without operational payoff

Avoid abstract positioning that does not cash out in:

- a rule
- an example
- a code contrast
- a practical consequence

If it does not help the reader read or write code, it probably does not belong.

### 4. LLM balancing habits

Watch for this failure mode:

- sentence 1 says something
- sentence 2 softens it with vague contrast
- sentence 3 reframes it in broad general terms
- none of the three sentences actually teach anything

Cut this aggressively.

### 7. Hollow landing sentences

These sentences appear at the end of a paragraph or section and look like they
are drawing a conclusion. They are not. They restate what was just shown, add
"that is just how it works", and teach nothing.

Patterns to cut:

- "That is simply how the hardware works."
- "The CPU does exactly what you write, nothing more."
- "This is just the way Z80 assembly operates."
- "There is no way around this."
- "Nothing happens unless you ask for it."

These are closing flourishes. If the explanation before them was clear, the
sentence adds nothing. If it was not clear, the sentence does not fix it. Cut
them and end on the last sentence that actually teaches.

### 8. "This is the standard way to..."

Avoid classifying an idiom before showing it. The classification adds no
information — it tells the reader how to feel about what follows, not what
follows. Show the pattern, explain what it does and why. If it is common, the
reader will discover that through use.

Bad:
> This is the standard way to test whether A holds zero without a comparison.
> `or a` / `jr z, target`

Better:
> `or a` sets Z if A is zero, without changing A and without needing a
> comparison value. One byte instead of two.

### 9. Performative section openers

Avoid sentences that announce the importance of what follows rather than
delivering it:

- "This is the section that saves you from your first truly baffling bug."
- "This is the key insight."
- "What follows is the most important rule in this chapter."

These are stage directions. They create an expectation and then make the reader
wait for the real content. Start with the content.

### 10. "It is worth..." and "Note that..."

Cut on sight:

- "It is worth noting that..."
- "It is worth pausing to consider..."
- "Note that..."
- "Notice that..."
- "It should be mentioned that..."

These are hedges the writer uses instead of stating a thing directly. Every
one of them can be replaced by just stating the thing.

Bad:
> It is worth pausing to think about what state the CPU is in after a loop.

Better:
> After a loop exits, all three registers the loop touched have changed.

### 11. Redundant intensifiers at sentence end

Watch for phrases appended to a sentence that already made its point:

- "nothing more"
- "no matter what"
- "regardless"
- "in any case"
- "at all times"

Bad:
> The CPU does exactly what you write, nothing more.

Better:
> The CPU does exactly what you write.

The word "exactly" already closes the claim. "Nothing more" is the writer
making sure you heard it — which is not the writer's job.

### 5. Historical name-dropping without teaching value

Avoid invoking classic books, famous authors, or historical lineages unless the
reference directly helps the reader understand the current code or course
structure.

The reader does not need literary pedigree. The reader needs operational
understanding.

### 6. Jargon and internal vocabulary

Use common English words.

Phrases like "assembler surface", "justified relief", "bookkeeping cost",
"cash out", "operational payoff", "teaching payload", "reader model" are
internal vocabulary — shorthand between writers. They are not reader-facing
language.

If you would not say it aloud to someone sitting next to you learning Z80 for
the first time, do not write it in the course.

Ask: what am I actually trying to say? Then say that, in plain words.

### 12. Discourse connectors used as padding

"However", "therefore", "moreover", "in addition", "as a result", "in other
words", "on the other hand" — these are essay connectors. They belong in
argumentative prose that builds a case step by step. Course teaching is not
argumentative; it is sequential. When a connector appears, it usually means the
writer is explaining a relationship they could have just shown directly.

Bad:
> The Z flag is set after `cp`. However, `ld` does not affect flags.

Better:
> `cp` sets the Z flag. `ld` does not touch flags at all.

The second version shows the difference directly and costs no extra words. The
connector "however" implied a contrast the reader had to interpret. Just state
both facts.

Other signals: "in other words" means the previous sentence was unclear. Fix
the previous sentence instead of adding a restatement.

### 13. Placeholder nouns

Generic nouns standing in for a specific one:

- "thing" / "things" / "stuff"
- "aspect" / "aspects"
- "element" / "elements"
- "area" / "areas"
- "part" / "parts"

When these appear as the subject of a sentence, the writer has not decided what
they are actually talking about. Replace with the specific noun.

Bad:
> One important aspect to note is that the carry flag is set.

Better:
> The carry flag is set.

### 14. Weak main verbs

When "make", "get", "have", "use", "do" is the main verb of a sentence, the
sentence usually has no real precision. Find the specific verb.

Bad:
> `LD` does the job of copying a value from source to destination.

Better:
> `LD` copies a value from source to destination.

"Does the job of copying" is three words doing the work of one. The specific
verb is "copies". Use it.

### 15. Sentence rhythm: S-V-O monotony

A sequence of short sentences all following Subject-Verb-Object locks the prose
into a flat, mechanical beat. Vary sentence length and opening: start one with
a clause, end one with the key point, let one sentence carry two related things
where they belong together. Monotony is its own signal — if you read a
paragraph aloud and it sounds like a robot listing facts, the structure needs
changing even if every fact is correct.

This rule is about rhythm, not length. Some short sentences are good. Several in
a row with the same structure are not.

### 16. Forbidden words (hard blacklist)

These should not appear in course prose under any circumstances:

- `delve` / `dive into`
- `testament`
- `vibrant`
- `comprehensive`
- `robust` (unless comparing memory architectures)
- `elegant` / `powerful` / `sophisticated` — let the code prove it
- `leverage` (use "use")
- `streamline`
- `in conclusion`
- `looking ahead`
- `navigate` (as a metaphor)
- `embark`

These words are AI reflex choices. Their presence is a reliable sign that
the sentence is filling space rather than teaching something.

## Two-level reading

Every section should work on two levels simultaneously.

The **information level** carries facts: what the instruction does, what the
register holds, what the flag means. This is the minimum. A section that only
delivers facts is a reference manual, not a course.

The **intent level** carries the reason it matters: why you reach for this
instruction over that one, what goes wrong when you miss it, where this pattern
saves time or prevents a bug. A reader should be able to say not just "what did
I learn" but "why did that matter."

Both levels must be present. A section that only delivers facts is too thin.
A section that only explains why without grounding in concrete mechanics is
too vague.

When a section feels weak, ask: does it have both? If the facts are there but
the intent is missing, add a sentence that connects the mechanics to the
consequence. If the intent is there but the facts are thin, add an example.

## Positive writing model

Prefer this pattern:

1. name the thing
2. state what it does
3. show where it appears
4. explain why it matters now
5. move on

Example shape:

- "A `while NZ` loop checks the current Z flag before entering the body."
- "That means entry flags matter."
- "In this example, `ld a, 1 / or a` establishes NZ before the loop."
- "Without that setup, the body may not execute."

That is enough. Do not surround it with atmospheric prose.

## Worked example: bad paragraph to acceptable paragraph

Bad version:

> ZAX is not a macro assembler in the traditional sense, nor is it a modern
> systems language with hidden machinery. It sits in an honest middle ground
> where the machine remains visible while the language offers more structure.

Why this fails:

- it defines ZAX by negation
- it assumes the reader already understands the contrasted categories
- words like "honest" and "structure" are not explained
- the reader learns no rule they can apply when reading code

Acceptable rewrite:

> ZAX lets you write raw Z80 instructions directly, but it also gives names to
> storage, structured control flow, and compiler-checked function frames. In
> practice that means you can still write `ld a, (hl)` when you need a raw load,
> but you can also write `count := hl` when you want to store a word into a
> named local. This volume studies larger programs built from that combination.

Why this passes:

- it defines ZAX positively
- it names the concrete features that matter
- it gives a code-level contrast the reader can recognize
- it tells the reader what this volume will do next

## Section-level standard

Every section should answer:

- what concept is being introduced here?
- why is it being introduced now?
- what example carries it?
- what should the reader be able to do or recognise after reading it?

If a section cannot answer those, it should be restructured.

## Chapter introduction standard

A chapter introduction must do only these jobs:

- orient the reader
- state prerequisites
- state what the chapter covers
- say how this chapter differs from the previous one

It must not:

- justify the whole language again
- wander into philosophy
- explain historical lineage unless directly useful
- define the subject by saying what it is not

## Example usage standard

Examples are not decorative.

Every code excerpt must justify itself by doing one of these:

- introducing the concept
- illustrating the rule
- showing a subtlety
- showing a useful contrast

If a code excerpt does not do one of those, remove it.

Do not paste code just to prove that a file exists.

## Editing standard

Editing is not line smoothing. Editing is concept sharpening.

The editor should actively:

- remove paragraphs that teach nothing
- split paragraphs that try to do too much
- replace abstract claims with code-grounded claims
- tighten transitions so each section earns the next one
- remove terminology that the reader has not been prepared to understand

An edit is successful when the prose becomes easier to learn from, not when it
sounds more literary.

## Review checklist for the writer

Before handing off a chapter, the writer should check:

### Reader alignment

- Is the assumed reader explicit?
- Did I assume knowledge the reader does not yet have?
- Did I accidentally write for a more advanced reader?

### Paragraph purpose

- Can I state the job of every paragraph?
- Is any paragraph only atmosphere or positioning?
- Does each paragraph advance understanding?

### Technical grounding

- Does every abstract claim cash out in a concrete consequence?
- Do all code claims match the actual source on `main`?
- Did I name the real file being discussed?

### Repetition control

- Am I re-explaining a concept instead of referring back to it?
- Is the repetition necessary because the context changed?
- If not, cut it.

### Language quality

- Are there empty rhetorical words?
- Are there sentences that merely sound good?
- Are there sentences that would confuse a beginner because they assume hidden background?

### Pacing and compression

- For each section: is there a sentence that explains the problem before the
  mechanism is introduced?
- Does each new concept get its own sentence, or am I stacking them?
- Would the intended reader understand each paragraph on first reading?
- Are there more than two unfamiliar terms in any single paragraph?
- Would a motivated beginner finish this section feeling capable, or overwhelmed?

## Review checklist for the editor/reviewer

The reviewer should explicitly look for:

### 1. Reader drift

- Has the prose silently switched to writing for experts?
- Has it silently switched to writing for total novices?
- Does the chapter still match the intended reader level?

### 2. Empty paragraphs

- Which paragraphs can be removed with no loss of understanding?
- Which paragraphs make broad claims without proof?

### 3. False contrast

- Is the prose teaching by negation instead of explanation?
- Is it comparing against concepts the reader does not know?

### 4. Unsupported claims

- Does the prose say the language/compiler/example does something it does not?
- Does it generalize from one example without support?

### 5. Educational usefulness

- After each section, what does the reader now know?
- If the answer is unclear, the section is weak.

### 6. Pacing and readability

These checks catch prose that has been cleaned of jargon but is still too
compressed to teach well. A chapter can pass all the voice checks and still
feel like edited notes rather than instruction.

**Compression check**: Is any section trying to introduce too many new ideas
at once? If a paragraph contains more than one or two unfamiliar mechanisms,
it is probably compressed past readability.

**Background check**: Does the reader know why this matters before the mechanics
begin? Find the first sentence in each section that explains mechanism. Is there
a sentence before it that explains the problem? If not, add one.

**First-read check**: Read each paragraph as the intended reader would, once.
Would they likely understand it without rereading? If the answer is no — even
if every sentence is accurate — the paragraph needs to slow down.

**Teacher-presence check**: Does the prose sound like a teacher helping someone
through material, or like accurate notes someone cleaned up? If it feels
impersonal, look for places to acknowledge what is hard, offer a second angle,
or simply say what to expect before saying what to do.

**Term-density check**: Count the unfamiliar technical terms in each paragraph.
More than two in a single paragraph is usually too many. Delay some or define
them before use.

### 7. Voice and tone

This is the most commonly missed failure mode. Check each of the following
explicitly — do not assume good prose style passes automatically.

**Pronouns**: Search the text for "the programmer", "the reader", "one". Every
occurrence should be "you" unless there is a specific reason it cannot be.
"The programmer cannot name their variables" is wrong. "You cannot name your
variables" is right.

**Third-person distance**: Sentences like "It is the compiler's job to...",
"The function's purpose is to...", "The reader should note that..." all signal
institutional voice. The test: could this sentence have come from a product
manual? If yes, rewrite it as something a person would say.

**Dead openings**: Flag sentences that begin with "There is", "There are",
"It is", "This is", or "That is" and do no teaching work. Some are fine — but
when a section has several in a row, each one is probably deferring real content.
Ask: what is the sentence actually saying, and can it say it directly?

**AI-specific tic check**: Search the text for these exact strings and challenge
every occurrence:

- `"is not"` / `"are not"` / `"does not"` — is the negative form followed by a
  positive that would work alone? Cut the negative. Then deepen the positive with
  a concrete verb or specific detail rather than just restating it.
- `"simply"` / `"just"` / `"of course"` — these minimise what the reader may
  find hard. Cut them.
- `"It is worth"` / `"Note that"` / `"Notice that"` — replace with the direct
  statement the writer was about to hedge.
- `"This is the standard way"` / `"This is the primary"` / `"This is the most
  common"` — cut the classification; the explanation that follows stands alone.
- `"nothing more"` / `"no more than"` / `"no less than"` — redundant intensifiers
  that follow a sentence that already closed its claim.
- `"as we will see later"` / `"you will see why"` / `"this will become clear"` —
  either earn the payoff now or cut the deferral.
- `"That is how X works."` / `"That is simply the way."` — hollow landings that
  restate what was just shown. Cut and end on the last sentence that taught
  something.
- `"however"` / `"therefore"` / `"moreover"` / `"in addition"` / `"as a result"` /
  `"in other words"` — essay connectors. Replace with a direct statement of the
  same relationship. "However, LD does not affect flags" → "LD does not touch
  flags."
- `"aspect"` / `"element"` / `"area"` / `"part"` / `"thing"` as a subject noun —
  placeholder. Replace with the specific thing.
- `"make"` / `"get"` / `"use"` / `"have"` as the main verb — find the specific verb.
  "does the job of copying" → "copies".
- `"delve"` / `"testament"` / `"vibrant"` / `"comprehensive"` / `"robust"` /
  `"leverage"` / `"elegant"` — hard blacklist. Delete.

**Internal vocabulary**: Search for "idiom", "discipline", "invariant",
"ergonomic", "bookkeeping cost", "naming pressure", "Phase A", "Phase B",
"assembler surface", "justified relief". These should not appear in
reader-facing prose. If they do, the writer is thinking about the course design,
not talking to the reader.

**Narrative forward motion**: Read each section opening. Does it say where this
section is going, and why now? A section that opens with a definition and then
lists facts has no narrative arc. A section that opens with the problem it is
about to solve does.

**The sitting-next-to-someone test**: Read a paragraph aloud as if you were
explaining it to a person sitting next to you. If it sounds strange spoken —
too formal, too distant, too abstract — it needs rewriting. Good course prose
reads naturally aloud.

## Criticism standard

Criticism should be direct and concrete.

Avoid:

- "this feels weak"
- "this could be clearer"
- "this needs polish"

Prefer:

- "This paragraph defines ZAX by saying what it is not; the reader does not know those categories yet, so the paragraph teaches nothing."
- "This section claims the loop always executes once, but the code tests flags before entry."
- "This sentence says the feature is powerful, but does not show what that means."

Good criticism should identify:

1. the exact problem
2. why it hurts the target reader
3. what kind of rewrite is needed

## Severity for review findings

Use this severity split when reviewing course prose:

### Blocker

Use when the prose:

- teaches incorrect language behaviour
- misstates what the example code does
- assumes reader knowledge the volume has not earned
- builds a chapter around the wrong reader model

### Significant improvement

Use when the prose is not false, but still weakens the course by:

- misframing a chapter
- carrying repeated filler
- using poor examples for the concept
- letting summaries or transitions drift from the actual chapter content

### Optional polish

Use when the prose is basically sound, but can still improve through:

- tighter wording
- better transitions
- lighter repetition
- cleaner excerpt selection

## Acceptance gate

A chapter is not ready to merge unless all of the following are true:

- the reader model is explicit and stable
- the prose uses current language surface only
- every named example path exists on `main`
- every substantial claim is grounded in real code or documented language behaviour
- the chapter can be shortened nowhere without losing real teaching value
- the text uses "you" throughout — no "the programmer", "the reader", or "one"
- no internal vocabulary appears in reader-facing prose (see rule #6)
- no dead openings ("There is nothing new here", "It is worth noting") go unchallenged

## Editorial rule of deletion

When in doubt, cut.

Educational prose is improved more often by removing material than by adding
more explanation.

The writer should assume:

- if a sentence does not teach, it is competing with a sentence that could

## Relationship to current ZAX course material

This standard applies to:

- the planned beginner-facing `learning/part1/` volume
- the current `learning/part2/` advanced practical-programming volume

The standard is especially important for introductions, bridges, and chapter
openings, where LLM-generated padding is most likely to appear.
