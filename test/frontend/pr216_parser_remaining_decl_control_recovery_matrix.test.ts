import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR216 parser: remaining declaration/control recovery matrix', () => {
  it('emits deterministic diagnostics for uncovered declaration/control malformed forms', async () => {
    const entry = join(__dirname, '..', 'fixtures',
      'pr216_parser_remaining_decl_control_recovery_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const expectedInOrder = [
      'Unexpected "end" in asm block',
      'extern block must contain at least one func declaration',
      'Enum "Empty" must declare at least one member',
      'Trailing commas are not permitted in enum member lists',
    ];

    const actualInOrder = res.diagnostics
      .map(({ message }) => message)
      .filter((message) => expectedInOrder.includes(message));
    expect(actualInOrder).toEqual(expectedInOrder);
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
