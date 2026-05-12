import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoErrors } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('typed aggregate locals (addr-sized pointer slots)', () => {
  it('compiles linked_list example with record-typed local and field access without cast', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1334_linked_list.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('rejects constant initializers on record-typed locals', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1334_record_local_init_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      message:
        'Local "p" of record or union type cannot have a constant initializer; assign after declaration.',
    });
  });
});
