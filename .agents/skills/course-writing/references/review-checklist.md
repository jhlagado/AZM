# Review Checklist — ZAX Course Prose

Use this checklist when reviewing any chapter or section of the ZAX course. Work through all three passes. Rate each finding as Blocker, Significant, or Polish.

---

## Severity Definitions

**Blocker** — The prose:
- states incorrect language or hardware behaviour
- misstates what the example code does
- assumes reader knowledge the course has not yet earned
- uses a term before introducing it

**Significant** — The prose is not false, but:
- misframes the chapter or section
- teaches by negation against concepts the reader does not know
- carries repeated filler with no teaching value
- uses poor examples for the concept
- has sections that list facts without explaining why they matter

**Polish** — The prose is basically sound but can improve through:
- tighter wording
- better transitions
- lighter repetition
- cleaner excerpt selection

---

## Pass 1 — Technical Accuracy

For each claim about ZAX or Z80 behaviour:

- [ ] Does the claim match actual assembler/CPU behaviour?
- [ ] Does each code excerpt do what the surrounding text says it does?
- [ ] Does the text say an instruction affects flags when it does not, or vice versa?
- [ ] Does the text use any ZAX syntax that is deprecated or incorrect? (e.g., `: void`, section without `at $XXXX`)
- [ ] Does the text describe code that is not actually present in the referenced example file?

For each term:

- [ ] Is every term the reader might not know defined before it is used?
- [ ] Does the text assume knowledge the course has not yet provided? (Check against `reader-model.md` for the current chapter's knowledge state.)

---

## Pass 2 — Structure

For each section opening:

- [ ] Does the section open with the problem before the mechanism? Or does it open with a definition and then list facts?
- [ ] Does the opening say where this section is going and why now?
- [ ] Does it avoid "After reading this you will be able to..." syllabus language?

For each section body:

- [ ] Does the section work on both the information level (what) and the intent level (why it matters)?
- [ ] Is there at least one concrete code example?
- [ ] Does the code example actually illustrate the concept being discussed?
- [ ] Is there a paragraph that introduces two unfamiliar mechanisms at once?
- [ ] Can you state in one sentence what each paragraph is teaching? If not, the paragraph is muddy.

For each section close:

- [ ] Does the section end on the last sentence that taught something?
- [ ] Or does it end with a hollow landing ("That is how it works", "Both are visible in the example file")?

---

## Pass 3 — Prose Quality (AI Tic Check)

Search the text explicitly for each of the following. Do not rely on memory — grep for them.

### Negation patterns
Search: `"is not"` / `"are not"` / `"does not"` / `"cannot"`

For each occurrence: Is the negative form followed immediately by a positive that would work alone? If so:
1. Cut the negative sentence.
2. Deepen the positive with a concrete verb or specific detail — do not just clean up the restatement.

### Minimisers
Search: `"simply"` / `"just"` / `"of course"` / `"obviously"`

These minimise what the reader may find difficult. Cut them. "Simply" in particular almost always precedes something that is not simple to a beginner.

### Hedges
Search: `"It is worth"` / `"Note that"` / `"Notice that"` / `"It should be noted"`

Replace with the direct statement the writer was hedging around.

### Classifications
Search: `"This is the standard way"` / `"This is the primary"` / `"This is the most common"` / `"This is the typical"`

Cut the classification. The explanation that follows stands alone.

### Performative openers
Search: `"This is the section"` / `"This is the key"` / `"This is the most important"`

Replace with the actual content.

### Hollow landings
Search: `"That is how"` / `"That is simply"` / `"This is just how"` / `"nothing more"` / `"no matter what"`

Cut. End on the last sentence that taught something.

### Discourse connectors
Search: `"however"` / `"therefore"` / `"moreover"` / `"in addition"` / `"as a result"` / `"in other words"` / `"on the other hand"`

For each occurrence: can the relationship be shown directly instead? Almost always yes.

### Deferrals
Search: `"as we will see"` / `"you will see why"` / `"this will become clear"` / `"more on this later"`

Either earn the payoff now or cut the deferral entirely.

### Third-person distance
Search: `"the programmer"` / `"the reader"` / `"the user"` / `"\bone\b"` (the pronoun)

Replace with "you".

### Dead openers
Flag paragraphs that start with: `"There is"` / `"There are"` / `"It is"` / `"This is"` / `"That is"`

Ask of each: what is this sentence actually saying? Can it say it directly without the opener?

### Placeholder nouns as sentence subjects
Search: `"aspect"` / `"element"` / `"area"` / `"part"` / `"\bthing\b"` / `"\bthings\b"`

Replace with the specific noun.

### Weak main verbs
Search paragraphs where `"make"` / `"get"` / `"have"` / `"use"` is the dominant verb.

Find the specific verb. "Makes it work" → what verb describes the actual action?

### Hard blacklist
Search for each: `"delve"` / `"testament"` / `"vibrant"` / `"comprehensive"` / `"robust"` / `"leverage"` / `"elegant"` / `"powerful"` (as description of ZAX) / `"sophisticated"` / `"streamline"` / `"seamless"` / `"empower"` / `"embark"` / `"bespoke"`

Delete any occurrence. No exceptions.

---

## Final Gate

A chapter is ready to merge only when all of the following are true:

- [ ] Every technical claim is correct
- [ ] Every term is introduced before use
- [ ] Every section opens with the problem before the mechanism
- [ ] Every section works on both the information and intent levels
- [ ] All AI tic checks pass (no occurrences or all challenged and resolved)
- [ ] The text uses "you" throughout — no "the programmer", "the reader", "one"
- [ ] No hard blacklist words appear
- [ ] No dead openers go unchallenged
- [ ] Every code excerpt has a reason to exist (introduces, illustrates, contrasts, or shows a subtlety)
- [ ] The chapter can be shortened nowhere without losing real teaching value
