# Banned Prose Patterns — Full Reference

All 16 patterns are banned from course prose. Each entry has: the pattern, why it fails, and a before/after example.

---

## 1. Negative-definition padding

**Pattern:** "X is not Y" / "X is not merely Y" / "X is neither Y nor Z"

**Why it fails:** If the reader does not understand Y, the negation teaches nothing. If they do, you are wasting a sentence.

**Tightest form — the inversion pair:** One sentence states the negative; the next states the positive. The positive already contains everything needed. Cut the negative. But stripping the negative is only step one — deepen the positive with a concrete verb or specific detail rather than just restating it cleanly.

Bad:
> A sentinel loop does not count iterations. It tests each element against a known value and stops when it finds a match.

Stripped (better, but flat):
> A sentinel loop tests each element against a known value and stops when it finds a match.

Deepened (best):
> A sentinel loop tests each element against a known value. The data tells it when to stop; there is no count to set in advance.

---

## 2. Empty rhetoric

**Pattern:** Words like "elegant", "powerful", "flexible", "expressive", "robust", "natural", "clean", "honest" without proof in the next sentence.

**Why it fails:** These are not explanations. They tell the reader how to feel about something instead of showing it.

Bad:
> ZAX provides a clean abstraction over raw Z80.

Better:
> ZAX lets you write `ld a, (count)` to read from a named byte, rather than tracking the address `$8000` by hand everywhere it appears.

---

## 3. Philosophy without operational payoff

**Pattern:** Abstract positioning that does not cash out in a rule, an example, a code contrast, or a practical consequence.

**Why it fails:** The reader learns no rule they can apply when reading or writing code.

---

## 4. LLM balancing habits

**Pattern:** Sentence 1 says something. Sentence 2 softens it with vague contrast. Sentence 3 reframes in broad general terms. None of the three teach anything.

Cut this aggressively.

---

## 5. Historical name-dropping without teaching value

**Pattern:** Invoking classic books, famous authors, or historical lineages without helping the reader understand the current code.

The reader needs operational understanding, not literary pedigree.

---

## 6. Internal vocabulary in reader-facing prose

**Pattern:** "assembler surface", "ergonomic cost", "bookkeeping overhead", "teaching payload", "Phase A", "Phase B", "justified relief", "naming pressure".

These are shorthand between writers. If you would not say it to someone sitting next to you learning Z80 for the first time, do not write it.

---

## 7. Hollow landing sentences

**Pattern:** A sentence at the end of a paragraph that restates what was just shown, dressed as a conclusion.

Patterns to cut:
- "That is simply how the hardware works."
- "The CPU does exactly what you write, nothing more."
- "This is just the way Z80 assembly operates."
- "There is no way around this."
- "Nothing happens unless you ask for it."

Cut them. End on the last sentence that taught something.

---

## 8. "This is the standard way to..."

**Pattern:** Classifying an idiom before showing it.

**Why it fails:** The classification adds no information — it tells the reader how to feel about what follows, not what follows. Show the pattern, explain what it does and why.

Bad:
> This is the standard way to test whether A holds zero without a comparison.
> `or a` / `jr z, target`

Better:
> `or a` sets Z if A is zero, without changing A and without needing a comparison value. One byte instead of two.

---

## 9. Performative section openers

**Pattern:** A sentence that announces the importance of what follows rather than delivering it.

- "This is the section that saves you from your first truly baffling bug."
- "This is the key insight."
- "What follows is the most important rule in this chapter."

These are stage directions. Start with the content.

---

## 10. "It is worth..." and "Note that..."

**Pattern:** "It is worth noting that...", "It is worth pausing to consider...", "Note that...", "Notice that...", "It should be mentioned that..."

**Why it fails:** The writer is hedging instead of stating a thing directly. Every one of these can be replaced by just stating the thing.

Bad:
> It is worth pausing to think about what state the CPU is in after a loop.

Better:
> After a loop exits, all three registers the loop touched have changed.

---

## 11. Redundant intensifiers at sentence end

**Pattern:** Phrases appended after a sentence that already made its point:
- "nothing more"
- "no matter what"
- "regardless"
- "in any case"
- "at all times"

Bad:
> The CPU does exactly what you write, nothing more.

Better:
> The CPU does exactly what you write.

"Exactly" already closes the claim. "Nothing more" is the writer making sure you heard it.

---

## 12. Discourse connectors as padding

**Pattern:** "however", "therefore", "moreover", "in addition", "as a result", "in other words", "on the other hand"

**Why it fails:** These are essay connectors. Course teaching is sequential, not argumentative. When these appear, the writer is explaining a relationship they could have shown directly.

Bad:
> The Z flag is set after `cp`. However, `ld` does not affect flags.

