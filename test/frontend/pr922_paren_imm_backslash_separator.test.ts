import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import { parseProgram } from '../../src/frontend/parser.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { expectDiagnostic, expectNoErrors } from '../helpers/diagnostics.js';

const indexOfSubarray = (haystack: number[], needle: number[]): number => {
  if (needle.length === 0) return 0;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
};

describe('PR922: parenthesized imm indirection and backslash separators', () => {
  it('lowers parenthesized imm expressions as absolute memory indirection', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr922_paren_imm_indirection.zax');
    const res = await compile(
      entry,
      { emitAsm80: true, emitBin: true, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expectNoErrors(res.diagnostics);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    const bytes = Array.from(bin!.bytes);
    expect(indexOfSubarray(bytes, [0x3a, 0x05, 0x00])).toBeGreaterThanOrEqual(0);
    expect(indexOfSubarray(bytes, [0x3a, 0x01, 0x40])).toBeGreaterThanOrEqual(0);
    expect(indexOfSubarray(bytes, [0x3e, 0x06])).toBeGreaterThanOrEqual(0);
  });

  it('splits statements on backslash separators', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr922_backslash_separator.zax');
    const res = await compile(
      entry,
      { emitAsm80: false, emitBin: true, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expectNoErrors(res.diagnostics);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    const bytes = Array.from(bin!.bytes);
    expect(indexOfSubarray(bytes, [0xb7])).toBeGreaterThanOrEqual(0); // OR A
    expect(indexOfSubarray(bytes, [0x20])).toBeGreaterThanOrEqual(0); // JR NZ
  });

  it('diagnoses a trailing backslash separator', () => {
    const diagnostics: Diagnostic[] = [];
    parseProgram(
      'pr922_backslash_trailing.zax',
      ['export func main()', '  ld a, 1 \\', 'end', ''].join('\n'),
      diagnostics,
    );
    expectDiagnostic(diagnostics, {
      messageIncludes: 'Trailing backslash must be followed',
    });
  });

  it('keeps physical line numbers for diagnostics after backslash separators', () => {
    const diagnostics: Diagnostic[] = [];
    parseProgram(
      'pr922_backslash_line_map.zax',
      ['export func main()', '  ld a, 1 \\ ld a, ?', 'end', ''].join('\n'),
      diagnostics,
    );
    expectDiagnostic(diagnostics, { messageIncludes: 'Unsupported operand', line: 2 });
  });

  it('does not treat a tight backslash as a separator', () => {
    const diagnostics: Diagnostic[] = [];
    parseProgram(
      'pr922_backslash_tight.zax',
      ['export func main()', '  ld a, 1\\or a', 'end', ''].join('\n'),
      diagnostics,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
