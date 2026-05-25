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
    if (entry.isFile() && entry.name.endsWith('.asm')) {
      out.push(join(prefix, entry.name).replace(/\\/g, '/'));
    }
  }
  return out.sort();
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
  const location =
    diagnostic.line !== undefined && diagnostic.column !== undefined
      ? `${diagnostic.sourceName ?? entry}:${diagnostic.line}:${diagnostic.column}`
      : (diagnostic.sourceName ?? entry);
  return `${entry}: ${location}: ${diagnostic.message}`;
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

async function main() {
  const { compile, defaultFormatWriters } = await loadCompiler();
  const failures = [];
  let checked = 0;
  let skippedOptional = 0;

  const fixtureRelPaths = await collectFixtureFiles(FIXTURE_ROOT);
  for (const relPath of fixtureRelPaths) {
    const entryPath = join(FIXTURE_ROOT, relPath);
    const outcome = await checkEntry(compile, defaultFormatWriters, entryPath);
    checked += 1;
    if (!outcome.ok) {
      failures.push(outcome.message);
    }
  }

  for (const corpus of OPTIONAL_CORPORA) {
    const configured = process.env[corpus.env]?.trim();
    const entryPath = configured && configured.length > 0 ? configured : corpus.defaultPath;
    if (!existsSync(entryPath)) {
      console.log(`SKIP ${corpus.name}: source not found (${entryPath})`);
      skippedOptional += 1;
      continue;
    }
    const outcome = await checkEntry(compile, defaultFormatWriters, resolve(entryPath));
    checked += 1;
    if (!outcome.ok) {
      failures.push(outcome.message);
    }
  }

  if (failures.length > 0) {
    console.error(`ASM80 lowering coverage failed (${failures.length} file(s)):`);
    for (const message of failures) {
      console.error(`  ${message}`);
    }
    process.exit(1);
  }

  console.log(
    `ASM80 lowering coverage passed for ${checked} file(s)` +
      (skippedOptional > 0 ? ` (${skippedOptional} optional source(s) skipped)` : '') +
      '.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
