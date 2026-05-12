import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../src/diagnosticTypes.js';
import { parseProgram } from '../src/frontend/parser.js';
import { emitProgram } from '../src/lowering/emit.js';
import { collectNonBankedSectionKeys } from '../src/sectionKeys.js';
import { buildEnv } from '../src/semantics/env.js';

describe('PR582 named section routing integration', () => {
  it('lowers named section functions through contribution sinks instead of the legacy code stream', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr582_named_section_routing.zax',
      [
        'section code boot at $1000',
        '  func helper(): AF, BC, DE, HL',
        '    nonsense',
        '  end',
        'end',
      ].join('\n'),
      diagnostics,
    );

    expect(diagnostics).toEqual([]);
    const sectionKeys = collectNonBankedSectionKeys(program, diagnostics);
    expect(diagnostics).toEqual([]);

    const env = buildEnv(program, diagnostics);
    expect(diagnostics).toEqual([]);

    const { map } = emitProgram(program, env, diagnostics, { namedSectionKeys: sectionKeys });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'Unsupported instruction: nonsense',
      }),
    ]);
    expect(map.bytes.size).toBeGreaterThan(0);
  });
});
