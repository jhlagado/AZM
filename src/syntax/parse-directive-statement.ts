import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { DataValue } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import type { SourceSpan } from '../source/source-span.js';
import { parseExpression, parseTypeExpr } from './parse-expression.js';
import type { ParseLineResult } from './parse-line.js';

type DirectiveParser = {
  readonly pattern: RegExp;
  readonly parse: (line: LogicalLine, match: RegExpExecArray, span: SourceSpan) => ParseLineResult;
};

const DIRECTIVE_PARSERS: readonly DirectiveParser[] = [
  {
    pattern: /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+\.equ\s+(.+)$/,
    parse: (line, match, span) => parseEquItem(line, match[1] ?? '', match[2] ?? '', span),
  },
  {
    pattern: /^\.org\s+(.+)$/,
    parse: (line, match, span) => parseExpressionDirective(line, 'org', match[1] ?? '', span),
  },
  {
    pattern: /^enum\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/,
    parse: (line, match) => ({
      items: [],
      diagnostics: [parseError(line, `Use "${match[1] ?? ''} .enum ..." for enums.`)],
    }),
  },
  {
    pattern: /^([A-Za-z_][A-Za-z0-9_]*)\s+\.enum\s+(.+)$/,
    parse: (line, match, span) => parseEnumItem(line, match[1] ?? '', match[2] ?? '', span),
  },
  {
    pattern: /^(\.db|\.dw)\s+(.+)$/,
    parse: (line, match, span) => parseDataDirective(line, match[1] ?? '', match[2] ?? '', span),
  },
  {
    pattern: /^\.ds\s+(.+)$/,
    parse: (line, match, span) => parseDsDirective(line, match[1] ?? '', span),
  },
  {
    pattern: /^\.align\s+(.+)$/,
    parse: (line, match, span) => parseExpressionDirective(line, 'align', match[1] ?? '', span),
  },
  {
    pattern: /^\.end\s*$/,
    parse: (_line, _match, span) => ({ items: [{ kind: 'end', span }], diagnostics: [] }),
  },
  {
    pattern: /^(\.binfrom|\.binto)\s+(.+)$/,
    parse: (line, match, span) =>
      parseExpressionDirective(
        line,
        (match[1] ?? '').slice(1).toLowerCase() as 'binfrom' | 'binto',
        match[2] ?? '',
        span,
      ),
  },
  {
    pattern: /^(\.cstr|\.pstr|\.istr)\s+(.+)$/,
    parse: (line, match, span) =>
      parseStringDataDirective(
        line,
        (match[1] ?? '').slice(1).toLowerCase() as 'cstr' | 'pstr' | 'istr',
        match[2] ?? '',
        span,
      ),
  },
];

export function parseDirectiveStatement(
  line: LogicalLine,
  text: string,
  span: SourceSpan,
): ParseLineResult | undefined {
  for (const parser of DIRECTIVE_PARSERS) {
    const match = parser.pattern.exec(text);
    if (match) {
      return parser.parse(line, match, span);
    }
  }
  return undefined;
}

