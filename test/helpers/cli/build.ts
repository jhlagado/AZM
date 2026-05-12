import { execFile } from 'node:child_process';
import { access, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const cliPath = resolve(repoRoot, 'dist', 'src', 'cli.js');

let buildPromise: Promise<void> | undefined;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listBuildInputFiles(rootPath: string): Promise<string[]> {
  const info = await stat(rootPath);
  if (!info.isDirectory()) return [rootPath];

  const entries = await readdir(rootPath, { withFileTypes: true });
  const paths = await Promise.all(
    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const entryPath = resolve(rootPath, entry.name);
        if (entry.isDirectory()) return listBuildInputFiles(entryPath);
        return [entryPath];
      }),
  );
  return paths.flat();
}

async function latestInputMtimeMsForRoots(roots: string[]): Promise<number> {
  let latest = 0;
  for (const root of roots) {
    for (const file of await listBuildInputFiles(root)) {
      const fileInfo = await stat(file);
      if (fileInfo.mtimeMs > latest) latest = fileInfo.mtimeMs;
    }
  }
  return latest;
}

async function latestInputMtimeMs(): Promise<number> {
  return latestInputMtimeMsForRoots([
    resolve(repoRoot, 'package.json'),
    resolve(repoRoot, 'package-lock.json'),
    resolve(repoRoot, 'tsconfig.json'),
    resolve(repoRoot, 'src'),
  ]);
}

async function isCliBuildFresh(): Promise<boolean> {
  if (!(await pathExists(cliPath))) return false;
  const cliStat = await stat(cliPath);
  const latestInput = await latestInputMtimeMs();
  return cliStat.mtimeMs >= latestInput;
}

export async function ensureCliBuilt(): Promise<void> {
  if (!buildPromise) {
    buildPromise = (async () => {
      if (await isCliBuildFresh()) return;
      await execFileAsync('npm', ['run', 'build'], {
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
    })().finally(() => {
      buildPromise = undefined;
    });
  }
  return buildPromise;
}

export const __cliBuildInternals = {
  latestInputMtimeMsForRoots,
};
