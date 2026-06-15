import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { DataValue } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { parseWholeQuotedString } from './parse-declaration-directives.js';
import { parseLineError } from './parse-diagnostics.js';
import { parseExpression, parseTypeExpr } from './parse-expression.js';
import type { ParseLineResult } from './parse-line.js';

export function parseDataDirective(
  line: LogicalLine,
  directiveText: string,
  valueText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const directive = directiveText.slice(1).toLowerCase() as 'db' | 'dw';
  const parts = splitValueList(valueText);
  const values =
    directive === 'db'
      ? parts.map(parseDataValue).filter((value) => value !== undefined)
      : parts.map(parseExpression).filter((value) => value !== undefined);
  if (values.length !== parts.length) {
    return {
      items: [],
      diagnostics: [parseLineError(line, `invalid .${directive} value list`)],
    };
  }
  return {
    items:
      directive === 'db'
        ? [{ kind: 'db', values: values as DataValue[], span }]
        : [{ kind: 'dw', values: values as Expression[], span }],
    diagnostics: [],
  };
}

export function parseDsDirective(
  line: LogicalLine,
  valueText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const parts = splitValueList(valueText);
  const listDiagnostic = validateDsValueList(line, parts);
  if (listDiagnostic) {
    return { items: [], diagnostics: [listDiagnostic] };
  }

  const sizeResult = parseDsSize(line, parts[0] ?? '');
  if (sizeResult.diagnostic) {
    return { items: [], diagnostics: [sizeResult.diagnostic] };
  }

  const fillResult = parseDsFill(line, parts[1]);
  if (fillResult.diagnostic) {
    return { items: [], diagnostics: [fillResult.diagnostic] };
  }

  return {
    items: [
      fillResult.fill === undefined
        ? { kind: 'ds', size: sizeResult.size, span }
        : { kind: 'ds', size: sizeResult.size, fill: fillResult.fill, span },
    ],
    diagnostics: [],
  };
}

export function parseStringDataDirective(
  line: LogicalLine,
  directive: 'cstr' | 'istr' | 'pstr',
  valueText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const value = parseQuotedString(valueText);
  if (value === undefined) {
    return {
      items: [],
      diagnostics: [parseLineError(line, `.${directive} expects one double-quoted string`)],
    };
  }
  return { items: [{ kind: 'string-data', directive, value, span }], diagnostics: [] };
}

function validateDsValueList(line: LogicalLine, parts: readonly string[]): Diagnostic | undefined {
  return parts.length < 1 || parts.length > 2
    ? parseLineError(line, `invalid .ds value list`)
    : undefined;
}

function parseDsSize(
  line: LogicalLine,
  sizeText: string,
):
  | { readonly size: Expression; readonly diagnostic?: undefined }
  | { readonly diagnostic: Diagnostic } {
  const size = parseTypeSizeExpression(sizeText) ?? parseExpression(sizeText);
  if (!size) {
    return {
      diagnostic: parseLineError(line, `invalid .ds size: ${sizeText}`),
    };
  }
  return { size };
}

function parseDsFill(
  line: LogicalLine,
  fillText: string | undefined,
):
  | { readonly fill: Expression | undefined; readonly diagnostic?: undefined }
  | { readonly diagnostic: Diagnostic } {
  if (fillText === undefined) return { fill: undefined };
  const fill = parseExpression(fillText);
  if (!fill) {
    return {
      diagnostic: parseLineError(line, `invalid .ds fill: ${fillText}`),
    };
  }
  return { fill };
}

function parseTypeSizeExpression(text: string): Expression | undefined {
  const typeExpr = parseTypeExpr(text);
  return typeExpr ? { kind: 'type-size', typeExpr } : undefined;
}

function splitValueList(text: string): string[] {
  const values: string[] = [];
  let state: ValueListScanState = { quote: undefined, escaped: false, parenDepth: 0 };
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (isValueSeparator(text[index] ?? '', state)) {
      values.push(text.slice(start, index));
      start = index + 1;
      continue;
    }
    state = scanValueListChar(text[index] ?? '', state);
  }
  values.push(text.slice(start));
  return values;
}

interface ValueListScanState {
  readonly quote: string | undefined;
  readonly escaped: boolean;
  readonly parenDepth: number;
}

function isValueSeparator(char: string, state: ValueListScanState): boolean {
  return char === ',' && state.quote === undefined && state.parenDepth === 0;
}

function scanValueListChar(char: string, state: ValueListScanState): ValueListScanState {
  const escapedState = scanEscapedValueListChar(char, state);
  if (escapedState) return escapedState;

  const quotedState = scanQuotedValueListChar(char, state);
  if (quotedState) return quotedState;

  return scanParenthesizedValueListChar(char, state);
}

function scanEscapedValueListChar(
  char: string,
  state: ValueListScanState,
): ValueListScanState | undefined {
  if (state.escaped) return { ...state, escaped: false };
  if (char === '\\' && state.quote !== undefined) return { ...state, escaped: true };
  return undefined;
}

function scanQuotedValueListChar(
  char: string,
  state: ValueListScanState,
): ValueListScanState | undefined {
  if (char !== '"' && char !== "'") return undefined;
  return { ...state, quote: state.quote === char ? undefined : (state.quote ?? char) };
}

function scanParenthesizedValueListChar(
  char: string,
  state: ValueListScanState,
): ValueListScanState {
  if (state.quote !== undefined) return state;
  if (char === '(') return { ...state, parenDepth: state.parenDepth + 1 };
  if (char === ')') return { ...state, parenDepth: Math.max(0, state.parenDepth - 1) };
  return state;
}

function parseQuotedString(text: string): string | undefined {
  const input = text.trim();
  if (input[0] !== '"' || input[input.length - 1] !== '"') {
    return undefined;
  }
  return parseWholeQuotedString(input);
}

function parseDataValue(text: string): DataValue | undefined {
  const expression = parseExpression(text);
  if (expression) {
    return expression;
  }

  const value = parseWholeQuotedString(text);
  return value === undefined ? undefined : { kind: 'string-fragment', value };
}
