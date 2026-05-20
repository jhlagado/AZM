import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseModuleFile } from '../../src/frontend/parser.js';

describe('PR578 legacy syntax removal', () => {
  it('rejects legacy globals and data blocks through ordinary parser diagnostics', () => {
    const file = 'legacy.zax';
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
          message: expect.stringContaining('Legacy "globals ... end"'),
        }),
        expect.objectContaining({
          line: 5,
          message: expect.stringContaining('Legacy top-level "data ... end"'),
        }),
        expect.objectContaining({
          line: 7,
          message: expect.stringContaining('Invalid data declaration line "end"'),
        }),
      ]),
    );
    expect(diagnostics.every((d) => d.severity === 'error')).toBe(true);
  });
});
