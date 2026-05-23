import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { D8mArtifact } from '../../src/formats/types.js';
import type { CompilerOptions } from '../../src/pipeline.js';

const backendDir = dirname(fileURLToPath(import.meta.url));

export function backendFixturePath(...parts: string[]): string {
  return join(backendDir, '..', 'fixtures', ...parts);
}

export async function compileBackendFixtureToD8m(
  fixtureName: string,
  options: CompilerOptions = {},
): Promise<D8mArtifact> {
  const res = await compile(backendFixturePath(fixtureName), options, {
    formats: defaultFormatWriters,
  });
  if (res.diagnostics.length > 0) {
    throw new Error(`Expected no diagnostics:\n${JSON.stringify(res.diagnostics, null, 2)}`);
  }
  const d8m = res.artifacts.find((artifact): artifact is D8mArtifact => artifact.kind === 'd8m');
  if (!d8m) throw new Error('Expected D8M artifact');
  return d8m;
}
