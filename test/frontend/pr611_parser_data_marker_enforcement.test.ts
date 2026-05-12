import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

describe('PR611 parser data marker enforcement', () => {
  it('rejects bare data marker lines inside named sections', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr611_section_data_marker.zax',
      [
        'section data vars',
        '  data',
        '  counter: byte',
        'end',
      ].join('\n'),
      diagnostics,
    );

    const section = program.files[0]?.items[0];
    expect(section).toMatchObject({ kind: 'NamedSection', section: 'data', name: 'vars' });
    if (!section || section.kind !== 'NamedSection') {
      throw new Error('expected named section');
    }
    expect(section.items).toHaveLength(1);
    expect(section.items[0]).toMatchObject({ kind: 'DataDecl', name: 'counter' });

    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      line: 2,
      column: 1,
      message:
        'Bare "data" marker lines are removed; declare symbols directly inside named data sections.',
    });
  });

  it('keeps top-level legacy data blocks as hard errors', () => {
    const diagnostics: Diagnostic[] = [];
    parseProgram(
      'pr611_top_level_data_block.zax',
      ['data', '  msg: byte[] = "HELLO"', 'end'].join('\n'),
      diagnostics,
    );

    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      line: 1,
      column: 1,
      message:
        'Legacy top-level "data ... end" blocks are removed; use direct declarations inside named data sections.',
    });
  });
});
