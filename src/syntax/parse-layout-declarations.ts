import type { Diagnostic } from '../model/diagnostic.js';
import type { LayoutField, SourceItem } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import type { SourceSpan } from '../source/source-span.js';
import { stripLineComment } from '../source/strip-line-comment.js';
import { parseTypeExpr } from './parse-expression.js';

export interface LayoutDeclarationParseResult {
  readonly consumedUntilIndex: number;
  readonly item?: SourceItem;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseLayoutDeclarationAt(
  lines: readonly LogicalLine[],
  index: number,
): LayoutDeclarationParseResult | undefined {
  const line = lines[index];
  if (line === undefined) return undefined;
  const text = stripLineComment(line.text).trim();

  const typeAlias = parseTypeAlias(line, text);
  if (typeAlias !== undefined) {
    return { consumedUntilIndex: index, ...typeAlias };
  }

  const prefixLayoutHeader = /^\.(type|union)\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(text);
  if (prefixLayoutHeader) {
    const directive = prefixLayoutHeader[1] ?? 'type';
    return {
      consumedUntilIndex: skipToLayoutEnd(lines, index, directive),
      diagnostics: [
        parseDiagnostic(line, `Use "${prefixLayoutHeader[2] ?? ''} .${directive}" for layouts.`),
      ],
    };
  }

  const layoutHeader = parseNameLeftLayoutHeader(text);
  if (layoutHeader === undefined) {
    return undefined;
  }

  return parseLayoutBlock(lines, index, layoutHeader);
}

function parseTypeAlias(
  line: LogicalLine,
  text: string,
): { readonly item?: SourceItem; readonly diagnostics: readonly Diagnostic[] } | undefined {
  const nameLeftTypeAlias = /^([A-Za-z_][A-Za-z0-9_]*)(?::\s*|\s+)\.typealias\s+(.+)$/.exec(text);
  if (nameLeftTypeAlias) {
    const typeExprText = nameLeftTypeAlias[2] ?? '';
    const typeExpr = parseTypeExpr(typeExprText);
    if (!typeExpr) {
      return { diagnostics: [parseDiagnostic(line, `invalid .typealias target: ${typeExprText}`)] };
    }
    return {
      item: {
        kind: 'type-alias',
        name: nameLeftTypeAlias[1] ?? '',
        typeExpr,
        span: spanForLine(line),
      },
      diagnostics: [],
    };
  }

  const oldTypeAlias = /^\.type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(text);
  if (oldTypeAlias) {
    return {
      diagnostics: [
        parseDiagnostic(line, `Use "${oldTypeAlias[1] ?? ''} .typealias ..." for type aliases.`),
      ],
    };
  }

  return undefined;
}

function parseNameLeftLayoutHeader(
  text: string,
): { readonly directive: string; readonly name: string } | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(?::\s*|\s+)\.(type|union)\s*$/.exec(text);
  return match
    ? {
        directive: match[2] ?? '',
        name: match[1] ?? '',
      }
    : undefined;
}

function parseLayoutBlock(
  lines: readonly LogicalLine[],
  index: number,
  header: { readonly directive: string; readonly name: string },
): LayoutDeclarationParseResult {
  const line = lines[index]!;
  const layoutKind = header.directive === 'union' ? 'union' : 'record';
  const endDirective = layoutKind === 'union' ? '.endunion' : '.endtype';
  const fields: LayoutField[] = [];
  const diagnostics: Diagnostic[] = [];
  let consumedUntilIndex = index;
  let terminated = false;

  for (let fieldIndex = index + 1; fieldIndex < lines.length; fieldIndex += 1) {
    consumedUntilIndex = fieldIndex;
    const fieldLine = lines[fieldIndex]!;
    const fieldText = stripLineComment(fieldLine.text).trim();
    if (fieldText.length === 0) {
      continue;
    }
    if (fieldText === endDirective) {
      terminated = true;
      break;
    }
    const field = parseLayoutField(fieldText);
    if (!field) {
      diagnostics.push(
        parseDiagnostic(fieldLine, `invalid .${header.directive} field declaration`),
      );
      continue;
    }
    fields.push(field);
  }

  if (!terminated) {
    diagnostics.push(
      parseDiagnostic(line, `.${header.directive} ${header.name} missing ${endDirective}`),
    );
  }

  return {
    consumedUntilIndex,
    diagnostics,
    item: {
      kind: 'type',
      name: header.name,
      layoutKind,
      fields,
      span: spanForLine(line),
    },
  };
}

function spanForLine(line: LogicalLine): SourceSpan {
  return {
    sourceName: line.sourceName,
    line: line.line,
    column: firstColumn(line.text),
    ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
    ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
  };
}

function skipToLayoutEnd(lines: readonly LogicalLine[], index: number, directive: string): number {
  const endDirective = directive === 'union' ? '.endunion' : '.endtype';
  for (let next = index + 1; next < lines.length; next += 1) {
    if (stripLineComment(lines[next]!.text).trim() === endDirective) {
      return next;
    }
  }
  return index;
}

function parseLayoutField(text: string): LayoutField | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+(\.(?:field|byte|word|addr))(?:\s+(.+))?$/.exec(text);
  if (!match) {
    return undefined;
  }

  const name = match[1] ?? '';
  const directive = (match[2] ?? '').toLowerCase();
  const operand = match[3]?.trim();
  return directive === '.field'
    ? parseNamedField(name, operand)
    : parseScalarDirectiveField(name, directive, operand);
}

function parseNamedField(name: string, operand: string | undefined): LayoutField | undefined {
  return operand === undefined ? undefined : parseFieldOperand(name, operand);
}

function parseScalarDirectiveField(
  name: string,
  directive: string,
  operand: string | undefined,
): LayoutField | undefined {
  if (operand !== undefined) {
    return undefined;
  }
  const size = scalarDirectiveSize(directive);
  return size === undefined ? undefined : { name, size };
}

function scalarDirectiveSize(directive: string): number | undefined {
  if (directive === '.byte') return 1;
  if (directive === '.word' || directive === '.addr') return 2;
  return undefined;
}

function parseFieldOperand(name: string, operand: string): LayoutField | undefined {
  const size = /^[0-9]+$/.test(operand) ? Number.parseInt(operand, 10) : undefined;
  if (size !== undefined) {
    return size > 0 ? { name, size } : undefined;
  }
  const scalar = scalarFieldSize(operand);
  if (scalar !== undefined) {
    return { name, size: scalar };
  }
  const typeExpr = parseTypeExpr(operand);
  return typeExpr ? { name, size: 0, typeExpr } : undefined;
}

function scalarFieldSize(typeName: string): number | undefined {
  switch (typeName.toLowerCase()) {
    case 'byte':
      return 1;
    case 'word':
    case 'addr':
      return 2;
    default:
      return undefined;
  }
}

function parseDiagnostic(
  line: { readonly sourceName: string; readonly line: number; readonly text: string },
  message: string,
): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_PARSE',
    message,
    sourceName: line.sourceName,
    line: line.line,
    column: firstColumn(line.text),
  };
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}
