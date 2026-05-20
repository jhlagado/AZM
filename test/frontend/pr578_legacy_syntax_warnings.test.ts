import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseModuleFile } from '../../src/frontend/parser.js';

describe('PR578 legacy syntax removal', () => {
  it('rejects legacy globals/data blocks and section directives', () => {
    const file = 'legacy.zax';
    const source = [
      'globals',
      '  count: byte',
      'end',
      'data',
      '  msg: byte[2] = "hi"',
      'end',
      'section code at $1000',
      '',
    ].join('\n');

    const diagnostics: Diagnostic[] = [];
    parseModuleFile(file, source, diagnostics);

    const messagesByLine = diagnostics.map((d) => ({ line: d.line, message: d.message }));
    expect(messagesByLine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          line: 1,
          message: expect.stringContaining('Legacy "globals ... end"'),
        }),
        expect.objectContaining({
          line: 4,
          message: expect.stringContaining('Legacy top-level "data ... end"'),
        }),
        expect.objectContaining({
          line: 7,
          message: expect.stringContaining('Section blocks are removed'),
        }),
      ]),
    );
    expect(diagnostics.every((d) => d.severity === 'error')).toBe(true);
  });
});
