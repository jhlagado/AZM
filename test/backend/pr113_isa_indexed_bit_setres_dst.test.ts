import { describe, expect, it } from 'vitest';
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';
import { binBytes, containsSubsequence } from '../test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR113 ISA: indexed set/res with destination register', () => {
  it('encodes set/res b,(ix/iy+disp),r forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr113_isa_indexed_bit_setres_dst.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    expect(
      containsSubsequence(binBytes(res.artifacts), [
        0xdd, 0xcb, 0x01, 0xc0, // set 0,(ix+1),b
        0xfd, 0xcb, 0xfe, 0xff, // set 7,(iy-2),a
        0xdd, 0xcb, 0x00, 0x9b, // res 3,(ix+0),e
        0xfd, 0xcb, 0x7f, 0xb5, // res 6,(iy+127),l
      ]),
    ).toBe(true);
  });

  it('diagnoses invalid 3-operand source/destination forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'tmp-pr113-indexed-setres-invalid.zax');
    const source = [
      'export func main()',
      '    set 1, (hl), a',
      '    res 2, (ix[0]), ix',
      'end',
      '',
    ].join('\n');
    await writeFile(entry, source, 'utf8');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    await rm(entry, { force: true });

    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      messageIncludes: 'requires an indexed memory source',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      messageIncludes: 'expects reg8 destination',
    });
  });
});
