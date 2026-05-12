import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Static fixture reference map for tests under test/.
 *
 * Resolution model (see src/moduleLoaderIncludePaths.ts):
 * - include "spec" and import specifiers use the same candidate ordering as the compiler:
 *   dirname(current file) first, then each -I directory in order.
 * - This script assumes includeDirs = [test/fixtures, test/fixtures/includes] (absolute),
 *   matching common CLI tests (-I fixtures, -I fixtures/includes). Custom -I paths in
 *   individual tests are not modeled; those edges may be missing.
 * - Dynamic paths (computed at runtime) are not visible here.
 *
 * "Potentially unreferenced" means: not reachable from any test string reference to
 * test/fixtures/... via transitive include/import edges using the rules above — not a
 * safe deletion list when limits apply.
 *
 * CLI: `--check` compares generated Markdown to test/fixtures/coverage-map.md (exit 1 on drift).
 * Regenerate: `node scripts/dev/fixture-coverage.js > test/fixtures/coverage-map.md`
 */

const repoRoot = process.cwd();
const fixturesRoot = join(repoRoot, 'test', 'fixtures');
const testsRoot = join(repoRoot, 'test');

/** Mirrors compileShared.normalizePath (resolve). */
function normalizePath(p) {
  return resolve(p);
}

const FIXTURE_EXTENSIONS = new Set([
  '.zax',
  '.inc',
  '.bin',
  '.hex',
  '.json',
  '.d8.json',
  '.lst',
  '.asm80',
  '.z80',
]);

const PARSE_EDGES_EXTENSIONS = new Set(['.zax', '.inc']);

function normalizeRelPath(path) {
  return path.split(sep).join('/');
}

function listFiles(root) {
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function isSentinelFile(relFromFixtures) {
  const base = basename(relFromFixtures);
  if (base === '.keep' || base === '.gitkeep') return true;
  return false;
}

function isFixtureFile(relFromFixtures) {
  if (relFromFixtures.endsWith('README.md')) return false;
  if (isSentinelFile(relFromFixtures)) return false;
  for (const ext of FIXTURE_EXTENSIONS) {
    if (relFromFixtures.endsWith(ext)) return true;
  }
  return false;
}

function collectFixturePaths() {
  const files = listFiles(fixturesRoot).map((path) => normalizeRelPath(relative(fixturesRoot, path)));
  return files.filter((path) => isFixtureFile(path));
}

function collectSentinelPaths() {
  const files = listFiles(fixturesRoot).map((path) => normalizeRelPath(relative(fixturesRoot, path)));
  return files.filter((path) => isSentinelFile(path));
}

function collectTestFiles() {
  return listFiles(testsRoot).filter((path) => path.endsWith('.test.ts'));
}

function extractFixtureRefsFromSource(source) {
  const refs = new Set();
  const stringLiterals = [];
  const stringRe = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let match;
  while ((match = stringRe.exec(source)) !== null) {
    const value = match[1] ?? match[2] ?? '';
    stringLiterals.push(value);
    const fixtureIndex = value.indexOf('fixtures/');
    if (fixtureIndex >= 0) {
      const trimmed = value.slice(fixtureIndex + 'fixtures/'.length);
      if (trimmed) refs.add(trimmed);
    }
  }

  for (let i = 0; i < stringLiterals.length; i += 1) {
    if (stringLiterals[i] !== 'fixtures') continue;
    const segments = [];
    for (let j = i + 1; j < stringLiterals.length; j += 1) {
      const seg = stringLiterals[j];
      if (!seg) break;
      segments.push(seg);
      if (seg.includes('.')) break;
    }
    if (segments.length) refs.add(segments.join('/'));
  }

  return refs;
}

function stripLineComment(line) {
  const semi = line.indexOf(';');
  return semi >= 0 ? line.slice(0, semi) : line;
}

/** Same candidate order as resolveIncludeCandidates (moduleLoaderIncludePaths.ts). */
function resolveIncludeCandidates(fromModulePath, spec, includeDirs) {
  const fromDir = dirname(fromModulePath);
  const out = [];
  out.push(normalizePath(resolve(fromDir, spec)));
  for (const inc of includeDirs) {
    out.push(normalizePath(resolve(inc, spec)));
  }
  const seen = new Set();
  return out.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
}

function importCandidatePath(specifier, form) {
  if (form === 'path') return specifier;
  return `${specifier}.zax`;
}

/** Same candidate order as resolveImportCandidates. */
function resolveImportCandidates(fromModulePath, specifier, form, includeDirs) {
  const fromDir = dirname(fromModulePath);
  const candidateRel = importCandidatePath(specifier, form);
  const out = [];
  out.push(normalizePath(resolve(fromDir, candidateRel)));
  for (const inc of includeDirs) {
    out.push(normalizePath(resolve(inc, candidateRel)));
  }
  const seen = new Set();
  return out.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
}

function parseImportTail(tail) {
  const spec = tail.trim();
  if (spec.startsWith('"') && spec.endsWith('"') && spec.length >= 2) {
    return { form: 'path', specifier: spec.slice(1, -1) };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec)) {
    return { form: 'moduleId', specifier: spec };
  }
  return undefined;
}

