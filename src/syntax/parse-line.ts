import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { DataValue, SourceItem } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { normalizeDirectiveAlias } from './directive-aliases.js';
import { parseExpression, parseTypeExpr } from './parse-expression.js';
import { parseZ80Instruction } from '../z80/parse-instruction.js';

export interface ParseLineResult {
  readonly items: readonly SourceItem[];
  readonly diagnostics: readonly Diagnostic[];
}

export function parseLogicalLine(line: LogicalLine): ParseLineResult {
  const text = normalizeDirectiveAlias(stripComment(line.text)).trim();
  if (text.length === 0) {
    return { items: [], diagnostics: [] };
  }

  const span = { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) };
  const labelWithStatement = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*):\s+(.+)$/.exec(text);
  if (labelWithStatement) {
    const labelName = labelWithStatement[1] ?? '';
    const statementText = labelWithStatement[2] ?? '';
    const equStatement = parseColonLabelEqu(line, labelName, statementText, span);
    if (equStatement) {
      return equStatement;
    }

    const parsedStatement = parseCanonicalStatement(line, statementText, span);
    return {
      items: [{ kind: 'label', name: labelName, span }, ...parsedStatement.items],
      diagnostics: parsedStatement.diagnostics,
    };
  }

  const labelOnly = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*):$/.exec(text);
  if (labelOnly) {
    return { items: [{ kind: 'label', name: labelOnly[1] ?? '', span }], diagnostics: [] };
  }

  return parseCanonicalStatement(line, text, span);
}

function parseColonLabelEqu(
  line: LogicalLine,
  name: string,
  text: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult | undefined {
  const equ = /^\.equ\s+(.+)$/i.exec(text);
  if (!equ) {
    return undefined;
  }

  const expressionText = equ[1] ?? '';
  const expression = parseExpression(expressionText);
  if (!expression) {
    return {
      items: [],
      diagnostics: [parseError(line, `invalid .equ expression: ${expressionText}`)],
    };
  }
  return { items: [{ kind: 'equ', name, expression, span }], diagnostics: [] };
}

function parseCanonicalStatement(
  line: LogicalLine,
  text: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+\.equ\s+(.+)$/i.exec(text);
  if (equ) {
    const name = equ[1] ?? '';
    const expressionText = equ[2] ?? '';
    const expression = parseExpression(expressionText);
    if (!expression) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .equ expression: ${expressionText}`)],
      };
    }
    return { items: [{ kind: 'equ', name, expression, span }], diagnostics: [] };
  }

  const org = /^\.org\s+(.+)$/i.exec(text);
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

  const enumDecl = /^enum\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/i.exec(text);
  if (enumDecl) {
    const name = enumDecl[1] ?? '';
    const membersText = enumDecl[2] ?? '';
    const members = membersText.split(',').map((member) => member.trim());
    if (
      members.length === 0 ||
      members.some((member) => member.length === 0 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(member))
    ) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid enum member list`)],
      };
    }
    return { items: [{ kind: 'enum', name, members, span }], diagnostics: [] };
  }

  const data = /^(\.db|\.dw)\s+(.+)$/i.exec(text);
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

  const ds = /^\.ds\s+(.+)$/i.exec(text);
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

  const align = /^\.align\s+(.+)$/i.exec(text);
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

  if (/^\.end\s*$/i.test(text)) {
    return { items: [{ kind: 'end', span }], diagnostics: [] };
  }

  const rangeControl = /^(\.binfrom|\.binto)\s+(.+)$/i.exec(text);
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

  const stringData = /^(\.cstr|\.pstr|\.istr)\s+(.+)$/i.exec(text);
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

function stripComment(text: string): string {
  let quote: string | undefined;
  let escaped = false;
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
    if (
      (char === '"' || char === "'") &&
      !(char === "'" && quote === undefined && /[A-Za-z0-9_]/.test(text[index - 1] ?? ''))
    ) {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (char === ';' && !quote) {
      return text.slice(0, index);
    }
  }
  return text;
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
