import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters as legacyDefaultFormatWriters } from '../../legacy-root-azm/src/formats/index.js';
import type { CompilerOptions, CompileResult } from '../../src/pipeline.js';

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

export async function compileTempSource(
  prefix: string,
  ext: string,
  source: string,
  options: CompilerOptions,
): Promise<CompileResult> {
  return withTempSource(prefix, ext, source, (entry) =>
    compile(entry, options, { formats: legacyDefaultFormatWriters }),
  );
}