function relKeyIfFixtureFile(absPath, fixtureSet) {
  const rel = normalizeRelPath(relative(fixturesRoot, absPath));
  if (!rel || rel.startsWith('..')) return undefined;
  if (fixtureSet.has(rel) && isFixtureFile(rel)) return rel;
  return undefined;
}

/**
 * Add edges for every candidate path that exists on disk and is a tracked fixture file.
 * (Union over candidates — avoids false "unreferenced" when resolution is ambiguous.)
 */
function collectEdgesForFile(relFromFixtures, fixtureSet, includeDirsAbs) {
  const ext = relFromFixtures.includes('.') ? relFromFixtures.slice(relFromFixtures.lastIndexOf('.')) : '';
  if (!PARSE_EDGES_EXTENSIONS.has(ext)) return [];

  const absFile = normalizePath(join(fixturesRoot, relFromFixtures));
  if (!existsSync(absFile) || !statSync(absFile).isFile()) return [];

  let text;
  try {
    text = readFileSync(absFile, 'utf8');
  } catch {
    return [];
  }

  const edges = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const raw of lines) {
    const stripped = stripLineComment(raw).trim();
    const incMatch = /^\s*include\s+"([^"]+)"\s*$/.exec(stripped);
    if (incMatch) {
      const spec = incMatch[1];
      const candidates = resolveIncludeCandidates(absFile, spec, includeDirsAbs);
      for (const c of candidates) {
        if (!existsSync(c) || !statSync(c).isFile()) continue;
        const to = relKeyIfFixtureFile(c, fixtureSet);
        if (to && to !== relFromFixtures) edges.push([relFromFixtures, to]);
      }
      continue;
    }

    if (ext !== '.zax') continue;

    const impMatch = /^\s*import\s+(.+)$/.exec(stripped);
    if (!impMatch) continue;
    const parsed = parseImportTail(impMatch[1]);
    if (!parsed) continue;

    const candidates = resolveImportCandidates(absFile, parsed.specifier, parsed.form, includeDirsAbs);
    for (const c of candidates) {
      if (!existsSync(c) || !statSync(c).isFile()) continue;
      const to = relKeyIfFixtureFile(c, fixtureSet);
      if (to && to !== relFromFixtures) edges.push([relFromFixtures, to]);
    }
  }

  return edges;
}

function buildAdjacency(fixturePaths, fixtureSet, includeDirsAbs) {
  const adj = new Map();
  for (const f of fixturePaths) adj.set(f, new Set());

  for (const from of fixturePaths) {
    const edges = collectEdgesForFile(from, fixtureSet, includeDirsAbs);
    for (const [a, b] of edges) {
      adj.get(a)?.add(b);
    }
  }
  return adj;
}

/** DFS cycle edges: back-edge from -> to where `to` is in stack. */
function findCycleEdges(adj) {
  const visited = new Set();
  const stack = new Set();
  const cycleEdges = [];

  function dfs(node) {
    visited.add(node);
    stack.add(node);
    for (const next of adj.get(node) ?? []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (stack.has(next)) {
        cycleEdges.push([node, next]);
      }
    }
    stack.delete(node);
  }

  for (const n of adj.keys()) {
    if (!visited.has(n)) dfs(n);
  }
  return cycleEdges;
}

