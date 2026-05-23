import type { OpMatcherNode, OpParamNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { MATCHER_KIND_BY_TYPE, MATCHER_TYPES } from './grammarData.js';

export type ParseParamsContext = {
  isReservedTopLevelName: (name: string) => boolean;
};

function parseOpMatcherFromText(matcherText: string, matcherSpan: SourceSpan): OpMatcherNode {
  const t = matcherText.trim();
  const lower = t.toLowerCase();
  if (!MATCHER_TYPES.has(lower)) return { kind: 'MatcherFixed', span: matcherSpan, token: t };
  return {
    kind: MATCHER_KIND_BY_TYPE[lower as keyof typeof MATCHER_KIND_BY_TYPE],
    span: matcherSpan,
  };
}

export function parseOpParamsFromText(
  filePath: string,
  paramsText: string,
  paramsSpan: SourceSpan,
  diagnostics: Diagnostic[],
  ctx: ParseParamsContext,
): OpParamNode[] | undefined {
  const trimmed = paramsText.trim();
  if (trimmed.length === 0) return [];

  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) {
    diag(
      diagnostics,
      filePath,
      `Invalid op parameter list: trailing or empty entries are not permitted.`,
      {
        line: paramsSpan.start.line,
        column: paramsSpan.start.column,
      },
    );
    return undefined;
  }
  const out: OpParamNode[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/.exec(part);
    if (!m) {
      diag(diagnostics, filePath, `Invalid op parameter declaration: expected <name> <matcher>`, {
        line: paramsSpan.start.line,
        column: paramsSpan.start.column,
      });
      return undefined;
    }

    const name = m[1]!;
    if (ctx.isReservedTopLevelName(name)) {
      diag(
        diagnostics,
        filePath,
        `Invalid op parameter name "${name}": collides with a top-level keyword.`,
        {
          line: paramsSpan.start.line,
          column: paramsSpan.start.column,
        },
      );
      return undefined;
    }
    const lower = name.toLowerCase();
    if (seen.has(lower)) {
      diag(diagnostics, filePath, `Duplicate op parameter name "${name}".`, {
        line: paramsSpan.start.line,
        column: paramsSpan.start.column,
      });
      return undefined;
    }
    seen.add(lower);
    const matcherText = m[2]!.trim();
    out.push({
      kind: 'OpParam',
      span: paramsSpan,
      name,
      matcher: parseOpMatcherFromText(matcherText, paramsSpan),
    });
  }
  return out;
}
