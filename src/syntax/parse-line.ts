import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { DataValue, SourceItem } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { extractLineComment, stripLineComment } from '../source/strip-line-comment.js';
import { normalizeDirectiveAlias, type DirectiveAliasPolicy } from './directive-aliases.js';
import { parseExpression, parseTypeExpr } from './parse-expression.js';
import { parseZ80Instruction } from '../z80/parse-instruction.js';

export interface ParseLineResult {
  readonly items: readonly SourceItem[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseLogicalLineOptions {
  readonly directiveAliasPolicy?: DirectiveAliasPolicy;
}

export function parseLogicalLine(
  line: LogicalLine,
  options: ParseLogicalLineOptions = {},
): ParseLineResult {
  const text = normalizeDirectiveAlias(stripLineComment(line.text), options.directiveAliasPolicy).trim();
  if (text.length === 0) {
    return commentOnlyLine(line);
  }

  const span = { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) };
  const labelWithStatement = /^(@?[A-Za-z_.$?][A-Za-z0-9_.$?]*):\s*(.+)$/.exec(text);
  if (labelWithStatement) {
    const rawLabel = labelWithStatement[1] ?? '';
    const labelName = normalizeEntryLabelName(rawLabel);
    const isEntry = rawLabel.startsWith('@');
    const statementText = labelWithStatement[2] ?? '';
    const equStatement = parseColonLabelEqu(line, labelName, statementText, span);
    if (equStatement) {
      return equStatement;
    }

    const parsedStatement = parseCanonicalStatement(line, statementText, span);
    return withLineComment(line, {
      items: [{ kind: 'label', name: labelName, ...(isEntry ? { isEntry: true } : {}), span }, ...parsedStatement.items],
      diagnostics: parsedStatement.diagnostics,
    });
  }

  const labelOnly = /^(@?[A-Za-z_.$?][A-Za-z0-9_.$?]*):$/.exec(text);
  if (labelOnly) {
    const rawLabel = labelOnly[1] ?? '';
    return withLineComment(line, {
      items: [
        {
          kind: 'label',
          name: normalizeEntryLabelName(rawLabel),
          ...(rawLabel.startsWith('@') ? { isEntry: true } : {}),
          span,
        },
      ],
      diagnostics: [],
    });
  }

  return withLineComment(line, parseCanonicalStatement(line, text, span));
}

function commentOnlyLine(line: LogicalLine): ParseLineResult {
  const comment = extractLineComment(line.text);
  if (!comment) {
    return { items: [], diagnostics: [] };
  }
  return {
    items: [
      {
        kind: 'comment',
        text: comment,
        origin: 'user',
        span: {
          sourceName: line.sourceName,
          line: line.line,
          column: firstColumn(line.text),
        },
      },
    ],
    diagnostics: [],
  };
}

function withLineComment(line: LogicalLine, result: ParseLineResult): ParseLineResult {
  const comment = extractLineComment(line.text);
  if (!comment) {
    return result;
  }
  return {
    items: [
      ...result.items,
      {
        kind: 'comment',
        text: comment,
        origin: 'user',
        span: {
          sourceName: line.sourceName,
          line: line.line,
          column: firstColumn(line.text),
        },
      },
    ],
    diagnostics: result.diagnostics,
  };
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

function parseColonLabelEqu(
  line: LogicalLine,
  name: string,
  text: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult | undefined {
  const equ = /^\.equ\s+(.+)$/.exec(text);
  if (!equ) {
    return undefined;
  }

  return parseEquItem(line, name, equ[1] ?? '', span);
}

function parseCanonicalStatement(
  line: LogicalLine,
  text: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+\.equ\s+(.+)$/.exec(text);
  if (equ) {
    return parseEquItem(line, equ[1] ?? '', equ[2] ?? '', span);
  }

  const org = /^\.org\s+(.+)$/.exec(text);
  if (org) {
    const expressionText = org[1] ?? '';
    const expression = parseExpression(expressionText);
    if (!expression) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .org expression: ${expressionText}`)],
      };
    }
    return { items: [{ kind: 'org', expression, span }], diagnostics: [] };
  }

  const enumDecl = /^enum\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/.exec(text);
  if (enumDecl) {
    const name = enumDecl[1] ?? '';
    const membersText = enumDecl[2] ?? '';
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

  const data = /^(\.db|\.dw)\s+(.+)$/.exec(text);
  if (data) {
    const directive = (data[1] ?? '').slice(1).toLowerCase() as 'db' | 'dw';
    const valueText = data[2] ?? '';
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

  const ds = /^\.ds\s+(.+)$/.exec(text);
  if (ds) {
    const parts = splitValueList(ds[1] ?? '');
    if (parts.length < 1 || parts.length > 2) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .ds value list`)],
      };
    }
    const sizeText = parts[0] ?? '';
    const size = parseTypeSizeExpression(sizeText) ?? parseExpression(sizeText);
    if (!size) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .ds size: ${sizeText}`)],
      };
    }
    const fillText = parts[1];
    const fill = fillText === undefined ? undefined : parseExpression(fillText);
    if (fillText !== undefined && !fill) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .ds fill: ${fillText}`)],
      };
    }
    return {
      items: [fill === undefined ? { kind: 'ds', size, span } : { kind: 'ds', size, fill, span }],
      diagnostics: [],
    };
  }

  const align = /^\.align\s+(.+)$/.exec(text);
  if (align) {
    const expressionText = align[1] ?? '';
    const alignment = parseExpression(expressionText);
    if (!alignment) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .align expression: ${expressionText}`)],
      };
    }
    return { items: [{ kind: 'align', alignment, span }], diagnostics: [] };
  }

  if (/^\.end\s*$/.test(text)) {
    return { items: [{ kind: 'end', span }], diagnostics: [] };
  }

  const rangeControl = /^(\.binfrom|\.binto)\s+(.+)$/.exec(text);
  if (rangeControl) {
    const kind = (rangeControl[1] ?? '').slice(1).toLowerCase() as 'binfrom' | 'binto';
    const expressionText = rangeControl[2] ?? '';
    const expression = parseExpression(expressionText);
    if (!expression) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .${kind} expression: ${expressionText}`)],
      };
    }
    return { items: [{ kind, expression, span }], diagnostics: [] };
  }

  const stringData = /^(\.cstr|\.pstr|\.istr)\s+(.+)$/.exec(text);
  if (stringData) {
    const directive = (stringData[1] ?? '').slice(1).toLowerCase() as 'cstr' | 'pstr' | 'istr';
    const valueText = stringData[2] ?? '';
    const value = parseQuotedString(valueText);
    if (value === undefined) {
      return {
        items: [],
        diagnostics: [parseError(line, `.${directive} expects one quoted string`)],
      };
    }
    return { items: [{ kind: 'string-data', directive, value, span }], diagnostics: [] };
  }

  const instruction = parseZ80Instruction(text);
  if (instruction?.instruction) {
    return {
      items: [{ kind: 'instruction', instruction: instruction.instruction, span }],
      diagnostics: [],
    };
  }

  if (instruction?.diagnostics && instruction.diagnostics.length > 0) {
    return {
      items: [],
      diagnostics: instruction.diagnostics.map((message) => parseError(line, message)),
    };
  }

  if (instruction?.error) {
    return { items: [], diagnostics: [parseError(line, instruction.error)] };
  }

  return { items: [], diagnostics: [parseError(line, `unsupported source line: ${text}`)] };
}

function parseTypeSizeExpression(text: string): Expression | undefined {
  const typeExpr = parseTypeExpr(text);
  return typeExpr ? { kind: 'type-size', typeExpr } : undefined;
}

function splitValueList(text: string): string[] {
  const values: string[] = [];
  let quote: string | undefined;
  let escaped = false;
  let parenDepth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (!quote && char === '(') {
      parenDepth += 1;
      continue;
    }
    if (!quote && char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === ',' && !quote && parenDepth === 0) {
      values.push(text.slice(start, index));
      start = index + 1;
    }
  }
  values.push(text.slice(start));
  return values;
}

function parseQuotedString(text: string): string | undefined {
  const input = text.trim();
  const quote = input[0];
  if (quote !== '"' || input[input.length - 1] !== quote) {
    return undefined;
  }

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

function parseWholeQuotedString(text: string): string | undefined {
  const input = text.trim();
  const quote = input[0];
  if ((quote !== '"' && quote !== "'") || input[input.length - 1] !== quote) {
    return undefined;
  }

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

function normalizeEntryLabelName(raw: string): string {
  return raw.startsWith('@') ? raw.slice(1) : raw;
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
