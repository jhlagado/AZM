import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR172 parser: malformed block-body line diagnostics matrix', () => {
  it('emits explicit expected-shape diagnostics across block forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr172_block_body_malformed_line_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid record field declaration line "x byte": expected <name>: <type>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid union field declaration line "lo byte": expected <name>: <type>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid globals declaration line "g byte": expected <name>: <type>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid var declaration line "tmp byte": expected <name>: <type>',
    });
    expectDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid extern func declaration line',
    });
    expectDiagnostic(res.diagnostics, {
      message:
        'Invalid data declaration line "blob: byte [1]": expected <name>: <type> = <initializer>',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