export function parseColonDeclaration(
  line: LogicalLine,
  name: string,
  statementText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult | undefined {
  const equ = /^\.equ\s+(.+)$/.exec(statementText);
  if (equ) {
    return parseEquItem(line, name, equ[1] ?? '', span);
  }
  const enumDecl = /^\.enum\s+(.+)$/.exec(statementText);
  if (enumDecl) {
    return parseEnumItem(line, name, enumDecl[1] ?? '', span);
  }
  return undefined;
}

function parseEquItem(
  line: LogicalLine,
  name: string,
  expressionText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const stringValue = parseWholeQuotedString(expressionText.trim());
  const expression =
    stringValue !== undefined && stringValue.length > 1
      ? { kind: 'number' as const, value: 0 }
      : parseExpression(expressionText);
  if (!expression) {
    return {
      items: [],
      diagnostics: [parseError(line, `invalid .equ expression: ${expressionText}`)],
    };
  }
  return {
    items: [
      {
        kind: 'equ',
        name,
        expression,
        ...(stringValue !== undefined && stringValue.length > 1 ? { stringValue } : {}),
        span,
      },
    ],
    diagnostics: [],
  };
}

function parseExpressionDirective(
  line: LogicalLine,
  kind: 'align' | 'binfrom' | 'binto' | 'org',
  expressionText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const expression = parseExpression(expressionText);
  if (!expression) {
    return {
      items: [],
      diagnostics: [parseError(line, `invalid .${kind} expression: ${expressionText}`)],
    };
  }
  if (kind === 'align') {
    return { items: [{ kind, alignment: expression, span }], diagnostics: [] };
  }
  return { items: [{ kind, expression, span }], diagnostics: [] };
}

function parseDataDirective(
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
      diagnostics: [parseError(line, `invalid .${directive} value list`)],
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

function parseDsDirective(
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

function validateDsValueList(line: LogicalLine, parts: readonly string[]): Diagnostic | undefined {
  return parts.length < 1 || parts.length > 2
    ? parseError(line, `invalid .ds value list`)
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
      diagnostic: parseError(line, `invalid .ds size: ${sizeText}`),
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
      diagnostic: parseError(line, `invalid .ds fill: ${fillText}`),
    };
  }
  return { fill };
}

function parseStringDataDirective(
  line: LogicalLine,
  directive: 'cstr' | 'istr' | 'pstr',
  valueText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const value = parseQuotedString(valueText);
  if (value === undefined) {
    return {
      items: [],
      diagnostics: [parseError(line, `.${directive} expects one double-quoted string`)],
    };
  }
  return { items: [{ kind: 'string-data', directive, value, span }], diagnostics: [] };
}

function parseEnumItem(
  line: LogicalLine,
  name: string,
  membersText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const rawMembers = membersText.split(',').map((member) => member.trim());
  if (membersText.trim().length === 0 || rawMembers.some((member) => member.length === 0)) {
    return {
      items: [],
      diagnostics: [parseError(line, `invalid enum member list`)],
    };
  }

  const members: string[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const member of rawMembers) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(member)) {
      diagnostics.push(
        parseError(line, `Invalid enum member name "${member}": expected <identifier>.`),
      );
      continue;
    }
    members.push(member);
  }
  if (diagnostics.length > 0) {
    return { items: [], diagnostics };
  }
  return { items: [{ kind: 'enum', name, members, span }], diagnostics: [] };
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
  return parseQuotedStringWithQuotes(text, new Set(['"']));
}

function parseWholeQuotedString(text: string): string | undefined {
  return parseQuotedStringWithQuotes(text, new Set(['"', "'"]));
}

function parseQuotedStringWithQuotes(
  text: string,
  allowedQuotes: ReadonlySet<string>,
): string | undefined {
  const input = text.trim();
  const quote = input[0];
  if (!quote || !allowedQuotes.has(quote) || input[input.length - 1] !== quote) {
    return undefined;
  }

  return parseQuotedStringContent(input, quote);
}

function parseQuotedStringContent(input: string, quote: string): string | undefined {
  let value = '';
  for (let index = 1; index < input.length - 1; index += 1) {
    const char = input[index] ?? '';
    if (char === '\\') {
      if (index + 1 >= input.length - 1) {
        return undefined;
      }
      value += input[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (char === quote) {
      return undefined;
    }
    value += char;
  }
  return value;
}

function parseDataValue(text: string): DataValue | undefined {
  const expression = parseExpression(text);
  if (expression) {
    return expression;
  }

  const value = parseWholeQuotedString(text);
  return value === undefined ? undefined : { kind: 'string-fragment', value };
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}

function parseError(line: LogicalLine, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_PARSE',
    message,
    sourceName: line.sourceName,
    line: line.line,
    column: firstColumn(line.text),
  };
}
