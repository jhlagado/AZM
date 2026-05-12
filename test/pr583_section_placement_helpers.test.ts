import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../src/diagnosticTypes.js';
import type { Diagnostic } from '../src/diagnosticTypes.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';
import type { AnchorBoundNode, NamedSectionNode } from '../src/frontend/ast.js';
import { parseProgram } from '../src/frontend/parser.js';
import { emitProgram } from '../src/lowering/emit.js';
import { placeNonBankedSectionContributions } from '../src/lowering/sectionPlacement.js';
import type { NamedSectionContributionSink } from '../src/lowering/sectionContributions.js';
import { collectNonBankedSectionKeys, createNonBankedSectionKey } from '../src/sectionKeys.js';
import { buildEnv } from '../src/semantics/env.js';

function makeSink(
  section: 'code' | 'data',
  name: string,
  at: number,
  offset: number,
  bound: AnchorBoundNode = { kind: 'none' },
): NamedSectionContributionSink {
  const span = {
    file: `${name}.zax`,
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
  const node = ({
    kind: 'NamedSection',
    section,
    name,
    anchor: {
      kind: 'SectionAnchor',
      span,
      at: {
        kind: 'ImmLiteral',
        value: at,
        span,
      },
      bound,
    },
    items: [],
    span,
  } as unknown) as NamedSectionNode;

  const created = createNonBankedSectionKey(section, name);
  if (!created) {
    throw new Error(`Invalid section key test fixture: ${section} ${name}`);
  }

  return {
    contribution: {
      key: created.key,
      keyId: created.keyId,
      moduleIndex: 0,
      itemIndex: 0,
      order: 0,
      node,
    },
    anchor: {
      key: created.key,
      keyId: created.keyId,
      moduleIndex: 0,
      itemIndex: 0,
      order: 0,
      node,
    },
    bytes: new Map(),
    offset,
    pendingSymbols: [],
    fixups: [],
    rel8Fixups: [],
    sourceSegments: [],
    currentSourceTag: undefined,
    startupInitActions: [],
  };
}

describe('PR583 section placement helpers', () => {
  it('places contributions sequentially by key anchor', () => {
    const diagnostics: Diagnostic[] = [];
    const sinks = [makeSink('code', 'boot', 0x1000, 3), makeSink('code', 'boot', 0x1000, 5)];

    const { placedContributions, placedRegions } = placeNonBankedSectionContributions(sinks, {
      diagnostics,
      env: {} as never,
      evalImmExpr: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
    });

    expect(diagnostics).toEqual([]);
    expect(placedContributions.map((p) => p.baseAddress)).toEqual([0x1000, 0x1003]);
    expect(placedRegions).toEqual([
      expect.objectContaining({
        baseAddress: 0x1000,
        totalSize: 8,
        endAddress: 0x1007,
      }),
    ]);
  });

  it('treats section kind as part of key identity for placement', () => {
    const diagnostics: Diagnostic[] = [];
    const sinks = [makeSink('code', 'shared', 0x1000, 1), makeSink('data', 'shared', 0x2000, 2)];

    const { placedContributions, placedRegions } = placeNonBankedSectionContributions(sinks, {
      diagnostics,
      env: {} as never,
      evalImmExpr: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
    });

    expect(diagnostics).toEqual([]);
    expect(placedContributions.map((p) => p.baseAddress)).toEqual([0x1000, 0x2000]);
    expect(
      placedRegions.map((region) => [region.section, region.name, region.baseAddress, region.totalSize]),
    ).toEqual([
      ['code', 'shared', 0x1000, 1],
      ['data', 'shared', 0x2000, 2],
    ]);
  });

  it('still finalizes legacy output when named sections are present', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr583_mixed_sections.zax',
      [
        'func main(): AF, BC, DE, HL',
        '  ret',
        'end',
        'section code boot at $1000',
        '  func helper(): AF, BC, DE, HL',
        '    ret',
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

    expect(diagnostics).toEqual([]);
    expect(map.bytes.get(0)).toBe(0xc9);
    expect(map.bytes.get(0x1000)).toBe(0xc9);
  });

  it('handles end-bounded anchors when computing capacity', () => {
    const diagnostics: Diagnostic[] = [];
    const endSpan = {
      file: 'boot.zax',
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    };
    const sinks = [makeSink('code', 'boot', 0x1000, 2, {
      kind: 'end',
      end: { kind: 'ImmLiteral', value: 0x1000, span: endSpan },
    })];

    placeNonBankedSectionContributions(sinks, {
      diagnostics,
      env: {} as never,
      evalImmExpr: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
    });

    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: 'Section "code boot" exceeds its anchored capacity',
    });
  });
});
