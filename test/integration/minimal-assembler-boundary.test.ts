import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('minimal flat assembler boundary cases', () => {
  it('rejects Stage 7 type-name namespace collisions', () => {
    const typeEquateCollision = compileNext(`
Point .type
x .byte
.endtype
point .equ 7
`);

    expect(typeEquateCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate symbol: point' }),
    ]);

    const typeLabelCollision = compileNext(`
Point .type
x .byte
.endtype
point:
`);

    expect(typeLabelCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate symbol: point' }),
    ]);

    const typeEnumCollision = compileNext(`
Mode .type
x .byte
.endtype
mode .enum Read
`);

    expect(typeEnumCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate enum name: mode' }),
    ]);

    const enumTypeCollision = compileNext(`
mode .enum Read
Mode .type
x .byte
.endtype
`);

    expect(enumTypeCollision.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate type name: Mode' }),
    ]);
  });

  it('reports unsupported source lines as diagnostics', () => {
    const result = compileNext('UNKNOWN');

    expect(result.diagnostics).toEqual([
      {
        code: 'AZMN_PARSE',
        column: 1,
        line: 1,
        message: 'unsupported source line: UNKNOWN',
        severity: 'error',
        sourceName: '<memory>',
      },
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });
});

