import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import type { SourceSpan } from '../source/source-span.js';
import { extractLineComment, stripLineComment } from '../source/strip-line-comment.js';
import { normalizeDirectiveAlias, type DirectiveAliasPolicy } from './directive-aliases.js';
import { LABEL_NAME_PATTERN, parseEntryLabel } from './names.js';
import { parseColonDeclaration, parseDirectiveStatement } from './parse-directive-statement.js';
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
  const text = normalizeDirectiveAlias(
    stripLineComment(line.text),
    options.directiveAliasPolicy,
  ).trim();
  if (text.length === 0) {
    return commentOnlyLine(line);
  }

  const span = spanForLine(line);
  const labelWithStatement = new RegExp(`^(@?${LABEL_NAME_PATTERN}):\\s*(.+)$`).exec(text);
  if (labelWithStatement) {
    const rawLabel = labelWithStatement[1] ?? '';
    const label = parseEntryLabel(rawLabel);
    if (!label) return withLineComment(line, parseCanonicalStatement(line, text, span));
    const statementText = labelWithStatement[2] ?? '';
    const declaration = parseColonDeclaration(line, label.name, statementText, span);
    if (declaration) {
      return withLineComment(line, declaration);
    }
    const parsedStatement = parseCanonicalStatement(line, statementText, span);
    return withLineComment(line, {
      items: [
        { kind: 'label', name: label.name, ...(label.isEntry ? { isEntry: true } : {}), span },
        ...parsedStatement.items,
      ],
      diagnostics: parsedStatement.diagnostics,
    });
  }

  const labelOnly = new RegExp(`^(@?${LABEL_NAME_PATTERN}):$`).exec(text);
  if (labelOnly) {
    const rawLabel = labelOnly[1] ?? '';
    const label = parseEntryLabel(rawLabel);
    if (!label) return withLineComment(line, parseCanonicalStatement(line, text, span));
    return withLineComment(line, {
      items: [
        {
          kind: 'label',
          name: label.name,
          ...(label.isEntry ? { isEntry: true } : {}),
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
          ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
          ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
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
          ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
          ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
        },
      },
    ],
    diagnostics: result.diagnostics,
  };
}

function parseCanonicalStatement(
  line: LogicalLine,
  text: string,
  span: SourceSpan,
): ParseLineResult {
  const directive = parseDirectiveStatement(line, text, span);
  if (directive) {
    return directive;
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

function spanForLine(line: LogicalLine): SourceSpan {
  return {
    sourceName: line.sourceName,
    line: line.line,
    column: firstColumn(line.text),
    ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
    ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
  };
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
