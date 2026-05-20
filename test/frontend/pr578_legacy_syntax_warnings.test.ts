import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseModuleFile } from '../../src/frontend/parser.js';

describe('PR578 legacy syntax removal', () => {
  it('lets legacy globals and data blocks fall through ordinary parser diagnostics', () => {
    const file = 'legacy.asm';
    const source = [
      'section code at $1000',
      'globals',
      '  count: byte',
      'end',
      'data',
      '  msg: byte[2] = "hi"',
      'end',
      '',
    ].join('\n');

    const diagnostics: Diagnostic[] = [];
    parseModuleFile(file, source, diagnostics);

    const messagesByLine = diagnostics.map((d) => ({ line: d.line, message: d.message }));
    expect(messagesByLine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          line: 2,
          message: 'Unsupported top-level construct: globals',
        }),
        expect.objectContaining({
          line: 5,
          message: 'Unsupported top-level construct: data',
        }),
        expect.objectContaining({
          line: 7,
          message: 'Unsupported top-level construct: end',
        }),
      ]),
    );
    expect(diagnostics.every((d) => d.severity === 'error')).toBe(true);
  });
});
