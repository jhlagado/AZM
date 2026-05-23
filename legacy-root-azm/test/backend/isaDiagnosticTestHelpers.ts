import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { Artifact } from '../../src/formats/types.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const backendDir = dirname(fileURLToPath(import.meta.url));

export function backendFixturePath(fixtureName: string): string {
  return join(backendDir, '..', 'fixtures', fixtureName);
}

export async function compileBackendFixture(fixtureName: string): Promise<{
  diagnostics: Diagnostic[];
  artifacts: Artifact[];
}> {
  const res = await compile(backendFixturePath(fixtureName), {}, { formats: defaultFormatWriters });
  return { diagnostics: res.diagnostics, artifacts: res.artifacts };
}

export async function compileBackendFixtureDiagnostics(fixtureName: string): Promise<Diagnostic[]> {
  const res = await compileBackendFixture(fixtureName);
  return res.diagnostics;
}

export async function expectBackendFixtureDiagnostics(
  fixtureName: string,
  messages: string[],
): Promise<void> {
  const diagnostics = await compileBackendFixtureDiagnostics(fixtureName);
  for (const message of messages) {
    expectDiagnostic(diagnostics, { message });
  }
}

export { expectDiagnostic, expectNoDiagnostic };
