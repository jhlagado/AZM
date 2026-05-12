import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR175 parser: malformed func/op/extern header matrix', () => {
  it('emits shape-specific diagnostics for malformed func/op/extern headers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr175_func_op_extern_malformed_header_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid func header line "func": expected <name>(...): <retType>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid func header line "func main(": expected <name>(...): <retType>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid func name "9bad": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated func "ok": expected function body before "op"',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid op header line "op": expected <name>(...)',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid op header line "op macro(": expected <name>(...)',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid op name "9bad": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid op header: unexpected trailing tokens',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid extern base name "@bad": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid extern base name "const": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      message:
        'Invalid extern func declaration line "func": expected <name>(...)[ : <retRegs> ] at <imm16>',
    });
    expectDiagnostic(res.diagnostics, {
      message:
        'Invalid extern func declaration line "func x(a: byte) at $1234": expected <name>(...)[ : <retRegs> ] at <imm16>',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid extern func name "const": collides with a top-level keyword.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
