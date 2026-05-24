# AZM Scripts

Helper scripts for the promoted AZM implementation.

Current release gates:

```sh
npm run next:guardrails
npm run test:ci:asm80-parity
npm run test:package
```

`test:ci:asm80-parity` builds the package, checks ASM80 lowering coverage, verifies
lowered output behavior, round-trips through the external `asm80` CLI, and runs
opt-in real-program ASM80 acceptance tests when MON3/Tetro/Pacmo sources are present.
