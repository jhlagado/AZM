import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR178 parser: malformed import/enum/section/align/const headers', () => {
  it('emits explicit expected-shape diagnostics for malformed declaration headers', async () => {
    const entry = join(__dirname, '..', 'fixtures',
      'pr178_import_enum_section_align_const_malformed_header_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid import statement line "import": expected "<path>.zax" or <moduleId>',
    });
    expectDiagnostic(res.diagnostics, {
      message:
        'Invalid import statement line "import \\"x.zax\\" trailing": expected "<path>.zax" or <moduleId>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid import statement line "import 9bad": expected "<path>.zax" or <moduleId>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid enum declaration line "enum": expected <name> <member>[, ...]',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid enum name "9bad": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid section directive line "section": expected <code|data|var> [at <imm16>]',
    });
    expectDiagnostic(res.diagnostics, {
      message:
        'Invalid section directive line "section text at $1000": expected <code|data|var> [at <imm16>]',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid align directive line "align": expected <imm16>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid const declaration line "const": expected <name> = <imm>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid const name "9bad": expected <identifier>.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
