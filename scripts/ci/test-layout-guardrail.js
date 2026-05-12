import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const TOP_LEVEL_PR_TEST = /^test\/pr\d+_.*\.test\.ts$/;
const baseSha = process.env.TEST_GUARDRAIL_BASE_SHA;
const headSha = process.env.TEST_GUARDRAIL_HEAD_SHA;

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

const input = readFileSync(0, 'utf8').trim();
if (!input) {
  process.stdout.write('test layout guardrail: no changed files\n');
  process.exit(0);
}

const violations = [];
for (const rawLine of input.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  const parts = line.split(/\t+/);
  const status = parts[0] ?? '';
  const kind = status[0];
  let path;
  if (kind === 'A') {
    path = parts[1];
  } else if (kind === 'R' || kind === 'C') {
    path = parts[2];
  } else {
    continue;
  }
  if (!path) continue;
  const normalized = normalizePath(path);
  if (TOP_LEVEL_PR_TEST.test(normalized)) violations.push(normalized);
}

if (violations.length === 0) {
  let countWarning = '';
  if (baseSha && headSha) {
    try {
      const baseList = execSync(`git ls-tree -r --name-only ${baseSha} -- test`, {
        encoding: 'utf8',
      });
      const headList = execSync(`git ls-tree -r --name-only ${headSha} -- test`, {
        encoding: 'utf8',
      });
      const baseCount = baseList
        .split(/\r?\n/)
        .filter((entry) => TOP_LEVEL_PR_TEST.test(normalizePath(entry))).length;
      const headCount = headList
        .split(/\r?\n/)
        .filter((entry) => TOP_LEVEL_PR_TEST.test(normalizePath(entry))).length;
      if (headCount > baseCount) {
        process.stderr.write(
          `test layout guardrail: root PR test count increased (${baseCount} -> ${headCount})\n`,
        );
        process.exit(1);
      }
      countWarning = ` (root count ${baseCount} -> ${headCount})`;
    } catch (err) {
      process.stderr.write(`test layout guardrail: count check skipped (${err})\n`);
    }
  }
  process.stdout.write(`test layout guardrail: no new top-level PR tests${countWarning}\n`);
  process.exit(0);
}

for (const file of violations) {
  process.stderr.write(`New top-level PR test file added: ${file}\n`);
}
process.stderr.write(
  `test layout guardrail: ${violations.length} new top-level PR test file(s) added\n`,
);
process.exit(1);
