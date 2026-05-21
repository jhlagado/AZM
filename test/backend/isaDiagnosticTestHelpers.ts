import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const backendDir = dirname(fileURLToPath(import.meta.url));

function backendFixturePath(fixtureName: string): string {
  return join(backendDir, '..', 'fixtures', fixtureName);
}

export async function compileBackendFixtureDiagnostics(
  fixtureName: string,
): Promise<Diagnostic[]> {
  const res = await compile(backendFixturePath(fixtureName), {}, { formats: defaultFormatWriters });
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
