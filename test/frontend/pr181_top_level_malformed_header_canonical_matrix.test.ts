import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR181 parser: canonical top-level malformed-header matrix', () => {
  it('emits canonical expected-shape diagnostics for malformed known top-level headers', async () => {
    const entry = join(__dirname, '..', 'fixtures',
      'pr181_top_level_malformed_header_canonical_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid import statement line "import": expected "<path>.zax" or <moduleId>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid type declaration line "type": expected <name> [<typeExpr>]',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid union declaration line "union": expected <name>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid globals declaration line "globals extra": expected globals',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid func header line "func": expected <name>(...): <retType>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid op header line "op": expected <name>(...)',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid extern base name "(": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid enum declaration line "enum": expected <name> <member>[, ...]',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid section directive line "section": expected <code|data|var> [at <imm16>]',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid align directive line "align": expected <imm16>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid const declaration line "const": expected <name> = <imm>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid bin declaration line "bin": expected <name> in <code|data> from "<path>"',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid hex declaration line "hex": expected <name> from "<path>"',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid data declaration line "data extra": expected data',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
