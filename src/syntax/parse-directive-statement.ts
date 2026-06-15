import type { LogicalLine } from '../source/logical-lines.js';
import type { SourceSpan } from '../source/source-span.js';
import { IDENTIFIER_PATTERN, LABEL_NAME_PATTERN } from './names.js';
import { parseEnumItem, parseEquItem } from './parse-declaration-directives.js';
import {
  parseDataDirective,
  parseDsDirective,
  parseStringDataDirective,
} from './parse-data-directives.js';
import { parseExpressionDirective } from './parse-location-directives.js';
import type { ParseLineResult } from './parse-line.js';

type DirectiveParser = {
  readonly pattern: RegExp;
  readonly parse: (line: LogicalLine, match: RegExpExecArray, span: SourceSpan) => ParseLineResult;
};

const DIRECTIVE_PARSERS: readonly DirectiveParser[] = [
  {
    pattern: new RegExp(`^(${LABEL_NAME_PATTERN})\\s+\\.equ\\s+(.+)$`),
    parse: (line, match, span) => parseEquItem(line, match[1] ?? '', match[2] ?? '', span),
  },
  {
    pattern: /^\.org\s+(.+)$/,
    parse: (line, match, span) => parseExpressionDirective(line, 'org', match[1] ?? '', span),
  },
  {
    pattern: new RegExp(`^enum\\s+(${IDENTIFIER_PATTERN})\\s+(.+)$`),
    parse: (line, match) => ({
      items: [],
      diagnostics: [
        {
          severity: 'error',
          code: 'AZMN_PARSE',
          message: `Use "${match[1] ?? ''} .enum ..." for enums.`,
          sourceName: line.sourceName,
          line: line.line,
          column: firstColumn(line.text),
        },
      ],
    }),
  },
  {
    pattern: new RegExp(`^(${IDENTIFIER_PATTERN})\\s+\\.enum\\s+(.+)$`),
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

export { parseColonDeclaration } from './parse-declaration-directives.js';

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

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}
