import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

export function byteHex(value) {
  return value === undefined ? 'EOF' : `0x${value.toString(16).padStart(2, '0')}`;
}

export function hex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

export function findFirstMismatch(actual, reference) {
  const maxLength = Math.max(actual.length, reference.length);
  for (let i = 0; i < maxLength; i++) {
    if (actual[i] !== reference[i]) return i;
  }
  return -1;
}

export function summarizeBinaryMismatch(actual, reference) {
  const firstMismatch = findFirstMismatch(actual, reference);
  const lines = [`Binary length: actual=${actual.length} reference=${reference.length}`];
  if (firstMismatch >= 0) {
    lines.push(
      `First mismatch @${hex(firstMismatch)}: actual=${byteHex(
        actual[firstMismatch],
      )} reference=${byteHex(reference[firstMismatch])}`,
    );
  } else {
    lines.push('First mismatch: none');
  }
  return lines.join('\n');
}

export function byteWindow(bytes, center, radius = 4) {
  if (center === undefined || center < 0) return '[]';
  const start = Math.max(0, center - radius);
  const end = Math.min(bytes.length, center + radius + 1);
  return `[${Array.from(bytes.subarray(start, end), (byte) => hex(byte, 2)).join(' ')}]`;
}

export function sourceStem(source) {
  return basename(source).replace(/\.(z80|asm)$/i, '');
}

export function copyAsm80SourceSiblings(source, outDir, extensions = /\.(z80|asm)$/i) {
  for (const entry of readdirSync(dirname(source), { withFileTypes: true })) {
    if (entry.isFile() && extensions.test(entry.name)) {
      copyFileSync(join(dirname(source), entry.name), join(outDir, entry.name));
    }
  }
}

export function parseListingWrittenRange(listingPath) {
  const text = readFileSync(listingPath, 'utf8');
  let start;
  let end = 0;
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9A-Fa-f]{4})\s+/.exec(line);
    if (!match) continue;
    const address = Number.parseInt(match[1], 16);
    const bytes = line
      .slice(7, 31)
      .trim()
      .split(/\s+/)
      .filter((token) => /^[0-9A-Fa-f]{2}$/.test(token)).length;
    if (bytes === 0) continue;
    start = start === undefined ? address : Math.min(start, address);
    end = Math.max(end, address + bytes);
  }
  return { start: start ?? 0, end };
}

export function binaryFromListingRange(bytes, range) {
  if (bytes.length !== 0x10000) return bytes;
  let end = range.end;
  for (let index = bytes.length - 1; index >= range.start; index--) {
    if (bytes[index] !== 0) {
      end = Math.max(end, index + 1);
      break;
    }
  }
  return bytes.subarray(range.start, end);
}

export function compactSpawnError(result) {
  return [result.stdout, result.stderr]
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' | ');
}

export function runAsm80BinaryReference(source, asm80, options = {}) {
  const workDir = mkdtempSync(join(tmpdir(), options.tempPrefix ?? 'azm-asm80-reference-'));
  const outName = options.outputName ?? `${sourceStem(source)}.bin`;
  const sourceName = basename(source);
  const listingPath = join(workDir, `${sourceStem(source)}.lst`);
  try {
    copyAsm80SourceSiblings(source, workDir, options.extensions);
    const result = spawnSync(
      asm80,
      ['-m', 'Z80', '-t', 'bin', '-o', outName, sourceName],
      { cwd: workDir, encoding: 'utf8' },
    );
    if (result.error) return { ok: false, message: result.error.message };
    if (result.status !== 0) return { ok: false, message: compactSpawnError(result) };

    const bytes = readFileSync(join(workDir, outName));
    const range =
      options.trimListingRange && existsSync(listingPath)
        ? parseListingWrittenRange(listingPath)
        : undefined;
    return { ok: true, bytes: range ? binaryFromListingRange(bytes, range) : bytes, range };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
