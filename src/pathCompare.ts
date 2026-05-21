import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

function stripExtendedWindowsPrefix(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}

export function normalizePathForCompare(
  path: string,
  options: { realpath?: boolean } = {},
): string {
  const resolved = options.realpath ? resolve(path) : path;
  const canonical = (() => {
    if (!options.realpath) return resolved;
    try {
      return realpathSync.native(resolved);
    } catch {
      return resolved;
    }
  })();
  const stripped = stripExtendedWindowsPrefix(canonical);
  const normalized = stripped.replace(/\\/g, '/');
  const normalizedDarwin =
    process.platform === 'darwin' ? normalized.replace(/^\/private\//, '/') : normalized;
  return process.platform === 'win32' ? normalizedDarwin.toLowerCase() : normalizedDarwin;
}
