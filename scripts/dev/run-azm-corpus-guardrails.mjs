#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const CORPUS_ROOTS = [
  { name: 'tetro', paths: [join(homedir(), 'projects', 'tetro')] },
  { name: 'MON3', paths: [join(homedir(), 'projects', 'MON3'), join(homedir(), 'projects', 'mon3')] },
];

const CORPUS_CHECKS = [
  {
    repo: 'tetro',
    name: 'tetro',
    entry: 'src/tetro/tetro.z80',
    cwd: 'src',
    asm80Args: ['-m', 'Z80', '-t', 'hex', '-o'],
  },
  {
    repo: 'tetro',
    name: 'pacmo',
    entry: 'src/pacmo/pacmo.z80',
    cwd: 'src',
    asm80Args: ['-m', 'Z80', '-t', 'hex', '-o'],
  },
];

function normalizeExecutableCandidate(candidate) {
  return candidate.includes('/') || candidate.includes('\\') ? resolve(candidate) : candidate;
}

function findAsm80() {
  const candidates = [
    process.env.ASM80,
    process.env.ASM80_PATH,
    '/Users/johnhardy/Documents/projects/debug80/node_modules/.bin/asm80',
    'asm80',
  ]
    .filter((candidate) => candidate && candidate.trim().length > 0)
    .map(normalizeExecutableCandidate);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-h'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (!probe.error) return candidate;
  }
  return undefined;
}

function resolveRepoRoot(spec) {
  for (const root of spec.paths) {
    if (existsSync(root)) return root;
  }
  return undefined;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
}

function skip(repo, reason) {
  console.log(`SKIP ${repo}: ${reason}`);
}

function compactError(result) {
  return [result.stdout, result.stderr]
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(' | ');
}

function normalizeFinalNewline(text) {
  return text.replace(/(?:\r?\n)+$/, '');
}

function runAsm80(check, repoRoot, asm80, outDir) {
  const sourceCwd = join(repoRoot, check.cwd);
  const workRoot = join(outDir, check.name);
  const workCwd = join(workRoot, check.cwd);
  mkdirSync(workRoot);
  cpSync(sourceCwd, workCwd, { recursive: true });

  const entry = relative(sourceCwd, join(repoRoot, check.entry));
  const outName = `${check.name}.asm80.hex`;
  const outPath = join(workCwd, dirname(entry), outName);
  const result = run(asm80, [...check.asm80Args, outName, entry], { cwd: workCwd });
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0) return { ok: false, message: compactError(result) };
  return { ok: true, outPath, payload: normalizeFinalNewline(readFileSync(outPath, 'utf8')) };
}

function runAzm(check, repoRoot, outDir) {
  const entry = join(repoRoot, check.entry);
  const outPath = join(outDir, `${check.name}.azm.hex`);
  const cli = join(process.cwd(), 'dist', 'src', 'cli.js');
  const result = run(
    process.execPath,
    [cli, '--type', 'hex', '--output', outPath, entry],
    { cwd: process.cwd() },
  );
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0) return { ok: false, message: compactError(result) };
  return { ok: true, outPath, payload: normalizeFinalNewline(readFileSync(outPath, 'utf8')) };
}

function comparePayloads(check, asm, azm) {
  if (asm.payload === azm.payload) {
    console.log(`PASS ${check.name}: AZM HEX matches ASM80`);
    return true;
  }
  console.error(`FAIL ${check.name}: AZM HEX differs from ASM80`);
  console.error(`  ASM80: ${asm.outPath}`);
  console.error(`  AZM:   ${azm.outPath}`);
  return false;
}

function main() {
  const asm80 = findAsm80();
  if (!asm80) {
    console.log('SKIP corpus: asm80 not found');
    return 0;
  }

  const azmCli = join(process.cwd(), 'dist', 'src', 'cli.js');
  if (!existsSync(azmCli)) {
    console.error('Built AZM CLI not found. Run `npm run build` first.');
    return 1;
  }

  let failed = false;
  const tempRoot = mkdtempSync(join(tmpdir(), 'azm-corpus-guardrails-'));
  const asm80Out = join(tempRoot, 'asm80');
  const azmOut = join(tempRoot, 'azm');
  mkdirSync(asm80Out);
  mkdirSync(azmOut);

  try {
    for (const spec of CORPUS_ROOTS) {
      const root = resolveRepoRoot(spec);
      if (!root) {
        skip(spec.name, 'repository not found locally');
        continue;
      }

      const checks = CORPUS_CHECKS.filter((check) => check.repo === spec.name);
      if (checks.length === 0) {
        skip(spec.name, 'no corpus entry configured');
        continue;
      }

      for (const check of checks) {
        const entry = join(root, check.entry);
        if (!existsSync(entry)) {
          skip(check.name, `entry not found (${entry})`);
          continue;
        }

        console.log(`CHECK ${check.name}: ${entry}`);
        const asm = runAsm80(check, root, asm80, asm80Out);
        const azm = runAzm(check, root, azmOut);
        if (!asm.ok || !azm.ok) {
          failed = true;
          console.error(
            `FAIL ${check.name}: asm80=${asm.ok ? 'ok' : asm.message} azm=${azm.ok ? 'ok' : azm.message}`,
          );
          continue;
        }

        if (!comparePayloads(check, asm, azm)) failed = true;
      }
    }
  } finally {
    if (failed) {
      console.error(`Corpus outputs preserved for inspection: ${tempRoot}`);
    } else {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  return failed ? 1 : 0;
}

process.exitCode = main();