function reachableFromSeeds(adj, seeds) {
  const out = new Set();
  const q = [...seeds];
  while (q.length) {
    const n = q.pop();
    if (out.has(n)) continue;
    out.add(n);
    for (const next of adj.get(n) ?? []) {
      if (!out.has(next)) q.push(next);
    }
  }
  return out;
}

function buildFixtureMap() {
  const fixturePaths = collectFixturePaths();
  const sentinelPaths = collectSentinelPaths();
  const fixtureSet = new Set(fixturePaths);
  const includeDirsAbs = [fixturesRoot, join(fixturesRoot, 'includes')];

  const adj = buildAdjacency(fixturePaths, fixtureSet, includeDirsAbs);
  const cycleEdges = findCycleEdges(adj);

  const fixtureMap = new Map();
  for (const fixture of fixturePaths) fixtureMap.set(fixture, new Set());

  const directTestRefs = new Set();

  for (const testFile of collectTestFiles()) {
    const source = readFileSync(testFile, 'utf8');
    const refs = extractFixtureRefsFromSource(source);
    const testRel = normalizeRelPath(relative(repoRoot, testFile));
    for (const ref of refs) {
      if (fixtureMap.has(ref)) {
        fixtureMap.get(ref).add(testRel);
        directTestRefs.add(ref);
      }
    }
  }

  const reachable = reachableFromSeeds(adj, directTestRefs);

  return {
    fixtures: fixturePaths,
    sentinelPaths,
    fixtureMap,
    referenced: reachable,
    directTestRefs,
    adj,
    cycleEdges,
    includeDirsAbs,
  };
}

function summarizeMap(fixtureMap) {
  const fixtures = fixtureMap.fixtures;
  const referenced = fixtureMap.referenced;
  const unreferenced = fixtures.filter((fixture) => !referenced.has(fixture));
  const withCounts = fixtures.map((fixture) => ({
    fixture,
    count: fixtureMap.fixtureMap.get(fixture)?.size ?? 0,
  }));

  return { fixtures, referenced, unreferenced, withCounts };
}

