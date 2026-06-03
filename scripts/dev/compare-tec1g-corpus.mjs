#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findAsm80 } from './asm80Tools.mjs';
import { runAsm80BinaryReference, sourceStem } from './asm80ReferenceTools.mjs';
import { findFirstMismatch } from './binaryMismatchTools.mjs';
import { byteHex, byteWindow, hex } from './hexFormatTools.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), '..', '..');
const defaultRoot = '/Users/johnhardy/projects/TEC-1G/Software';

function usage() {
  return [
    'Usage: node scripts/dev/compare-tec1g-corpus.mjs [software-root]',
    '',
    `Default software root: ${defaultRoot}`,
    'Files containing .macro or .endm are excluded from the baseline corpus.',
    'Set ASM80 or ASM80_PATH to choose the asm80 executable.',
  ].join('\n');
}

function walkAsm80Files(root) {
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkAsm80Files(path));
    } else if (isAsm80SourceFile(entry)) {
      out.push(path);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function isAsm80SourceFile(entry) {
  return entry.isFile() && /\.(z80|asm)$/i.test(entry.name);
}

function isMacroSource(source) {
  const text = readFileSync(source, 'utf8');
  return /^\s*\.?(macro|endm)\b/im.test(text);
}

function run(command, args, options) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function runAsm80(source, asm80) {
  return runAsm80BinaryReference(source, asm80, {
    tempPrefix: 'azm-asm80-reference-one-',
    trimListingRange: true,
  });
}

function runAzm(source, outDir) {
  const outPath = join(outDir, `${sourceStem(source)}.bin`);
  const result = run(
    process.execPath,
    [
      join(repoRoot, 'dist', 'src', 'cli.js'),
      '--nohex',
      '--nod8m',
      '-t',
      'bin',
      '-o',
      outPath,
      source,
    ],
    { cwd: repoRoot },
  );
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0) return { ok: false, message: compactError(result) };
  return { ok: true, bytes: readFileSync(outPath), outPath };
}

function compactError(result) {
  return [result.stdout, result.stderr]
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' | ');
}

function comparableAsm80Bytes(asm) {
  return asm.bytes;
}

function compareBytes(actual, asm) {
  const comparableReference = comparableAsm80Bytes(asm);
  const mismatch = findFirstMismatch(actual, comparableReference);
  if (mismatch < 0) return `match bytes=${actual.length}`;
  const actualByte = actual[mismatch];
  const referenceByte = comparableReference[mismatch];
  const range = asm.range
    ? ` range=${hex(asm.range.start)}..${hex(Math.max(asm.range.start, asm.range.end) - 1)}`
    : '';
  return [
    `mismatch actual=${actual.length} reference=${comparableReference.length}`,
    `lengthDelta=${actual.length - comparableReference.length}`,
    range.trim(),
    `first=${hex(mismatch)}`,
    `azm=${byteHex(actualByte)}`,
    `asm80=${byteHex(referenceByte)}`,
    `azmWindow=${byteWindow(actual, mismatch)}`,
    `asm80Window=${byteWindow(comparableReference, mismatch)}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function parseArgs(argv) {
  if (isHelpRequest(argv)) {
    return { help: true, code: 0 };
  }
  if (argv.length > 1) {
    return { help: true, code: 2, error: true };
  }
  return { help: false, root: argv[0] ?? defaultRoot };
}

function isHelpRequest(argv) {
  return argv.includes('--help') || argv.includes('-h');
}

function reportUsage(parsed) {
  const output = parsed.error ? console.error : console.log;
  output(usage());
  return parsed.code;
}

function validateEnvironment(root) {
  if (!existsSync(root)) throw new Error(`TEC-1G software root not found: ${root}`);
  const asm80 = findAsm80();
  if (!asm80) throw new Error('asm80 executable not found. Set ASM80 or ASM80_PATH.');
  const azmCli = join(repoRoot, 'dist', 'src', 'cli.js');
  if (!existsSync(azmCli)) throw new Error('Built AZM CLI not found. Run `npm run build` first.');
  return asm80;
}

function partitionSources(sources) {
  const included = [];
  const excluded = [];
  for (const source of sources) {
    const target = isMacroSource(source) ? excluded : included;
    target.push(source);
  }
  return { included, excluded };
}

function reportCorpusHeader(root, included, excluded) {
  console.log(`ASM80 corpus root: ${root}`);
  console.log(`Included .asm/.z80 files: ${included.length}`);
  console.log(`Excluded macro files: ${excluded.length}`);
  for (const source of excluded) console.log(`EXCLUDED macro ${relative(root, source)}`);
}

function compareSource(root, source, asm80, azmOut) {
  const rel = relative(root, source);
  const asm = runAsm80(source, asm80);
  const azm = runAzm(source, azmOut);
  const matched = comparisonMatched(asm, azm);
  const status = comparisonStatus(asm, azm);
  console.log(`${rel}: ${status}`);
  return matched;
}

function comparisonMatched(asm, azm) {
  return asm.ok && azm.ok && findFirstMismatch(azm.bytes, comparableAsm80Bytes(asm)) < 0;
}

function comparisonStatus(asm, azm) {
  if (asm.ok && azm.ok) {
    return compareBytes(azm.bytes, asm);
  }
  return `asm80=${toolStatus(asm)} azm=${toolStatus(azm)}`;
}

function toolStatus(result) {
  return result.ok ? 'ok' : `fail ${result.message}`;
}

function compareIncludedSources(root, included, asm80, azmOut) {
  let failures = 0;
  for (const source of included) {
    if (!compareSource(root, source, asm80, azmOut)) failures++;
  }
  return failures;
}

function runCorpusComparison(root, asm80) {
  const azmOut = mkdtempSync(join(tmpdir(), 'azm-tec1g-azm-'));
  try {
    const sources = walkAsm80Files(root);
    const { included, excluded } = partitionSources(sources);
    reportCorpusHeader(root, included, excluded);
    const failures = compareIncludedSources(root, included, asm80, azmOut);
    return failures === 0 ? 0 : 1;
  } finally {
    rmSync(azmOut, { recursive: true, force: true });
  }
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    return reportUsage(parsed);
  }
  const asm80 = validateEnvironment(parsed.root);
  return runCorpusComparison(parsed.root, asm80);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
