#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REVIEW_TRIGGER = 500;
const SOFT_LIMIT = 750;
const HARD_LIMIT = 1000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '../src');
const DEFAULT_ALLOWLIST_FILE = path.resolve(SCRIPT_DIR, 'source-file-size-allowlist.json');

// Policy:
// - files over the review trigger are always reported for review attention
// - files over the soft limit are elevated warnings
// - files over the hard cap must either be absent or pinned in the allowlist
// - allowlisted files may not grow past their recorded ceiling and must carry a reason

function normalizePathForOutput(filePath) {
  return filePath.split(path.sep).join('/');
}

function parseArgs(argv) {
  const options = {
    enforceHardCap: false,
    rootDir: DEFAULT_ROOT,
    allowlistFile: DEFAULT_ALLOWLIST_FILE,
  };

  for (let i = 0; i < argv.length; i++) {
    i += applyArg(argv, i, options);
  }
  return options;
}

function applyArg(argv, index, options) {
  const arg = argv[index];
  const handler = ARG_HANDLERS.get(arg);
  if (!handler) {
    throw new Error(`Unknown argument: ${arg}`);
  }
  return handler(argv, index, options);
}

const ARG_HANDLERS = new Map([
  ['--enforce-hard-cap', (_argv, _index, options) => {
    options.enforceHardCap = true;
    return 0;
  }],
  ['--root', (argv, index, options) => {
    options.rootDir = resolveRequiredArg(argv, index, '--root');
    return 1;
  }],
  ['--allowlist-file', (argv, index, options) => {
    options.allowlistFile = resolveRequiredArg(argv, index, '--allowlist-file');
    return 1;
  }],
]);

function resolveRequiredArg(argv, index, flag) {
  const next = argv[index + 1];
  if (!next) {
    throw new Error(`${flag} requires a path argument`);
  }
  return path.resolve(process.cwd(), next);
}

async function collectTsFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => collectTsEntry(dirPath, entry)));
  return nested.flat();
}

async function collectTsEntry(dirPath, entry) {
  const childPath = path.join(dirPath, entry.name);
  if (entry.isDirectory()) {
    return collectTsFiles(childPath);
  }
  return entry.isFile() && entry.name.endsWith('.ts') ? [childPath] : [];
}

async function countLines(filePath) {
  const text = await readFile(filePath, 'utf8');
  return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function toRootRelative(filePath, rootDir) {
  const baseDir = path.dirname(rootDir);
  const rel = path.relative(baseDir, filePath);
  return normalizePathForOutput(rel || path.basename(filePath));
}

async function loadAllowlist(allowlistFile) {
  const raw = await readFile(allowlistFile, 'utf8');
  const parsed = JSON.parse(raw);
  const hardCap = validatedHardCapMap(parsed?.hardCap, allowlistFile);
  const out = new Map();
  for (const [key, value] of Object.entries(hardCap)) {
    out.set(normalizePathForOutput(key), parseAllowlistEntry(key, value, allowlistFile));
  }
  return out;
}

function validatedHardCapMap(hardCap, allowlistFile) {
  if (hardCap !== null && typeof hardCap === 'object' && !Array.isArray(hardCap)) {
    return hardCap;
  }
  throw new Error(`Invalid hardCap map in ${allowlistFile}`);
}

function parseAllowlistEntry(key, value, allowlistFile) {
  assertAllowlistEntryObject(key, value, allowlistFile);

  const ceiling = value.ceiling;
  const reason = value.reason;
  assertAllowlistCeiling(key, ceiling, allowlistFile);
  assertAllowlistReason(key, reason, allowlistFile);
  return { ceiling, reason: reason.trim() };
}

function assertAllowlistEntryObject(key, value, allowlistFile) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return;
  }
  throw new Error(
    `Invalid hard-cap entry for ${key} in ${allowlistFile}; expected an object with ceiling and reason`,
  );
}

function assertAllowlistCeiling(key, ceiling, allowlistFile) {
  if (typeof ceiling !== 'number' || !Number.isInteger(ceiling) || ceiling < HARD_LIMIT) {
    throw new Error(`Invalid hard-cap ceiling for ${key} in ${allowlistFile}`);
  }
}

function assertAllowlistReason(key, reason, allowlistFile) {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error(`Invalid hard-cap reason for ${key} in ${allowlistFile}`);
  }
}

