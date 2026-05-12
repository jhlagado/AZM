import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type SpanExpectation = { message: string; line: number; column: number };

describe('PR238 parser malformed declaration header span matrix', () => {
  it('pins diagnostic ordering and line/column across malformed declaration header fixtures', async () => {
    const cases: Array<{ fixture: string; expected: SpanExpectation[] }> = [
      {
        fixture: 'pr169_malformed_decl_header_matrix.zax',
        expected: [
          {
            message: 'Invalid enum member name "9bad": expected <identifier>.',
            line: 1,
            column: 1,
          },
          { message: 'Invalid const declaration: missing initializer', line: 3, column: 1 },
          { message: 'Invalid bin name "1asset": expected <identifier>.', line: 5, column: 1 },
          {
            message: 'Invalid bin section "text": expected "code" or "data".',
            line: 6,
            column: 1,
          },
          { message: 'Invalid bin declaration: expected quoted source path', line: 7, column: 1 },
          { message: 'Invalid hex name "9dump": expected <identifier>.', line: 9, column: 1 },
          { message: 'Invalid hex declaration: expected quoted source path', line: 10, column: 1 },
        ],
      },
      {
        fixture: 'pr175_func_op_extern_malformed_header_matrix.zax',
        expected: [
          {
            message: 'Invalid func header line "func": expected <name>(...): <retType>',
            line: 1,
            column: 1,
          },
          {
            message: 'Invalid func header line "func main(": expected <name>(...): <retType>',
            line: 2,
            column: 1,
          },
          { message: 'Invalid func name "9bad": expected <identifier>.', line: 3, column: 1 },
          {
            message: 'Unterminated func "ok": expected function body before "op"',
            line: 6,
            column: 1,
          },
          { message: 'Invalid op header line "op": expected <name>(...)', line: 6, column: 1 },
          {
            message: 'Invalid op header line "op macro(": expected <name>(...)',
            line: 7,
            column: 1,
          },
          { message: 'Invalid op name "9bad": expected <identifier>.', line: 8, column: 1 },
          { message: 'Invalid op header: unexpected trailing tokens', line: 9, column: 1 },
          {
            message: 'Invalid extern base name "@bad": expected <identifier>.',
            line: 11,
            column: 1,
          },
          {
            message: 'Invalid extern base name "const": collides with a top-level keyword.',
            line: 12,
            column: 1,
          },
          {
            message:
              'Invalid extern func declaration line "func": expected <name>(...)[ : <retRegs> ] at <imm16>',
            line: 15,
            column: 1,
          },
          {
            message:
              'Invalid extern func declaration line "func x(a: byte) at $1234": expected <name>(...)[ : <retRegs> ] at <imm16>',
            line: 16,
            column: 1,
          },
          {
            message: 'Invalid extern func name "const": collides with a top-level keyword.',
            line: 17,
            column: 1,
          },
        ],
      },
      {
        fixture: 'pr178_import_enum_section_align_const_malformed_header_matrix.zax',
        expected: [
          {
            message: 'Invalid import statement line "import": expected "<path>.zax" or <moduleId>',
            line: 1,
            column: 1,
          },
          {
            message:
              'Invalid import statement line "import \\"x.zax\\" trailing": expected "<path>.zax" or <moduleId>',
            line: 2,
            column: 1,
          },
          {
            message:
              'Invalid import statement line "import 9bad": expected "<path>.zax" or <moduleId>',
            line: 3,
            column: 1,
          },
          {
            message: 'Invalid enum declaration line "enum": expected <name> <member>[, ...]',
            line: 5,
            column: 1,
          },
          { message: 'Invalid enum name "9bad": expected <identifier>.', line: 6, column: 1 },
          {
            message:
              'Invalid section directive line "section": expected <code|data|var> [at <imm16>]',
            line: 8,
            column: 1,
          },
          {
            message:
              'Invalid section directive line "section text at $1000": expected <code|data|var> [at <imm16>]',
            line: 9,
            column: 1,
          },
          {
            message: 'Invalid align directive line "align": expected <imm16>',
            line: 11,
            column: 1,
          },
          {
            message: 'Invalid const declaration line "const": expected <name> = <imm>',
            line: 13,
            column: 1,
          },
          { message: 'Invalid const name "9bad": expected <identifier>.', line: 14, column: 1 },
        ],
      },
      {
        fixture: 'pr179_type_union_var_data_malformed_header_matrix.zax',
        expected: [
          {
            message: 'Invalid type declaration line "type": expected <name> [<typeExpr>]',
            line: 1,
            column: 1,
          },
          { message: 'Invalid type name "9Bad": expected <identifier>.', line: 2, column: 1 },
          {
            message: 'Invalid type declaration line "type Word =": expected <name> [<typeExpr>]',
            line: 3,
            column: 1,
          },
          {
            message:
              'Invalid type declaration line "type Word [byte]": expected <name> [<typeExpr>]',
            line: 4,
            column: 1,
          },
          {
            message: 'Invalid union declaration line "union": expected <name>',
            line: 6,
            column: 1,
          },
          { message: 'Invalid union name "9Pair": expected <identifier>.', line: 7, column: 1 },
          {
            message: 'Invalid union name "Pair extra": expected <identifier>.',
            line: 8,
            column: 1,
          },
          {
            message: 'Invalid globals declaration line "globals extra": expected globals',
            line: 10,
            column: 1,
          },
          {
            message: 'Invalid data declaration line "data extra": expected data',
            line: 11,
            column: 1,
          },
        ],
      },
      {
        fixture: 'pr180_bin_hex_malformed_header_matrix.zax',
        expected: [
          {
            message:
              'Invalid bin declaration line "bin": expected <name> in <code|data> from "<path>"',
            line: 1,
            column: 1,
          },
          {
            message:
              'Invalid bin declaration line "bin asset": expected <name> in <code|data> from "<path>"',
            line: 2,
            column: 1,
          },
          {
            message:
              'Invalid bin declaration line "bin asset in code": expected <name> in <code|data> from "<path>"',
            line: 3,
            column: 1,
          },
          {
            message: 'Invalid bin section "text": expected "code" or "data".',
            line: 4,
            column: 1,
          },
          { message: 'Invalid bin name "1asset": expected <identifier>.', line: 5, column: 1 },
          { message: 'Invalid bin declaration: expected quoted source path', line: 6, column: 1 },
          {
            message: 'Invalid hex declaration line "hex": expected <name> from "<path>"',
            line: 8,
            column: 1,
          },
          {
            message: 'Invalid hex declaration line "hex dump": expected <name> from "<path>"',
            line: 9,
            column: 1,
          },
          { message: 'Invalid hex name "9dump": expected <identifier>.', line: 10, column: 1 },
          { message: 'Invalid hex declaration: expected quoted source path', line: 11, column: 1 },
        ],
      },
    ];

    for (const testCase of cases) {
      const entry = join(__dirname, '..', 'fixtures', testCase.fixture);
      const res = await compile(entry, {}, { formats: defaultFormatWriters });
      const spans = res.diagnostics.map((d) => ({
        message: d.message,
        line: d.line ?? -1,
        column: d.column ?? -1,
      }));
      expect(spans, testCase.fixture).toEqual(testCase.expected);
    }
  });
});
