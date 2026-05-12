import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

describe('PR572 named section parser scaffolding', () => {
  it('parses named sections with anchors and section-contained declarations', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr572_named_sections.zax',
      [
        'section data assets at $1000 size $40',
        '  align $10',
        '  export const Version = 1',
        '    message: byte[3] = "abc"',
        'end',
      ].join('\n'),
      diagnostics,
    );

    expect(diagnostics).toEqual([]);
    const section = program.files[0]?.items[0];
    expect(section).toMatchObject({
      kind: 'NamedSection',
      section: 'data',
      name: 'assets',
      anchor: {
        kind: 'SectionAnchor',
        at: { kind: 'ImmLiteral', value: 0x1000 },
        bound: { kind: 'size', size: { kind: 'ImmLiteral', value: 0x40 } },
      },
    });
    if (!section || section.kind !== 'NamedSection') {
      throw new Error('expected named section');
    }
    expect(section.items).toHaveLength(3);
    expect(section.items[0]).toMatchObject({ kind: 'Align' });
    expect(section.items[1]).toMatchObject({
      kind: 'ConstDecl',
      name: 'Version',
      exported: true,
    });
    expect(section.items[2]).toMatchObject({ kind: 'DataDecl', name: 'message' });
  });

  it('parses named-section anchors with end bounds', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr639_named_section_end_anchor.zax',
      ['section code boot at $2000 end $20ff', 'end'].join('\n'),
      diagnostics,
    );

    expect(diagnostics).toEqual([]);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'NamedSection',
      section: 'code',
      name: 'boot',
      anchor: {
        kind: 'SectionAnchor',
        at: { kind: 'ImmLiteral', value: 0x2000 },
        bound: { kind: 'end', end: { kind: 'ImmLiteral', value: 0x20ff } },
      },
    });
  });

  it('keeps imports module-scoped and rejects legacy section directives', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr572_section_scope.zax',
      [
        'section data buffers',
        '  import "dep.zax"',
        '  align $08',
        'end',
        'section data at $2000',
      ].join('\n'),
      diagnostics,
    );

    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'NamedSection',
      section: 'data',
      name: 'buffers',
    });
    expect(program.files[0]?.items).toHaveLength(1);
    expect(diagnostics).toHaveLength(2);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'import is only permitted at module scope',
      line: 2,
      column: 1,
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message:
        'Legacy active-counter section directive "section data at ..." is removed; use a named section like "section data <name> at ..." instead.',
      line: 5,
      column: 1,
    });
  });

  it('applies top-level export target rules inside named sections', () => {
    const diagnostics: Diagnostic[] = [];
    parseProgram(
      'pr572_section_exports.zax',
      [
        'section data buffers',
        '  export bin blob in data from "blob.bin"',
        'end',
      ].join('\n'),
      diagnostics,
    );

    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'export not supported on bin declarations',
      line: 2,
      column: 1,
    });
  });
});