function formatMarkdown(summary, fixtureMap) {
  const lines = [];
  lines.push('# Fixture reference map');
  lines.push('');
  lines.push('<!-- Generated by `scripts/dev/fixture-coverage.js` — do not edit by hand. -->');
  lines.push('');
  lines.push(
    '**Not an authoritative deletion list.** Rows reflect a **static** approximation: test string references to `test/fixtures/...` plus transitive `include` / `import` edges resolved like `src/moduleLoaderIncludePaths.ts` with assumed `-I` directories:',
  );
  lines.push('');
  for (const d of fixtureMap.includeDirsAbs) {
    lines.push(`- \`${normalizeRelPath(relative(repoRoot, d))}\``);
  }
  lines.push('');
  lines.push(
    '**Limits:** per-test custom `-I` paths are not modeled; only filesystem-backed candidate paths are linked. String references inside non-literal expressions are not traced.',
  );
  lines.push('');
  if (fixtureMap.cycleEdges.length > 0) {
    lines.push('**Include/import graph cycles detected** (see section below).');
    lines.push('');
  }

  lines.push(`Total fixture files (excludes sentinels): ${summary.fixtures.length}`);
  lines.push(`Sentinel files: ${fixtureMap.sentinelPaths.length}`);
  lines.push(`Reachable from tests (direct refs ∪ fixture closure): ${summary.referenced.size}`);
  lines.push(`Potentially unreferenced fixtures: ${summary.unreferenced.length}`);
  lines.push('');
  lines.push('## Direct test reference counts');
  lines.push('');
  lines.push('| Fixture | Referencing tests (direct) |');
  lines.push('| --- | --- |');
  for (const entry of summary.withCounts.sort((a, b) => a.fixture.localeCompare(b.fixture))) {
    lines.push(`| ${entry.fixture} | ${entry.count} |`);
  }
  lines.push('');

  if (fixtureMap.cycleEdges.length > 0) {
    lines.push('## Include/import cycle edges (sample)');
    lines.push('');
    lines.push(
      'At least one directed cycle exists in the fixture→fixture graph. Edges listed are back-edges observed during DFS (not necessarily a minimal cycle basis).',
    );
    lines.push('');
    for (const [from, to] of fixtureMap.cycleEdges.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))) {
      lines.push(`- \`${from}\` → \`${to}\``);
    }
    lines.push('');
  }

  lines.push('## Potentially unreferenced fixtures');
  lines.push('');
  if (summary.unreferenced.length === 0) {
    lines.push('None under current rules.');
  } else {
    lines.push(
      'Not reachable from any test’s literal `fixtures/...` reference via the include/import rules above. Verify before deleting.',
    );
    lines.push('');
    for (const fixture of summary.unreferenced.sort()) {
      lines.push(`- ${fixture}`);
    }
  }
  lines.push('');

  if (fixtureMap.sentinelPaths.length > 0) {
    lines.push('## Sentinel / placeholder files');
    lines.push('');
    lines.push('Excluded from the main fixture inventory (`.keep`, `.gitkeep`).');
    lines.push('');
    for (const p of fixtureMap.sentinelPaths.sort()) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  lines.push('## Sample fixture-to-test map (first 5 direct tests per fixture)');
  lines.push('');
  lines.push('| Fixture | Referencing tests |');
  lines.push('| --- | --- |');
  const fixtureEntries = Array.from(fixtureMap.fixtureMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  for (const [fixture, tests] of fixtureEntries) {
    const sorted = Array.from(tests).sort();
    const sample = sorted.slice(0, 5).join(', ');
    const suffix = sorted.length > 5 ? ` (+${sorted.length - 5} more)` : '';
    lines.push(`| ${fixture} | ${sample}${suffix} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Stable comparison: LF-only, single trailing newline (matches typical editor + CI checkout). */
function normalizeGeneratedDoc(text) {
  return `${text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()}\n`;
}

const coverageMapRel = join('test', 'fixtures', 'coverage-map.md');
const coverageMapAbs = join(repoRoot, coverageMapRel);

function runCheck() {
  const fixtureMap = buildFixtureMap();
  const summary = summarizeMap(fixtureMap);
  const generated = normalizeGeneratedDoc(formatMarkdown(summary, fixtureMap));

  if (!existsSync(coverageMapAbs)) {
    console.error(`fixture-coverage --check: missing ${coverageMapRel}`);
    console.error(`Regenerate: node scripts/dev/fixture-coverage.js > ${coverageMapRel}`);
    process.exitCode = 1;
    return;
  }

  const onDisk = normalizeGeneratedDoc(readFileSync(coverageMapAbs, 'utf8'));
  if (generated === onDisk) {
    return;
  }

  console.error(`fixture-coverage --check: ${coverageMapRel} is out of date (differs from generator output).`);
  console.error(`Regenerate from repo root: node scripts/dev/fixture-coverage.js > ${coverageMapRel}`);
  process.exitCode = 1;
}

function main() {
  if (process.argv.includes('--check')) {
    runCheck();
    return;
  }

  const format = process.argv.includes('--format=json') ? 'json' : 'md';
  const fixtureMap = buildFixtureMap();
  const summary = summarizeMap(fixtureMap);

  if (format === 'json') {
    const payload = {
      totals: {
        fixtures: summary.fixtures.length,
        sentinels: fixtureMap.sentinelPaths.length,
        reachableFromTests: summary.referenced.size,
        potentiallyUnreferenced: summary.unreferenced.length,
      },
      assumptions: {
        includeDirs: fixtureMap.includeDirsAbs.map((d) => normalizeRelPath(relative(repoRoot, d))),
      },
      cycleEdges: fixtureMap.cycleEdges.map(([from, to]) => ({ from, to })),
      fixtures: summary.fixtures,
      sentinelPaths: fixtureMap.sentinelPaths,
      reachableFromTests: Array.from(summary.referenced).sort(),
      potentiallyUnreferenced: summary.unreferenced,
      map: Array.from(fixtureMap.fixtureMap.entries()).map(([fixture, tests]) => ({
        fixture,
        tests: Array.from(tests).sort(),
      })),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatMarkdown(summary, fixtureMap));
}

main();
