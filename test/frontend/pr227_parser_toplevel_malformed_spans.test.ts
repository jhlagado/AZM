import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR227 parser top-level malformed header span matrix', () => {
  it('pins line/column and ordering for the top-level malformed keyword matrix', async () => {
    const entry = join(__dirname, '..', 'fixtures',
      'pr154_parser_top_level_malformed_keyword_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const spans = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(spans).toEqual([
      {
        message: 'Invalid func header line "func": expected <name>(...): <retType>',
        line: 1,
        column: 1,
      },
      { message: 'Invalid op header line "op": expected <name>(...)', line: 2, column: 1 },
      {
        message:
          'Invalid extern declaration line "extern": expected [<baseName>] or func <name>(...): <retType> at <imm16>',
        line: 3,
        column: 1,
      },
      {
        message: 'Invalid import statement line "import": expected "<path>.zax" or <moduleId>',
        line: 4,
        column: 1,
      },
      {
        message: 'Invalid type declaration line "type": expected <name> [<typeExpr>]',
        line: 5,
        column: 1,
      },
      { message: 'Invalid union declaration line "union": expected <name>', line: 6, column: 1 },
      {
        message: 'Invalid globals declaration line "globals\tx: byte": expected globals',
        line: 7,
        column: 1,
      },
      {
        message: 'Invalid data declaration line "data\tx: byte = 1": expected data',
        line: 8,
        column: 1,
      },
      {
        message: 'Invalid const declaration line "const": expected <name> = <imm>',
        line: 9,
        column: 1,
      },
      {
        message: 'Invalid enum declaration line "enum": expected <name> <member>[, ...]',
        line: 10,
        column: 1,
      },
      {
        message:
          'Invalid section directive line "section\tbad": expected <code|data|var> [at <imm16>]',
        line: 11,
        column: 1,
      },
      { message: 'Invalid align directive line "align": expected <imm16>', line: 12, column: 1 },
      {
        message: 'Invalid bin declaration line "bin": expected <name> in <code|data> from "<path>"',
        line: 13,
        column: 1,
      },
      {
        message: 'Invalid hex declaration line "hex": expected <name> from "<path>"',
        line: 14,
        column: 1,
      },
    ]);
  });

  it('pins line/column and ordering for malformed/unsupported export forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr157_export_malformed_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const spans = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(spans.length).toBe(14);
  });

  it('pins line/column for canonical malformed header diagnostics including extern base-name errors', async () => {
    const entry = join(__dirname, '..', 'fixtures',
      'pr181_top_level_malformed_header_canonical_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const spans = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(spans.length).toBe(15);
  });
});
