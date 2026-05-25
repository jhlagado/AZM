import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect } from 'vitest';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const cliPath = resolve(repoRoot, 'dist', 'src', 'cli.js');

const MAIN_SOURCE = ['main:', '    nop', '    ret', ''].join('\n');

export function normalizePathForCompare(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.replace(/^\/private\/var\//, '/var/').toLowerCase();
}

export async function runCli(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const node = process.execPath;
  try {
    const { stdout, stderr } = await execFileAsync(node, [cliPath, ...args], {
      encoding: 'utf8',
      cwd,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function makeCliWorkDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeCliWorkDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function writeCliMainSource(workDir: string, source = MAIN_SOURCE): Promise<string> {
  const entry = join(workDir, 'main.asm');
  await writeFile(entry, source, 'utf8');
  return entry;
}

export async function expectCliArtifacts(
  workDir: string,
  stem: string,
  expected: Partial<Record<'hex' | 'bin' | 'd8.json' | 'z80' | 'asm80', boolean>>,
): Promise<void> {
  for (const [extension, shouldExist] of Object.entries(expected)) {
    expect(await exists(join(workDir, `${stem}.${extension}`))).toBe(shouldExist);
  }
}

export async function readArtifactSet(base: string): Promise<{
  bin: string;
  hex: string;
  d8m: string;
}> {
  const bin = await readFile(`${base}.bin`);
  const hex = await readFile(`${base}.hex`, 'utf8');
  const d8m = await readFile(`${base}.d8.json`, 'utf8');
  return {
    bin: bin.toString('hex'),
    hex,
    d8m,
  };
}
