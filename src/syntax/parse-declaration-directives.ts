import type { Diagnostic } from '../model/diagnostic.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { isIdentifier } from './names.js';
import { parseLineError } from './parse-diagnostics.js';
import { parseExpression } from './parse-expression.js';
import type { ParseLineResult } from './parse-line.js';

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

export function parseEquItem(
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
      diagnostics: [parseLineError(line, `invalid .equ expression: ${expressionText}`)],
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

export function parseEnumItem(
  line: LogicalLine,
  name: string,
  membersText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const rawMembers = membersText.split(',').map((member) => member.trim());
  if (membersText.trim().length === 0 || rawMembers.some((member) => member.length === 0)) {
    return {
      items: [],
      diagnostics: [parseLineError(line, `invalid enum member list`)],
    };
  }

  const members: string[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const member of rawMembers) {
    if (!isIdentifier(member)) {
      diagnostics.push(
        parseLineError(line, `Invalid enum member name "${member}": expected <identifier>.`),
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

export function parseWholeQuotedString(text: string): string | undefined {
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
