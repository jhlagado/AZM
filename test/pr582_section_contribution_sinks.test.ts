import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../src/diagnosticTypes.js';
import { parseProgram } from '../src/frontend/parser.js';
import { createNamedSectionContributionSinks } from '../src/lowering/sectionContributions.js';
import { collectNonBankedSectionKeys } from '../src/sectionKeys.js';

describe('PR582 named section contribution sinks', () => {
  it('creates ordered sinks from collected non-banked section keys', () => {
    const rootDiagnostics: Diagnostic[] = [];
    const root = parseProgram(
      'root.zax',
      [
        'section code boot',
        '  export func main()',
        '    ret',
        '  end',
        'end',
        'section code boot at $1000',
        'end',
      ].join('\n'),
      rootDiagnostics,
    );
    expect(rootDiagnostics).toEqual([]);

    const depDiagnostics: Diagnostic[] = [];
    const dep = parseProgram(
      'dep.zax',
      [
        'section code boot',
        '  export func helper()',
        '    ret',
        '  end',
        'end',
      ].join('\n'),
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
    expect(diagnostics).toEqual([]);

    const sinks = createNamedSectionContributionSinks(collected);

    expect(sinks).toHaveLength(2);
    expect(sinks.map((sink) => sink.contribution.node.span.file)).toEqual(['root.zax', 'dep.zax']);
    expect(sinks.map((sink) => sink.anchor.node.span.file)).toEqual(['root.zax', 'root.zax']);
    for (const sink of sinks) {
      expect(sink.bytes.size).toBe(0);
      expect(sink.offset).toBe(0);
      expect(sink.pendingSymbols).toEqual([]);
      expect(sink.fixups).toEqual([]);
      expect(sink.rel8Fixups).toEqual([]);
      expect(sink.sourceSegments).toEqual([]);
      expect(sink.currentSourceTag).toBeUndefined();
    }
  });
});
