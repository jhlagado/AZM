import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { normalizeDirectiveAlias } from './directive-aliases.js';
import { parseExpression } from './parse-expression.js';

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

  const data = /^(\.db|\.dw)\s+(.+)$/i.exec(text);
  if (data) {
    const directive = (data[1] ?? '').slice(1).toLowerCase() as 'db' | 'dw';
    const valueText = data[2] ?? '';
    const parts = splitValueList(valueText);
    const values = parts.map(parseExpression).filter((value) => value !== undefined);
    if (values.length !== parts.length) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .${directive} value list`)],
      };
    }
    return {
      items: [{ kind: directive, values, span }],
      diagnostics: [],
    };
  }

  const ds = /^\.ds\s+(.+)$/i.exec(text);
  if (ds) {
    const sizeText = ds[1] ?? '';
    const size = parseExpression(sizeText);
    if (!size) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid .ds size: ${sizeText}`)],
      };
    }
    return { items: [{ kind: 'ds', size, span }], diagnostics: [] };
  }

  if (/^NOP$/i.test(text)) {
    return {
      items: [{ kind: 'instruction', instruction: { mnemonic: 'nop' }, span }],
      diagnostics: [],
    };
  }

  if (/^RET$/i.test(text)) {
    return {
      items: [{ kind: 'instruction', instruction: { mnemonic: 'ret' }, span }],
      diagnostics: [],
    };
  }

  const ldA = /^LD\s+A\s*,\s*(.+)$/i.exec(text);
  if (ldA) {
    const expressionText = ldA[1] ?? '';
    const expression = parseExpression(expressionText);
    if (!expression) {
      return {
        items: [],
        diagnostics: [parseError(line, `invalid LD A immediate: ${expressionText}`)],
      };
    }
    return {
      items: [{ kind: 'instruction', instruction: { mnemonic: 'ld-a-imm', expression }, span }],
      diagnostics: [],
    };
  }

  return { items: [], diagnostics: [parseError(line, `unsupported source line: ${text}`)] };
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
    if (char === '"' || char === "'") {
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
    if (char === ',' && !quote) {
      values.push(text.slice(start, index));
      start = index + 1;
    }
  }
  values.push(text.slice(start));
  return values;
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
