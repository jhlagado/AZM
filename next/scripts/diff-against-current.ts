#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';

import { compareRunResults } from '../test/differential/compare-results.js';
import { runCurrentAzmFixture } from '../test/differential/current-azm-runner.js';
import { runNextAzmFixture, runNextAzmSource } from '../test/differential/next-azm-runner.js';
import { KNOWN_UNSUPPORTED_FIXTURE_FILES } from '../test/differential/unsupported-fixtures.js';

const DEFAULT_FIXTURES_DIR = 'next/test/differential/fixtures';
type ArgState = {
  fixturesDir: string;
  explicitFiles: string[];
  includeFilters: Set<string>;
  skipUnsupported: boolean;
  showHelp: boolean;
  reportPath: string | undefined;
};

type DifferenceReport = {
  field: string;
  expected: string;
  actual: string;
};

type FixtureResult = {
  fixture: string;
  status: 'PASS' | 'FAIL';
  differences: DifferenceReport[];
};

type Report = {
  scriptVersion: string;
  totalChecked: number;
  totalFailed: number;
  skippedFixtures: string[];
  results: FixtureResult[];
};

function parseArgs(argv: string[]): ArgState {
  const state: ArgState = {
    fixturesDir: DEFAULT_FIXTURES_DIR,
    explicitFiles: [],
    includeFilters: new Set(),
    skipUnsupported: false,
    showHelp: false,
    reportPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      state.showHelp = true;
      break;
    }
    if (arg === '--fixtures-dir') {
      index += 1;
      const value = argv[index];
      if (!value || value.startsWith('-')) {
        throw new Error('--fixtures-dir requires a path');
      }
      state.fixturesDir = value;
      continue;
    }
    if (arg === '--include') {
      index += 1;
      const value = argv[index];
      if (!value || value.startsWith('-')) {
        throw new Error('--include requires a fixture file name');
      }
      state.includeFilters.add(path.basename(value).toLowerCase());
      continue;
    }
    if (arg === '--skip-unsupported') {
      state.skipUnsupported = true;
      continue;
    }
    if (arg === '--report') {
      index += 1;
      const value = argv[index];
      if (!value || value.startsWith('-')) {
        throw new Error('--report requires a file path');
      }
      state.reportPath = value;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    }
    state.explicitFiles.push(arg);
  }

  return state;
}

function printUsage(): void {
  console.log(`Usage:
node next/scripts/diff-against-current.mjs [--fixtures-dir <path>] [--include <file> ...] [--skip-unsupported] [<fixture-file> ...] [--report <path>]

Options:
  --fixtures-dir <path>   Directory containing .asm fixtures (default: ${DEFAULT_FIXTURES_DIR})
  --include <file>        Include fixture files explicitly (can repeat)
  --skip-unsupported      Skip known intentionally unsupported fixtures instead of failing
  --report <path>         Write JSON report to path
  -h, --help             Show this message`);
}

let state: ArgState;
try {
  state = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
}

if (state.showHelp) {
  printUsage();
  process.exit(0);
}

const fixtureDir = path.resolve(process.cwd(), state.fixturesDir);

async function main(): Promise<void> {
  const fixtureNames =
    state.explicitFiles.length > 0 ? state.explicitFiles : await readdir(fixtureDir);
  const skippedFixtures = new Set<string>();

  const selected = fixtureNames
    .filter((name) => name.toLowerCase().endsWith('.asm'))
    .filter((name) =>
      state.includeFilters.size === 0
        ? true
        : state.includeFilters.has(path.basename(name).toLowerCase()),
    )
    .filter((name) => {
      if (!KNOWN_UNSUPPORTED_FIXTURE_FILES.has(path.basename(name).toLowerCase())) {
        return true;
      }
      if (!state.skipUnsupported) {
        throw new Error(
          `fixture ${path.basename(name)} is known-unsupported and not included in this script slice. ` +
            'Run with --skip-unsupported to bypass or remove the fixture from scope.',
        );
      }
      skippedFixtures.add(path.basename(name));
      return false;
    });

  if (selected.length === 0) {
    console.error('No fixture files selected for differential sweep.');
    process.exit(1);
  }

  const report: Report = {
    scriptVersion: '1.0.0',
    totalChecked: 0,
    totalFailed: 0,
    skippedFixtures: [...skippedFixtures].sort(),
    results: [],
  };

  let failures = 0;
  const normalizedFixtureDir = path.resolve(fixtureDir);
  const isRootFixtureSuite =
    path.basename(normalizedFixtureDir) === 'fixtures' &&
    path.basename(path.dirname(normalizedFixtureDir)) === 'test';

  for (const file of selected.sort()) {
    const filePath = path.isAbsolute(file) ? file : path.resolve(fixtureDir, file);
    const includeDirs = [path.resolve(fixtureDir, 'includes')];
    const current = await runCurrentAzmFixture(filePath, isRootFixtureSuite ? includeDirs : []);
    const next = isRootFixtureSuite
      ? await runNextAzmFixture(filePath, includeDirs)
      : runNextAzmSource(await readFile(filePath, 'utf8'));
    const differences = compareRunResults(current, next);
    report.totalChecked += 1;

    if (differences.length === 0) {
      console.log(`PASS ${file}`);
      report.results.push({ fixture: file, status: 'PASS', differences: [] });
      continue;
    }

    failures += 1;
    report.totalFailed += 1;
    const asReport = differences.map((diff) => ({
      field: diff.field,
      expected: diff.expected,
      actual: diff.actual,
    }));
    report.results.push({ fixture: file, status: 'FAIL', differences: asReport });

    console.error(`FAIL ${file}`);
    for (const diff of differences) {
      console.error(`  field=${diff.field}`);
      console.error(`    expected: ${diff.expected}`);
      console.error(`    actual:   ${diff.actual}`);
    }
  }

  if (state.reportPath) {
    const resolvedReportPath = path.resolve(process.cwd(), state.reportPath);
    await mkdir(path.dirname(resolvedReportPath), { recursive: true });
    await writeFile(resolvedReportPath, JSON.stringify(report, null, 2), 'utf8');
  }

  if (failures === 0) {
    console.log(`Differential sweep passed for ${selected.length} fixture(s).`);
    return;
  }

  console.error(`Differential sweep failed: ${failures} fixture(s) mismatched.`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
