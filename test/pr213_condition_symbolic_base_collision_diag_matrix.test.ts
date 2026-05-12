import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR213_FIXTURE = join(
  __dirname,
  'fixtures',
  'pr213_condition_symbolic_base_collision_invalid.zax',
);

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR213: condition-symbol base collision diagnostics parity', () => {
  it.each([
    {
      label: 'jp cc nn arity',
      id: DiagnosticIds.EmitError,
      message: 'jp cc, nn expects two operands (cc, nn)',
    },
    {
      label: 'call cc nn arity',
      id: DiagnosticIds.EmitError,
      message: 'call cc, nn expects two operands (cc, nn)',
    },
    {
      label: 'jr cc disp arity',
      id: DiagnosticIds.EmitError,
      message: 'jr cc, disp expects two operands (cc, disp8)',
    },
  ] satisfies Row[])('$label — treats condition-code symbolic bases as malformed conditional arity', async (row) => {
    const res = await compile(PR213_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('emits duplicate arity diagnostics once per colliding site (NZ/NC/Z/C)', async () => {
    const res = await compile(PR213_FIXTURE, {}, { formats: defaultFormatWriters });
    expect(
      res.diagnostics.filter((d) => d.message === 'jp cc, nn expects two operands (cc, nn)'),
    ).toHaveLength(2);
    expect(
      res.diagnostics.filter((d) => d.message === 'call cc, nn expects two operands (cc, nn)'),
    ).toHaveLength(2);
    expect(
      res.diagnostics.filter((d) => d.message === 'jr cc, disp expects two operands (cc, disp8)'),
    ).toHaveLength(2);
  });

  it('does not treat symbolic bases as label fixups or generic unsupported instructions', async () => {
    const res = await compile(PR213_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unresolved symbol' });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
