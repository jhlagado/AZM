import { expandCarrierList } from './carriers.js';
import type { SmartComment } from './types.js';

const COMPACT_SOURCE_TAG_RE = /^;?\s*!\s*(in|out|clobbers|preserves)(?:\s+(.+))?$/i;
const COMPACT_SOURCE_LINE_RE = /^\s*;\s*!\s*(?:in|out|maybe-out|clobbers|preserves)(?:\s|$)/i;
const CARRIER_RE = /^\{([^}]+)\}(?:\s+(.+))?$/;
const CONTRACT_COMMENT_KINDS = new Set(['in', 'out', 'clobbers', 'preserves']);

function parseCarrierPayload(
  rest: string | undefined,
): { carriers: string[]; name?: string } | undefined {
  if (!rest) return undefined;

  const match = CARRIER_RE.exec(rest.trim());
  if (match) {
    const carriers = match[1]!
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const name = match[2]?.trim();
    return { carriers, ...(name ? { name } : {}) };
  }

  const tokens = rest.trim().split(/\s+/u);
  const carriers: string[] = [];
  let consumed = 0;
  for (const token of tokens) {
    const cleaned = token.replace(/[.:;]+$/u, '');
    const parts = cleaned
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (parts.length === 0 || !expandCarrierList(parts)) break;
    carriers.push(...parts);
    consumed += 1;
  }

  if (carriers.length === 0) return undefined;
  const name = tokens.slice(consumed).join(' ').trim();
  return { carriers, ...(name ? { name } : {}) };
}

export function parseSmartCommentLine(line: string): SmartComment | undefined {
  const trimmed = line.trim();
  const expectOut = parseExpectOutComment(trimmed);
  if (expectOut !== undefined) return expectOut;

  const match = COMPACT_SOURCE_TAG_RE.exec(trimmed);
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase();
  if (!CONTRACT_COMMENT_KINDS.has(tag)) return undefined;
  return parseCarrierComment(tag as SmartComment['kind'], match[2]?.trim());
}

function parseExpectOutComment(trimmed: string): SmartComment | undefined {
  const expectOut = /^;?\s*expects\s+out\s+(.+)$/i.exec(trimmed);
  if (expectOut === null) return undefined;
  return parseCarrierComment('expectOut', expectOut[1]?.trim());
}

function parseCarrierComment(
  kind: SmartComment['kind'],
  rest: string | undefined,
): SmartComment | undefined {
  const payload = parseCarrierPayload(rest);
  if (!payload) return undefined;
  const carriers = expandCarrierList(payload.carriers);
  if (!carriers || carriers.length === 0) return undefined;
  return buildCarrierComment(kind, carriers, payload.name);
}

function buildCarrierComment(
  kind: SmartComment['kind'],
  carriers: NonNullable<ReturnType<typeof expandCarrierList>>,
  name: string | undefined,
): SmartComment | undefined {
  if (isUnnamedCarrierCommentKind(kind)) return { kind, carriers };
  if (isNamedCarrierCommentKind(kind)) return { kind, carriers, ...(name ? { name } : {}) };
  return undefined;
}

function isUnnamedCarrierCommentKind(kind: SmartComment['kind']): kind is 'clobbers' | 'preserves' {
  return kind === 'clobbers' || kind === 'preserves';
}

function isNamedCarrierCommentKind(kind: SmartComment['kind']): kind is 'expectOut' | 'in' | 'out' {
  return kind === 'in' || kind === 'out' || kind === 'expectOut';
}

export function isCompactSourceCommentLine(line: string): boolean {
  return COMPACT_SOURCE_LINE_RE.test(line);
}
