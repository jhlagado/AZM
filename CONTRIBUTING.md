# Contributing to ZAX

Short workflow. Prefer this over ad-hoc branch names and long cherry-pick recipes.

## Before you start

```sh
git fetch origin && git checkout main && git pull --ff-only
```

## Branch and PR

- **One topic → one branch from `main`.** Name it clearly (`fix/diagnostic-assertions`, `test/layout-edge-cases`). No required `deva/` / `devb/` prefixes.
- **One PR per topic** (or one clearly scoped series). Avoid landing commits on the wrong branch; if you did: `git stash -u`, recreate the branch from `main`, then `cherry-pick` the good commit or re-apply the stash once.

## Issues

- **`Fixes #NNNN`** in the PR body when that PR **fully** closes the issue.
- **`Part of #NNNN`** for incremental work; close the issue when the **last** PR merges.

## Checks before push

```sh
npm run typecheck
npm run lint
npx vitest run
```

If **`npm run check:fixture-coverage`** fails, regenerate the map in the **same** PR:

```sh
node scripts/dev/fixture-coverage.js > test/fixtures/coverage-map.md
```

## Reviews

- Focus on **code and tests** in the diff. CI is the merge gate; don’t block on duplicate CI narration in chat unless something is red.
