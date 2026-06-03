#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), '..', '..');
const FIXTURE_ROOT = resolve(repoRoot, 'test/fixtures');

const OPTIONAL_CORPORA = [
  {
    name: 'MON3',
    env: 'MON3_SOURCE',
    defaultPath: '/Users/johnhardy/projects/MON3/src/mon3.z80',
  },
  {
    name: 'Tetro',
    env: 'TETRO_SOURCE',
    defaultPath: '/Users/johnhardy/projects/tetro/src/tetro/tetro.z80',
  },
  {
    name: 'Pacmo',
    env: 'PACMO_SOURCE',
    defaultPath: '/Users/johnhardy/projects/tetro/src/pacmo/pacmo.z80',
  },
];

async function collectFixtureFiles(root, prefix = '') {
  const entries = await readdir(root, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const next = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectFixtureFiles(next, join(prefix, entry.name))));
      continue;
    }
    if (isAsmFixtureFile(entry)) {
      out.push(join(prefix, entry.name).replace(/\\/g, '/'));
    }
  }
  return out.sort();
}

function isAsmFixtureFile(entry) {
  return entry.isFile() && entry.name.endsWith('.asm');
}

async function loadCompiler() {
  const compilePath = resolve(repoRoot, 'dist', 'src', 'api-compile.js');
  const formatsPath = resolve(repoRoot, 'dist', 'src', 'outputs', 'index.js');
  if (!existsSync(compilePath) || !existsSync(formatsPath)) {
    throw new Error('Built compiler not found. Run `npm run build` before this script.');
  }

  const [{ compile }, { defaultFormatWriters }] = await Promise.all([
    import(pathToFileURL(compilePath).href),
    import(pathToFileURL(formatsPath).href),
  ]);
  return { compile, defaultFormatWriters };
}

function formatAsm80Failure(entry, diagnostic) {
  const location = diagnosticLocation(entry, diagnostic);
  return `${entry}: ${location}: ${diagnostic.message}`;
}

function diagnosticLocation(entry, diagnostic) {
  const sourceName = diagnostic.sourceName ?? entry;
  if (diagnostic.line === undefined || diagnostic.column === undefined) {
    return sourceName;
  }
  return `${sourceName}:${diagnostic.line}:${diagnostic.column}`;
}

async function checkEntry(compile, defaultFormatWriters, entryPath) {
  const result = await compile(
    entryPath,
    {
      emitBin: false,
      emitHex: false,
      emitD8m: false,
      emitAsm80: true,
    },
    { formats: defaultFormatWriters },
  );

  const asm80Errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error' && diagnostic.code === 'AZMN_ASM80',
  );
  if (asm80Errors.length === 0) {
    return { ok: true };
  }

  return { ok: false, message: formatAsm80Failure(entryPath, asm80Errors[0]) };
}

async function checkFixtureEntries(compile, defaultFormatWriters) {
  const failures = [];
  const fixtureRelPaths = await collectFixtureFiles(FIXTURE_ROOT);
  for (const relPath of fixtureRelPaths) {
    const entryPath = join(FIXTURE_ROOT, relPath);
    const outcome = await checkEntry(compile, defaultFormatWriters, entryPath);
    if (!outcome.ok) {
      failures.push(outcome.message);
    }
  }
  return { checked: fixtureRelPaths.length, failures };
}

function optionalCorpusEntryPath(corpus) {
  const configured = process.env[corpus.env]?.trim();
  return configured && configured.length > 0 ? configured : corpus.defaultPath;
}

async function checkOptionalCorpus(compile, defaultFormatWriters, corpus) {
  const entryPath = optionalCorpusEntryPath(corpus);
  if (!existsSync(entryPath)) {
    console.log(`SKIP ${corpus.name}: source not found (${entryPath})`);
    return { checked: 0, skipped: 1, failures: [] };
  }

  const outcome = await checkEntry(compile, defaultFormatWriters, resolve(entryPath));
  return {
    checked: 1,
    skipped: 0,
    failures: outcome.ok ? [] : [outcome.message],
  };
}

async function checkOptionalCorpora(compile, defaultFormatWriters) {
  const totals = { checked: 0, skipped: 0, failures: [] };
  for (const corpus of OPTIONAL_CORPORA) {
    const outcome = await checkOptionalCorpus(compile, defaultFormatWriters, corpus);
    totals.checked += outcome.checked;
    totals.skipped += outcome.skipped;
    totals.failures.push(...outcome.failures);
  }
  return totals;
}

function reportFailures(failures) {
  console.error(`ASM80 lowering coverage failed (${failures.length} file(s)):`);
  for (const message of failures) {
    console.error(`  ${message}`);
  }
}

function reportSuccess(checked, skippedOptional) {
  console.log(
    `ASM80 lowering coverage passed for ${checked} file(s)` +
      (skippedOptional > 0 ? ` (${skippedOptional} optional source(s) skipped)` : '') +
      '.',
  );
}

async function main() {
  const { compile, defaultFormatWriters } = await loadCompiler();
  const fixtures = await checkFixtureEntries(compile, defaultFormatWriters);
  const optional = await checkOptionalCorpora(compile, defaultFormatWriters);
  const checked = fixtures.checked + optional.checked;
  const failures = [...fixtures.failures, ...optional.failures];

  if (failures.length > 0) {
    reportFailures(failures);
    process.exit(1);
  }

  reportSuccess(checked, optional.skipped);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
