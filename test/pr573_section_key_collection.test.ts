import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../src/diagnosticTypes.js';
import type { Diagnostic } from '../src/diagnosticTypes.js';
import { parseProgram } from '../src/frontend/parser.js';
import { collectNonBankedSectionKeys, createNonBankedSectionKey } from '../src/sectionKeys.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';

describe('PR573 non-banked section key collection', () => {
  it('validates the section key constructor boundary', () => {
    const valid = createNonBankedSectionKey('code', 'boot');
    expect(valid).toMatchObject({
      key: {
        section: 'code',
        name: 'boot',
      },
    });
    expect(valid?.keyId).toBe('code\u0000boot');

    expect(createNonBankedSectionKey('code', '')).toBeUndefined();
    expect(createNonBankedSectionKey('code', 'a\u0000b')).toBeUndefined();
    expect(createNonBankedSectionKey('rom', 'boot')).toBeUndefined();
  });

  it('preserves deterministic contribution order and reports duplicate anchors', () => {
    const rootDiagnostics: Diagnostic[] = [];
    const root = parseProgram(
      'root.zax',
      ['section code shared', '  align $10', 'end', 'section code shared at $1000', 'end'].join(
        '\n',
      ),
      rootDiagnostics,
    );
    expect(rootDiagnostics).toEqual([]);

    const depDiagnostics: Diagnostic[] = [];
    const dep = parseProgram(
      'dep.zax',
      ['section code shared', '  align $20', 'end', 'section code shared at $1200', 'end'].join(
        '\n',
      ),
      depDiagnostics,
    );
    expect(depDiagnostics).toEqual([]);

    const diagnostics: Diagnostic[] = [];
    const collected = collectNonBankedSectionKeys(
      {
        kind: 'Program',
        span: root.span,
        entryFile: root.entryFile,
        files: [dep.files[0]!, root.files[0]!],
      },
      diagnostics,
      ['root.zax', 'dep.zax'],
    );

    expect(
      collected.orderedContributions.map((entry) => [
        entry.key.section,
        entry.key.name,
        entry.node.span.file,
        entry.order,
      ]),
    ).toEqual([
      ['code', 'shared', 'root.zax', 0],
      ['code', 'shared', 'dep.zax', 1],
    ]);
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      file: 'dep.zax',
      line: 4,
      column: 1,
      message: 'Duplicate anchor for section "code shared".',
    });
  });

  it('reports missing anchors for contributed keys', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'missing-anchor.zax',
      ['section data assets', '  align $08', 'end'].join('\n'),
      diagnostics,
    );
    expect(diagnostics).toEqual([]);

    collectNonBankedSectionKeys(program, diagnostics);

    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      file: 'missing-anchor.zax',
      line: 1,
      column: 1,
      message: 'Missing anchor for section "data assets".',
    });
  });

  it('warns on anchors with no contributions', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'empty-anchor.zax',
      ['section code boot at $1000', 'end'].join('\n'),
      diagnostics,
    );
    expect(diagnostics).toEqual([]);

    const collected = collectNonBankedSectionKeys(program, diagnostics);

    expect(collected.orderedAnchors).toHaveLength(1);
    expect(collected.orderedContributions).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EmitWarning,
      severity: 'warning',
      file: 'empty-anchor.zax',
      line: 1,
      column: 1,
      message: 'Anchor for section "code boot" has no contributions.',
    });
  });

  it('treats section kind as part of key identity during collection', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'key-kind-safety.zax',
      [
        'section code shared',
        '  align $10',
        'end',
        'section code shared at $1000',
        'end',
        'section data shared',
        '  align $10',
        'end',
        'section data shared at $2000',
        'end',
      ].join('\n'),
      diagnostics,
    );
    expect(diagnostics).toEqual([]);

    const collected = collectNonBankedSectionKeys(program, diagnostics);

    expect(diagnostics).toEqual([]);
    expect(collected.contributionsByKey.size).toBe(2);
    expect(collected.anchorsByKey.size).toBe(2);
    expect(collected.orderedContributions.map((entry) => [entry.key.section, entry.key.name])).toEqual([
      ['code', 'shared'],
      ['data', 'shared'],
    ]);
    expect(collected.orderedAnchors.map((entry) => [entry.key.section, entry.key.name])).toEqual([
      ['code', 'shared'],
      ['data', 'shared'],
    ]);
  });
});
