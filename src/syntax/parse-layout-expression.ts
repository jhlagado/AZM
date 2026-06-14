import type {
  Expression,
  LayoutCastPathPart,
  OffsetPathPart,
  TypeExpr,
} from '../model/expression.js';
import { IDENTIFIER_PATTERN } from './names.js';

export type ParseNestedExpression = (text: string) => Expression | undefined;

interface BracketScanState {
  readonly depth: number;
  readonly quote: string | undefined;
  readonly escaped: boolean;
}

interface ParsedPathPart<T> {
  readonly part: T;
  readonly rest: string;
}

export function parseTypeExpr(text: string): TypeExpr | undefined {
  const trimmed = text.trim();
  const match = new RegExp(`^(${IDENTIFIER_PATTERN})(?:\\[\\s*([0-9]+)\\s*\\])?$`).exec(trimmed);
  if (!match) {
    return undefined;
  }

  const name = match[1] ?? '';
  const lengthText = match[2];
  if (lengthText === undefined) {
    return { name };
  }

  const length = Number.parseInt(lengthText, 10);
  return length >= 0 ? { name, length } : undefined;
}

export function parseLayoutExpression(
  text: string,
  parseNestedExpression: ParseNestedExpression,
): Expression | undefined {
  const trimmed = text.trim();
  const layoutCast = parseLayoutCast(trimmed, parseNestedExpression);
  if (layoutCast) {
    return layoutCast;
  }

  const sizeof = /^sizeof\s*\((.*)\)$/.exec(trimmed);
  if (sizeof) {
    const typeExpr = parseTypeExpr(sizeof[1] ?? '');
    return typeExpr ? { kind: 'sizeof', typeExpr } : undefined;
  }

  const offset = /^offset\s*\((.*),(.*)\)$/.exec(trimmed);
  if (offset) {
    const typeExpr = parseTypeExpr(offset[1] ?? '');
    const path = parseOffsetPath(offset[2] ?? '');
    return typeExpr && path ? { kind: 'offset', typeExpr, path } : undefined;
  }

  return undefined;
}

export function findMatchingBracket(text: string): number | undefined {
  let state: BracketScanState = { depth: 0, quote: undefined, escaped: false };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (state.quote !== undefined) {
      state = scanQuotedBracketChar(char, state);
      continue;
    }

    const quotedState = startBracketQuote(char, state);
    if (quotedState) {
      state = quotedState;
      continue;
    }

    state = scanBracketDepth(char, state);
    if (char === ']') {
      if (state.depth === 0) {
        return index;
      }
    }
  }
  return undefined;
}

function scanQuotedBracketChar(char: string, state: BracketScanState): BracketScanState {
  if (state.escaped) return { ...state, escaped: false };
  if (char === '\\') return { ...state, escaped: true };
  if (char === state.quote) return { ...state, quote: undefined };
  return state;
}

function startBracketQuote(
  char: string,
  state: BracketScanState,
): BracketScanState | undefined {
  return char === '"' || char === "'" ? { ...state, quote: char } : undefined;
}

function scanBracketDepth(char: string, state: BracketScanState): BracketScanState {
  if (char === '[') return { ...state, depth: state.depth + 1 };
  if (char === ']') return { ...state, depth: state.depth - 1 };
  return state;
}

function parseLayoutCast(
  text: string,
  parseNestedExpression: ParseNestedExpression,
): Expression | undefined {
  if (!text.startsWith('<')) {
    return undefined;
  }

  const close = text.indexOf('>');
  if (close <= 1) {
    return undefined;
  }

  const typeExpr = parseTypeExpr(text.slice(1, close));
  if (!typeExpr) {
    return undefined;
  }

  const rest = text.slice(close + 1);
  const base = /^(?:[A-Za-z_$][A-Za-z0-9_$?]*|\?[A-Za-z0-9_$?]+)/.exec(rest);
  if (!base) {
    return undefined;
  }

  const path = parseLayoutCastPath(rest.slice(base[0].length), parseNestedExpression);
  if (!path) {
    return undefined;
  }

  return {
    kind: 'layout-cast',
    typeExpr,
    base: { kind: 'symbol', name: base[0] },
    path,
  };
}

function parseLayoutCastPath(
  text: string,
  parseNestedExpression: ParseNestedExpression,
): readonly LayoutCastPathPart[] | undefined {
  const parts: LayoutCastPathPart[] = [];
  let rest = text.trim();
  while (rest.length > 0) {
    const parsed = parseLayoutCastPathPart(rest, parseNestedExpression);
    if (!parsed) return undefined;
    parts.push(parsed.part);
    rest = parsed.rest.trim();
  }

  return parts.length > 0 ? parts : undefined;
}

function parseLayoutCastPathPart(
  text: string,
  parseNestedExpression: ParseNestedExpression,
): ParsedPathPart<LayoutCastPathPart> | undefined {
  return text.startsWith('.')
    ? parseLayoutCastField(text)
    : parseLayoutCastIndex(text, parseNestedExpression);
}

function parseLayoutCastField(text: string): ParsedPathPart<LayoutCastPathPart> | undefined {
  const field = new RegExp(`^\\.(${IDENTIFIER_PATTERN})`).exec(text);
  return field ? { part: { kind: 'field', name: field[1] ?? '' }, rest: text.slice(field[0].length) } : undefined;
}

function parseLayoutCastIndex(
  text: string,
  parseNestedExpression: ParseNestedExpression,
): ParsedPathPart<LayoutCastPathPart> | undefined {
  if (!text.startsWith('[')) return undefined;
  const close = findMatchingBracket(text);
  if (close === undefined) return undefined;

  const expression = parseNestedExpression(text.slice(1, close));
  return expression
    ? { part: { kind: 'index', expression }, rest: text.slice(close + 1) }
    : undefined;
}

function parseOffsetPath(text: string): readonly OffsetPathPart[] | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parts: OffsetPathPart[] = [];
  let rest = trimmed;
  while (rest.length > 0) {
    const parsed = parseOffsetPathPart(rest);
    if (!parsed) return undefined;
    parts.push(parsed.part);
    rest = parsed.rest;

    if (rest.length === 0) {
      break;
    }
    if (!rest.startsWith('.')) {
      return undefined;
    }
    rest = rest.slice(1);
  }

  return parts.length > 0 ? parts : undefined;
}

function parseOffsetPathPart(text: string): ParsedPathPart<OffsetPathPart> | undefined {
  return text.startsWith('[') ? parseOffsetIndex(text) : parseOffsetField(text);
}

function parseOffsetIndex(text: string): ParsedPathPart<OffsetPathPart> | undefined {
  const index = /^\[\s*([0-9]+)\s*\]/.exec(text);
  return index
    ? {
        part: { kind: 'index', index: Number.parseInt(index[1] ?? '', 10) },
        rest: text.slice(index[0].length),
      }
    : undefined;
}

function parseOffsetField(text: string): ParsedPathPart<OffsetPathPart> | undefined {
  const field = new RegExp(`^${IDENTIFIER_PATTERN}`).exec(text);
  return field
    ? { part: { kind: 'field', name: field[0] }, rest: text.slice(field[0].length) }
    : undefined;
}