Better:
> `cp` sets the Z flag. `ld` does not touch flags at all.

"In other words" means the previous sentence was unclear. Fix the previous sentence instead of adding a restatement.

---

## 13. Placeholder nouns

**Pattern:** Generic nouns used instead of the specific one:
- "thing" / "things" / "stuff"
- "aspect" / "aspects"
- "element" / "elements"
- "area" / "areas"
- "part" / "parts"

When these appear as the subject of a sentence, the writer has not decided what they are actually talking about. Replace with the specific noun.

Bad:
> One important aspect to note is that the carry flag is set.

Better:
> The carry flag is set.

---

## 14. Weak main verbs

**Pattern:** "make", "get", "have", "use", "do" as the main verb of a sentence.

**Why it fails:** These verbs have no precision. Find the specific verb.

Bad:
> `LD` does the job of copying a value from source to destination.

Better:
> `LD` copies a value from source to destination.

"Does the job of copying" is three words doing the work of one.

---

## 15. Sentence rhythm — S-V-O monotony

**Pattern:** Several consecutive short sentences all following Subject-Verb-Object.

**Why it fails:** Locks the prose into a flat mechanical beat that sounds like a robot listing facts. Vary sentence length and opening: start one with a clause, end one with the key point, let one sentence carry two related things where they belong together.

This rule is about rhythm, not length. Some short sentences are good. Several in a row with the same structure are not.

---

## 16. Hard blacklist words

These must not appear in course prose:

| Word/phrase | Why |
|-------------|-----|
| `delve` / `dive into` | AI reflex |
| `testament` | AI reflex |
| `vibrant` | AI reflex |
| `comprehensive` | AI reflex |
| `robust` | AI reflex (unless genuinely comparing hardware robustness) |
| `elegant` / `powerful` / `sophisticated` | Let the code prove it |
| `leverage` | Use "use" |
| `streamline` | AI reflex |
| `in conclusion` | AI reflex |
| `looking ahead` | AI reflex |
| `navigate` (as metaphor) | AI reflex |
| `embark` | AI reflex |
| `empower` | AI reflex |
| `seamless` | AI reflex |
| `bespoke` | AI reflex |
| `underscore` (verb) | AI reflex — use "shows", "means", "confirms" |
| `bolster` / `foster` / `harness` | AI management-prose |
| `unpack` (figurative) | AI reflex — just explain it |
| `pivotal` | Empty emphasis — say why it matters instead |
| `intricate` | Tells the reader to feel impressed; show the complexity instead |
| `nuanced` (as empty praise) | AI hedge-word — say what the nuance actually is |
| `multifaceted` / `holistic` | AI abstraction padding |
| `landscape` (figurative) | AI reflex — name the actual thing |
| `realm` | AI reflex |

---

## 17. False uplift structures

**Pattern:** "It's not just X — it's Y." / "Not only X, but Y." / "No X. No Y. Just Z."

**Why it fails:** These structures mimic the shape of insight without containing any. They amplify a claim by staging it as a surprising upgrade, but the upgrade is always empty. The reader gets a rhetorical flourish instead of information.

This is distinct from Rule 1's simple negation pair. Rule 1 is "X is not Y; it is Z" — a definitional negation. False uplift is "X is not *just* Y — it is something *more*." The "more" never materialises.

Bad:
> LD is not just a copy instruction — it is the foundation on which all Z80 data movement is built.

Better:
> LD copies a value from a source to a destination. It accounts for more instructions in a typical Z80 program than any other opcode.

Other forms to catch:
- "Not only does X do this, it also does Y" — split into two direct sentences
- "No complexity. No ceremony. Just results." — dramatic minimalism that says nothing

---

## 18. "Bold term: explanation" list format

**Pattern:** A list where every item follows the format `**Term**: One sentence explanation.`

**Why it fails:** This is the single most recognisable AI formatting pattern. Applied uniformly, it turns a list into something that feels machine-extruded — every item the same rhythm, the same structure, the same weight. Real prose differentiates. Some things earn a sentence; some earn a clause; some earn nothing because they are already obvious from context.

Bad:
> - **Immediate load**: Loads a constant directly into a register.
> - **Register copy**: Copies one register's value into another.
> - **Indirect access**: Reads or writes the byte at the address held in HL.

Better:
> Three forms appear immediately. An immediate load encodes the constant directly in the instruction bytes — `ld a, 5` puts 5 in A without touching memory. A register copy (`ld b, a`) moves a value between two registers in one cycle. Indirect access (`ld a, (hl)`) goes to memory at the address HL holds.

The prose version is longer, but it connects the forms to each other and gives the reader something to follow. The bold-term list is scannable reference material; use it only in reference tables, not in explanatory prose.

