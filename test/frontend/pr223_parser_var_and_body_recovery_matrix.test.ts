import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR223 parser: var/body interruption and recovery ordering matrix', () => {
  it('emits deterministic diagnostics for var-block/body interruptions and resumes top-level parsing', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr223_parser_var_and_body_recovery_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const expectedOrder = [
      'Unterminated func "missing_var_end_before_top": expected function body before "const"',
      'Invalid var declaration line "notADecl": expected <name>: <type>',
      'Function-local var block must end with "end" before function body',
      '"if" without matching "end"',
      'Unterminated func "missing_end_in_body_if": expected "end" before "enum"',
      '"select" without matching "end"',
      'Unterminated op "missing_end_in_body_select": expected "end" before "type"',
    ];
    expect(res.diagnostics).toHaveLength(expectedOrder.length);
    expect(res.diagnostics).toMatchObject(expectedOrder.map((message) => ({ message })));
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
