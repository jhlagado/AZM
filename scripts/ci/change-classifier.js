#!/usr/bin/env node

import { stdin as input, env } from 'node:process';
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';

const DOCS_ONLY_PATH_PATTERNS = [/^docs\//, /\.md$/i, /^\.github\/ISSUE_TEMPLATE\//];

export function isDocsOnlyPath(path) {
  return DOCS_ONLY_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

export function classifyChangedPaths(paths) {
  const cleaned = paths.map((p) => p.trim()).filter((p) => p.length > 0);
  const docsOnly = cleaned.length > 0 && cleaned.every((p) => isDocsOnlyPath(p));
  return {
    docsOnly,
    runFull: !docsOnly,
    docsPaths: cleaned.filter((p) => isDocsOnlyPath(p)),
    nonDocPaths: cleaned.filter((p) => !isDocsOnlyPath(p)),
  };
}

async function readPathsFromStdin() {
  const rl = createInterface({ input, crlfDelay: Infinity });
  const values = [];
  for await (const line of rl) {
    values.push(line);
  }
  return values;
}

function writeGithubOutputs({ docsOnly, runFull }) {
  const outputFile = env.GITHUB_OUTPUT;
  if (!outputFile) return;
  appendFileSync(outputFile, `docs_only=${docsOnly}\n`, 'utf8');
  appendFileSync(outputFile, `run_full=${runFull}\n`, 'utf8');
}

async function main() {
  const paths = await readPathsFromStdin();
  const result = classifyChangedPaths(paths);
  writeGithubOutputs(result);

  const summary = [
    `changed=${result.docsPaths.length + result.nonDocPaths.length}`,
    `docs_only=${result.docsOnly}`,
    `run_full=${result.runFull}`,
  ].join(' ');
  console.log(`[ci-change-classifier] ${summary}`);
}

const isExecutedAsScript = import.meta.url === `file://${process.argv[1]}`;
if (isExecutedAsScript) {
  await main();
}