---

## 19. Em dash overuse

**Pattern:** More than one em dash per paragraph, or em dashes used where a comma, colon, or full stop would serve.

**Why it fails:** AI prose uses em dashes at roughly three times the rate of human writing, often in places where no emphasis or interruption is intended. The result is a page that looks artificially animated — every paragraph punching at something.

Rule: one em dash per paragraph, maximum. If you find yourself writing a second em dash in the same paragraph, replace it with a comma, rewrite the sentence with a colon, or break it into two sentences.

Bad:
> `LD` copies a value — the source stays unchanged — and the flags are unaffected — making it a pure data transfer.

Better:
> `LD` copies a value from source to destination. The source is unchanged, and the flags are not touched.

---

## 20. Stock filler phrases

**Pattern:** Phrases that exist to sound authoritative or transitional but carry no information.

Cut these on sight:

| Phrase | Replace with |
|--------|-------------|
| "At its core, X is..." | "X is..." |
| "When it comes to X..." | Name X directly |
| "Plays a crucial role in..." | Say what it does specifically |
| "It cannot be overstated that..." | State the thing |
| "At the end of the day..." | Cut |
| "In today's world..." / "In the modern era..." | Cut — start with the actual topic |
| "This is where X comes in." | Cut — just introduce X |
| "Let's take a closer look at..." | Cut — just look |
| "Marking a significant shift in..." | Say what changed and why it matters |

Bad:
> When it comes to memory addressing, the Z80 plays a crucial role in how data is accessed.

Better:
> The Z80 addresses memory through a 16-bit bus, giving it access to 65,536 bytes at addresses $0000–$FFFF.

---

## AI-Specific Tic Checklist (grep these)

After drafting, search for each of the following and challenge every occurrence:

**Negation patterns:**
- `"is not"` / `"are not"` / `"does not"` — is the negative followed by a positive that works alone? Cut the negative. Then deepen the positive with a concrete verb.

**Minimisers:**
- `"simply"` / `"just"` / `"of course"` — these minimise what the reader may find hard. Cut them.

**Hedges:**
- `"It is worth"` / `"Note that"` / `"Notice that"` — replace with the direct statement.

**Classifications:**
- `"This is the standard way"` / `"This is the primary"` / `"This is the most common"` — cut; the explanation stands alone.

**Intensifiers:**
- `"nothing more"` / `"no more than"` / `"no less than"` — redundant after a sentence that already closed its claim.

**Deferrals:**
- `"as we will see later"` / `"you will see why"` / `"this will become clear"` — earn the payoff now or cut.

**Hollow landings:**
- `"That is how X works."` / `"That is simply the way."` — cut and end on the last sentence that taught something.

**Discourse connectors:**
- `"however"` / `"therefore"` / `"moreover"` / `"in addition"` / `"as a result"` / `"in other words"` — replace with a direct statement of the same relationship.

**Placeholder nouns (as sentence subject):**
- `"aspect"` / `"element"` / `"area"` / `"part"` / `"thing"` — replace with the specific noun.

**Weak main verbs:**
- `"make"` / `"get"` / `"use"` / `"have"` as dominant verb — find the specific verb.

**Hard blacklist:**
- `"delve"` / `"testament"` / `"vibrant"` / `"comprehensive"` / `"robust"` / `"leverage"` / `"elegant"` — delete.
- `"underscore"` / `"bolster"` / `"foster"` / `"harness"` / `"unpack"` / `"pivotal"` / `"intricate"` / `"nuanced"` / `"multifaceted"` / `"holistic"` / `"landscape"` / `"realm"` — delete.

**False uplift:**
- `"not just X"` / `"not merely X"` / `"not only X"` — followed by a supposedly deeper Y. Cut; make two direct statements instead.
- `"No X. No Y. Just Z."` — dramatic minimalism with no content. Cut.

**"Bold term: explanation" lists:**
- Uniform `**Term**: Sentence.` lists in explanatory prose — convert to flowing sentences that connect the ideas.

**Em dash count:**
- More than one `—` per paragraph — replace the extras with commas, colons, or full stops.

**Stock filler phrases:**
- `"At its core"` / `"When it comes to"` / `"plays a crucial role"` / `"cannot be overstated"` / `"at the end of the day"` / `"In today's world"` / `"This is where X comes in"` / `"Let's take a closer look"` — cut and state the thing directly.

**Third-person distance:**
- `"the programmer"` / `"the reader"` / `"one"` — replace with "you".

**Dead openers:**
- Paragraphs starting with "There is", "There are", "It is", "This is", "That is" — challenge each one. Ask: what is this sentence actually saying, and can it say it directly?
