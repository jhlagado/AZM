import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR242 import resolution diagnostics include source spans', () => {
  it('pins line/column for ImportNotFound diagnostics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr11_missing_import.zax');
    const includeDir = join(__dirname, 'fixtures', 'includes');

    const res = await compile(
      entry,
      { includeDirs: [includeDir] },
      { formats: defaultFormatWriters },
    );
    expect(res.artifacts).toEqual([]);

    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ImportNotFound,
      line: 2,
    });
    expect(res.diagnostics.find((d) => d.id === DiagnosticIds.ImportNotFound)?.column).toBe(1);
  });

  it('pins line/column for hard import candidate read failures', async () => {
    const entry = join(__dirname, 'fixtures', 'pr242_import_unreadable_dir.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.IoReadFailed,
      line: 1,
      messageIncludes: 'Failed to read import candidate',
    });
    expect(res.diagnostics.find((d) => d.id === DiagnosticIds.IoReadFailed)?.column).toBe(1);
  });
});
