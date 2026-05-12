import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoErrors, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('GitHub issue #849 local constant initializers', () => {
  it('accepts named constants and simple const-evaluable expressions in typed local initializers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr849_local_init_consts_positive.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoErrors(res.diagnostics);
  });

  it('diagnoses unknown compile-time names in typed local initializers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr849_local_init_unknown_name_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Unknown compile-time name "MissingConst" in local initializer for "high_index".',
    });
  });

  it('diagnoses non-constant names in typed local initializers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr849_local_init_nonconstant_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message:
        'Invalid local constant initializer for "high_index": "base" is not a compile-time constant.',
    });
  });

  it('diagnoses EA-shaped local initializer expressions as invalid local constant initializers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr849_local_init_ea_shape_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message:
        'Invalid local constant initializer for "value": expected compile-time immediate expression.',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'Invalid var declaration line "value: word = arr[0]": expected <name>: <type>',
    });
  });

  it('diagnoses type-fit failures with existing immediate ranges', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr849_local_init_type_fit_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Local initializer for "too_big_byte" does not fit byte range (-128..255); got 300.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message:
        'Local initializer for "too_big_word" does not fit word/addr range (-32768..65535); got 70000.',
    });
  });
});
