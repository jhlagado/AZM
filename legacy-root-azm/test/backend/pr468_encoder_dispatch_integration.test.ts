import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { encodeInstruction } from '../../src/z80/encode.js';
import { encoderEnv as env, imm, instruction, portImm, reg } from './encoderTestHelpers.js';

describe('PR468 encoder dispatcher integration coverage', () => {
  it('keeps the extracted encoder families coherent through the shared dispatcher', () => {
    const diagnostics: Diagnostic[] = [];
    const program = [
      instruction('ld', [reg('BC'), imm(0x1234)]),
      instruction('add', [reg('A'), reg('B')]),
      instruction('bit', [imm(3), reg('A')]),
      instruction('in', [reg('A'), portImm(0x12)]),
      instruction('jr', [reg('NZ'), imm(-2)]),
      instruction('inc', [reg('IXL')]),
    ];

    const encoded = program.flatMap((node) =>
      Array.from(encodeInstruction(node, env, diagnostics) ?? []),
    );

    expect(diagnostics).toEqual([]);
    expect(encoded).toEqual([
      0x01,
      0x34,
      0x12, // ld bc,$1234
      0x80, // add a,b
      0xcb,
      0x5f, // bit 3,a
      0xdb,
      0x12, // in a,($12)
      0x20,
      0xfe, // jr nz,-2
      0xdd,
      0x2c, // inc ixl
    ]);
  });
});
