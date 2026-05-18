# AZM alpha foundation increment

Status: proposed next large increment
Date: 2026-05-18

## Goal

Move AZM from a ZAX-derived assembler-compatible codebase toward a coherent
alpha-quality ASM80-family assembler for the 2020s.

This increment is deliberately larger than a single feature. It should establish
the foundation for an AZM alpha by making the codebase, public surface, and
compatibility policy line up with the project direction:

- `.asm` and `.z80` are first-class AZM source inputs.
- AZM is a stricter, more rigorous ASM80-family assembler.
- The default accepted surface is the idiomatic ASM80 subset already proven by
  MON3, TEC-1G, Tetro, and related corpora.
- Non-baseline source spellings are handled by project directive aliases, not by
  expanding the parser into a dialect aggregator.
- Register-care contracts remain the primary modern safety feature.
- Old ZAX high-level features are audited and either retained deliberately,
  constrained, renamed, or retired.

## Non-goals

This increment should not implement:

- ASM80 text macros.
- ASM80 segments such as `.cseg`, `.dseg`, `.eseg`, `.bsseg`, or
  `.pragma segment`.
- New high-level structured control syntax.
- A general source-to-source macro preprocessor.
- A Debug80 integration switch-over.
- NPM alpha release packaging.

Those are later decisions. This increment prepares the codebase so those
decisions can be made cleanly.

## Workstream 1: language and compatibility policy

Update the docs so they consistently describe AZM as a strict ASM80-family
assembler, not as a dotted-only dialect and not as a full ASM80 clone.

Concrete tasks:

1. Update `docs/design/azm-language-direction.md`.
2. Update `docs/design/asm80-compatibility-baseline.md`.
3. Update `docs/spec/azm-assembly-baseline.md`.
4. Add a short deferred note for ASM80 segment directives.
5. Make the source-extension policy explicit:
   - `.asm` and `.z80` are normal AZM inputs.
   - `.azm` may be introduced later for AZM-extended source, but it is not the
     alpha blocker.
6. Document that opcodes and registers are case-insensitive, while labels should
   move toward case-sensitive identity.

Acceptance:

- Docs use AZM naming and policy consistently.
- No document recommends broad parser-native dialect support.
- Segments are recorded as future work, not forgotten.

## Workstream 2: public naming cleanup

Audit user-visible ZAX names that should become AZM names before alpha.

Concrete tasks:

1. Inventory CLI help, package exports, diagnostics, docs, examples, and tests
   that still say ZAX.
2. Classify each occurrence:
   - keep temporarily for package compatibility
   - rename now
   - rename at package split
   - archive-only historical reference
3. Rename low-risk public strings where behavior is already AZM-specific.
4. Decide whether diagnostic IDs remain `ZAX###` for now or move to `AZM###`.
5. Decide the package binary name and package export names for alpha.

Acceptance:

- A checked-in inventory exists.
- Renames that are safe before package split are complete.
- Remaining ZAX names have explicit rationale.

## Workstream 3: ZAX high-level feature retirement audit

Create a subsystem-level map of old ZAX features and decide what survives in
AZM.

Concrete tasks:

1. Audit frontend declarations:
   - `func`
   - `op`
   - `data`
   - `globals`
   - `var`
   - `type`
   - `union`
   - `enum`
   - `section`
   - `extern`
2. Audit lowering subsystems tied to high-level behavior:
   - function frames
   - typed calls
   - typed assignment
   - typed storage layout
   - structured control lowering
   - op expansion
3. Classify each subsystem:
   - keep
   - keep but constrain
   - rename
   - archive/remove
   - undecided
4. Identify tests that protect old ZAX behavior only and should move to an
   archive or preserved ZAX release branch.

Likely starting classification:

- Keep: classic ASM80 parser, Z80 encoder, expression evaluator, includes,
  output writers, register-care analyzer, AZMDoc, directive alias policy.
- Keep but constrain: `op` expansion.
- Undecided: `extern`, `section`, typed storage layout.
- Candidate retire/archive: `func` frames, typed calls, typed assignment,
  records/unions as language features, old structured control lowering.

Acceptance:

- A checked-in audit document exists.
- No large deletion happens before the audit is reviewed.
- The next deletion/refactor PR has a clear target list.

## Workstream 4: ops survival plan

Verify the existing op system still works and define the AZM-safe subset.

Concrete tasks:

1. Identify the current op parser, matcher, substitution, and expansion tests.
2. Add or update an AZM-focused op smoke test using plain assembly inputs.
3. Document what an AZM op is allowed to do in the alpha:
   - parse AST operands
   - match operand shapes
   - expand to ordinary assembly
   - avoid text substitution
4. Document what remains out of scope:
   - arbitrary macro variables
   - generated symbol tricks
   - text concatenation
   - hidden control-flow magic
5. Decide whether op declarations remain in `.zax`-style syntax temporarily or
   get an AZM-native spelling later.

Acceptance:

- Existing op capability is covered by focused tests.
- The AZM-safe op subset is documented.
- No text macro behavior is introduced.

## Workstream 5: alpha guardrail suite

Define and automate the tests that must pass before considering an alpha.

Concrete tasks:

1. Keep focused alias, include, directive, expression, and encoder tests.
2. Keep register-care focused tests.
3. Keep ASM80 corpus gates:
   - MON3 when `MON3_SOURCE` is available
   - TEC-1G non-macro corpus when available
   - Tetro/Pacmo read-only checks where appropriate
4. Add a single `npm run test:azm:alpha` command that runs all non-local-corpus
   alpha gates.
5. Document optional local corpus environment variables.

Acceptance:

- A contributor can run the alpha guardrail command without private local
  source trees.
- Local corpus gates remain available but are not required in environments that
  do not have the corpora checked out.

## Workstream 6: release-readiness inventory

Prepare for, but do not yet publish, the npm alpha.

Concrete tasks:

1. Audit package name, binary name, exports, and README.
2. Decide whether alpha ships as a renamed package or from the current package
   with AZM branding.
3. Confirm Node version and TypeScript build targets.
4. Identify public API surfaces Debug80 will need:
   - compile source
   - get diagnostics with file/line/column
   - emit bytes
   - emit listing/debug map
   - run register-care audit
5. Record the gap between current API and Debug80 replacement needs.

Acceptance:

- A release-readiness checklist exists.
- Debug80 integration requirements are written down.
- No npm publication happens from this increment.

## Suggested execution order

1. Policy docs and segment deferral note.
2. Public naming inventory.
3. ZAX feature retirement audit.
4. Ops survival smoke tests and docs.
5. Alpha guardrail command.
6. Release-readiness inventory.

This order avoids deleting code before the project has a reviewed map of what
the inherited ZAX code is doing.

## Verification target

At the end of the increment:

```sh
npm run build
npm run lint -- --quiet
npm run test:azm:alpha
```

Optional local corpus gates:

```sh
npm run test:asm80:baseline
npm run test:asm80:tetro
```

