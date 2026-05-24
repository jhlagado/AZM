import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function writeTempSource(
  prefix: string,
  ext: string,
  source: string,
): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function withTempSource<T>(
  prefix: string,
  ext: string,
  source: string,
  callback: (entry: string) => Promise<T>,
): Promise<T> {
  const { entry, cleanup } = writeTempSource(prefix, ext, source);
  try {
    return await callback(entry);
  } finally {
    cleanup();
  }
}
