import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import type { Artifact } from '../../src/outputs/types.js';

export async function compileAsm80Fixture(
  tmpPrefix: string,
  fileName: string,
  lines: string[],
  options: { emitAsm80?: boolean } = { emitAsm80: true },
): Promise<readonly Artifact[]> {
  const dir = mkdtempSync(join(tmpdir(), tmpPrefix));
  const entry = join(dir, fileName);
  writeFileSync(entry, lines.join('\n'), 'utf8');

  const res = await compile(
    entry,
    {
      emitBin: true,
      emitAsm80: options.emitAsm80 ?? true,
      emitD8m: true,
    },
    { formats: defaultFormatWriters },
  );
  if (res.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error(`unexpected diagnostics: ${JSON.stringify(res.diagnostics)}`);
  }
  return res.artifacts;
}