async function main() {
  const { enforceHardCap, rootDir, allowlistFile } = parseArgs(process.argv.slice(2));
  const rows = await collectFileSizeRows(rootDir);
  const hardCapAllowlist = await loadAllowlist(allowlistFile);
  const breaches = classifySizeBreaches(rows, hardCapAllowlist);
  printSizeReport(breaches);
  process.exit(enforceHardCap && breaches.hardViolations.length > 0 ? 1 : 0);
}

async function collectFileSizeRows(rootDir) {
  const files = await collectTsFiles(rootDir);
  const rows = [];
  for (const filePath of files) {
    rows.push({ path: toRootRelative(filePath, rootDir), lines: await countLines(filePath) });
  }
  return rows.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
}

function classifySizeBreaches(rows, hardCapAllowlist) {
  const hardBreaches = classifyHardBreaches(rows, hardCapAllowlist);
  return {
    ...hardBreaches,
    reviewBreaches: rows.filter((row) => row.lines > REVIEW_TRIGGER && row.lines <= SOFT_LIMIT),
    softBreaches: rows.filter((row) => row.lines > SOFT_LIMIT && row.lines <= HARD_LIMIT),
  };
}

function classifyHardBreaches(rows, hardCapAllowlist) {
  const allowedHardBreaches = [];
  const hardViolations = [];
  for (const row of rows.filter((candidate) => candidate.lines > HARD_LIMIT)) {
    classifyHardBreach(row, hardCapAllowlist, allowedHardBreaches, hardViolations);
  }
  return { allowedHardBreaches, hardViolations };
}

function classifyHardBreach(row, hardCapAllowlist, allowedHardBreaches, hardViolations) {
  const entry = hardCapAllowlist.get(row.path);
  if (entry === undefined) {
    hardViolations.push({ ...row, kind: 'unallowlisted' });
    return;
  }
  if (row.lines > entry.ceiling) {
    hardViolations.push({ ...row, kind: 'grew', ceiling: entry.ceiling });
    return;
  }
  allowedHardBreaches.push({ ...row, ceiling: entry.ceiling, reason: entry.reason });
}

function printSizeReport(breaches) {
  if (hasNoBreaches(breaches)) {
    console.log(
      `source-file-size-guard: ok (review ${REVIEW_TRIGGER}, soft ${SOFT_LIMIT}, hard ${HARD_LIMIT})`,
    );
    return;
  }
  console.log(
    `source-file-size-guard: review>${REVIEW_TRIGGER}, soft>${SOFT_LIMIT}, hard>${HARD_LIMIT}`,
  );
  printReviewBreaches(breaches.reviewBreaches);
  printAllowedHardBreaches(breaches.allowedHardBreaches);
  printHardViolations(breaches.hardViolations);
  printSoftBreaches(breaches.softBreaches);
}

function hasNoBreaches({ allowedHardBreaches, hardViolations, softBreaches, reviewBreaches }) {
  return (
    allowedHardBreaches.length === 0 &&
    hardViolations.length === 0 &&
    softBreaches.length === 0 &&
    reviewBreaches.length === 0
  );
}

function printReviewBreaches(rows) {
  if (rows.length === 0) {
    return;
  }
  console.log('review-trigger warnings:');
  for (const row of rows) {
    console.log(`- ${row.path}: ${row.lines}`);
  }
}

function printAllowedHardBreaches(rows) {
  if (rows.length === 0) {
    return;
  }
  console.log('hard-cap breaches (allowlisted ceilings):');
  for (const row of rows) {
    const reasonSuffix = row.reason ? `; reason: ${row.reason}` : '';
    console.log(`- ${row.path}: ${row.lines} (ceiling ${row.ceiling}${reasonSuffix})`);
  }
}

function printHardViolations(rows) {
  if (rows.length === 0) {
    return;
  }
  console.log('hard-cap violations:');
  for (const row of rows) {
    if (row.kind === 'unallowlisted') {
      console.log(`- ${row.path}: ${row.lines} (not allowlisted)`);
      continue;
    }
    console.log(`- ${row.path}: ${row.lines} (ceiling ${row.ceiling})`);
  }
}

function printSoftBreaches(rows) {
  if (rows.length === 0) {
    return;
  }
  console.log('soft-limit warnings:');
  for (const row of rows) {
    console.log(`- ${row.path}: ${row.lines}`);
  }
}

await main();
