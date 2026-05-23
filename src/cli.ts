#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export { parseCliArgs, runCli } from './cli/run.js';
import { runCli } from './cli/run.js';

function normalizePathForCompare(path: string): string {
  const resolved = resolve(path);
  const canonical = (() => {
    try {
      return realpathSync(resolved);
    } catch {
      return resolved;
    }
  })();

  const normalized = canonical.replace(/\\/g, '/');
  const normalizedDarwin =
    process.platform === 'darwin' ? normalized.replace(/^\/private\//, '/') : normalized;
  return process.platform === 'win32' ? normalizedDarwin.toLowerCase() : normalizedDarwin;
}

function samePath(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}

function isDirectCliInvocation(invokedAs: string | undefined): boolean {
  if (!invokedAs) return false;
  const self = fileURLToPath(import.meta.url);
  if (samePath(invokedAs, self)) return true;

  const invoked = normalizePathForCompare(invokedAs);
  return invoked.endsWith('/dist/src/cli.js');
}

if (isDirectCliInvocation(process.argv[1])) {
  void runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
