import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { splitInstructionChain } from '../source/instruction-chain.js';
import { stripLineComment } from '../source/strip-line-comment.js';
import { IDENTIFIER_PATTERN, hasLeadingLabel, parseLeadingLabel } from '../syntax/names.js';
import { parseLogicalLine, type ParseLogicalLineOptions } from '../syntax/parse-line.js';
import { expandSelectedOp } from './op-expand-selected.js';
import { splitOperands } from './op-operand-splitting.js';
import {
  parseOpMatcher,
  parseOpOperand,
  type OpMatcher,
  type OpOperand,
} from './op-operands.js';

export type LogicalLineLike = {
  readonly sourceName: string;
  readonly line: number;
  readonly text: string;
};

interface OpParam {
  readonly name: string;
  readonly matcher: OpMatcher;
}

type OpHeader = { readonly name: string; readonly params: readonly OpParam[] };
type CollectedOpBody = { readonly body: readonly OpTemplateItem[]; readonly terminated: boolean; readonly endIndex: number };

export type { OpOperand } from './op-operands.js';

type OpTemplateOperand =
  | { readonly kind: 'param'; readonly name: string }
  | { readonly kind: 'port-param'; readonly name: string }
  | { readonly kind: 'literal'; readonly operand: OpOperand };

export type OpTemplateItem =
  | { readonly kind: 'source-items'; readonly items: readonly SourceItem[] }
  | {
      readonly kind: 'instruction';
      readonly mnemonic: string;
      readonly operands: readonly OpTemplateOperand[];
    };

export interface OpDecl {
  readonly name: string;
  readonly params: readonly OpParam[];
  readonly body: readonly OpTemplateItem[];
  readonly sourceName: string;
  readonly line: number;
}

export function collectOps(
  lines: readonly LogicalLineLike[],
  diagnostics: Diagnostic[],
  parseOptions: ParseLogicalLineOptions = {},
): {
  readonly ops: ReadonlyMap<string, readonly OpDecl[]>;
  readonly opLineIndexes: ReadonlySet<number>;
} {
  const ops = new Map<string, OpDecl[]>();
  const opLineIndexes = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isTopLevelEnd(line.text)) break;
    const header = parseOpHeader(line, diagnostics);
    if (!header) continue;

    opLineIndexes.add(index);
    const collected = collectOpBody(lines, index + 1, header.params, diagnostics, parseOptions, opLineIndexes);
    index = collected.endIndex;
    recordCollectedOp(ops, header, collected, line, diagnostics);
  }

  return { ops, opLineIndexes };
}

function parseOpHeader(line: LogicalLineLike, diagnostics: Diagnostic[]): OpHeader | undefined {
  const opHeader = new RegExp(`^op\\s+(${IDENTIFIER_PATTERN})\\s*\\((.*)\\)\\s*$`, 'i').exec(
    stripLineComment(line.text).trim(),
  );
  if (!opHeader) return undefined;
  return { name: opHeader[1] ?? '', params: parseOpParams(opHeader[2] ?? '', line, diagnostics) };
}

function collectOpBody(
  lines: readonly LogicalLineLike[],
  startIndex: number,
  params: readonly OpParam[],
  diagnostics: Diagnostic[],
  parseOptions: ParseLogicalLineOptions,
  opLineIndexes: Set<number>,
): CollectedOpBody {
  const paramNames = new Set(params.map((param) => param.name));
  const body: OpTemplateItem[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    opLineIndexes.add(index);
    const bodyLine = lines[index]!;
    if (isOpEnd(bodyLine.text)) {
      return { body, terminated: true, endIndex: index };
    }
    const templates = parseOpBodyTemplates(bodyLine, paramNames, diagnostics, parseOptions);
    body.push(...templates);
  }
  return { body, terminated: false, endIndex: lines.length };
}

function recordCollectedOp(
  ops: Map<string, OpDecl[]>,
  header: OpHeader,
  collected: CollectedOpBody,
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
): void {
  if (!collected.terminated) {
    diagnostics.push(parseDiagnostic(line, `op ${header.name} missing end`));
  }
  if (header.params.length === 0 && !collected.terminated) return;
  ops.set(header.name, [
    ...(ops.get(header.name) ?? []),
    {
    name: header.name,
    params: header.params,
    body: collected.body,
    sourceName: line.sourceName,
    line: line.line,
    },
  ]);
}

export function parseOpInvocation(
  line: LogicalLineLike,
): { readonly name: string; readonly operands: readonly OpOperand[] } | undefined {
  const text = stripLineComment(line.text).trim();
  const match = new RegExp(`^(${IDENTIFIER_PATTERN})(?:\\s+(.+))?$`).exec(text);
  if (!match) {
    return undefined;
  }
  const operandText = match[2] ?? '';
  const parts = operandText.trim().length === 0 ? [] : splitOperands(operandText);
  const operands = parts.map((operand) => parseOpOperand(operand));
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }
  return { name: match[1] ?? '', operands: operands as OpOperand[] };
}

export function expandOpInvocation(
  ops: ReadonlyMap<string, readonly OpDecl[]>,
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
): readonly SourceItem[] {
  return expandSelectedOp(ops, overloads, operands, line, diagnostics, []);
}

function parseOpParams(text: string, line: LogicalLineLike, diagnostics: Diagnostic[]): OpParam[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const parts = splitOperands(trimmed);
  if (parts.some((part) => part.trim().length === 0)) {
    diagnostics.push(
      parseDiagnostic(
        line,
        'Invalid op parameter list: trailing or empty entries are not permitted.',
      ),
    );
    return [];
  }
  const params: OpParam[] = [];
  for (const part of parts) {
    const match = new RegExp(`^(${IDENTIFIER_PATTERN})\\s+([A-Za-z][A-Za-z0-9_]*)$`).exec(
      part.trim(),
    );
    if (!match) {
      diagnostics.push(
        parseDiagnostic(
          line,
          'Invalid op parameter list: trailing or empty entries are not permitted.',
        ),
      );
      continue;
    }
    const matcherText = match[2] ?? '';
    const matcher = parseOpMatcher(matcherText);
    if (!matcher) {
      diagnostics.push(parseDiagnostic(line, `unsupported op matcher: ${matcherText}`));
      continue;
    }
    params.push({ name: match[1] ?? '', matcher });
  }
  return params;
}

function parseOpBodyTemplate(
  line: LogicalLineLike,
  paramNames: ReadonlySet<string>,
  diagnostics: Diagnostic[],
  parseOptions: ParseLogicalLineOptions,
): OpTemplateItem | undefined {
  const text = stripLineComment(line.text).trim();
  if (text.length === 0) return undefined;

  const template = parseTemplateInstructionCandidate(text, paramNames);
  if (template && templateContainsParam(template)) {
    return template;
  }

  const parsedSource = parseOpBodySourceItems(line, diagnostics, parseOptions, template !== undefined);
  if (parsedSource) return parsedSource;
  return template;
}

function parseOpBodyTemplates(
  line: LogicalLineLike,
  paramNames: ReadonlySet<string>,
  diagnostics: Diagnostic[],
  parseOptions: ParseLogicalLineOptions,
): readonly OpTemplateItem[] {
  const segments = splitInstructionChain(line.text);
  if (segments === undefined) {
    const template = parseOpBodyTemplate(line, paramNames, diagnostics, parseOptions);
    return template ? [template] : [];
  }

  const templates: OpTemplateItem[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.text.length === 0) {
      diagnostics.push(parseDiagnostic(paddedLine(line, '', segment.column), 'empty instruction segment in chained line'));
      continue;
    }
    if (index > 0 && hasLeadingLabel(segment.text)) {
      diagnostics.push(
        parseDiagnostic(
          paddedLine(line, segment.text, segment.column),
          'labels are only allowed before the first chained instruction',
        ),
      );
      continue;
    }
    const labeled = index === 0 ? parseLeadingLabel(segment.text, segment.column) : undefined;
    const statementText = labeled?.statementText ?? segment.text;
    const statementColumn = labeled?.statementColumn ?? segment.column;
    if (statementText.length === 0) {
      diagnostics.push(
        parseDiagnostic(paddedLine(line, '', statementColumn), 'empty instruction segment in chained line'),
      );
      continue;
    }
    if (isChainedDirectiveOrDeclaration(statementText)) {
      diagnostics.push(
        parseDiagnostic(
          paddedLine(line, statementText, statementColumn),
          'directives must be on their own line; chained lines only support instructions and ops',
        ),
      );
      continue;
    }
    if (labeled) {
      templates.push({
        kind: 'source-items',
        items: [
          {
            kind: 'label',
            name: labeled.name,
            ...(labeled.isEntry ? { isEntry: true } : {}),
            span: { sourceName: line.sourceName, line: line.line, column: labeled.labelColumn },
          },
        ],
      });
    }
    const template = parseOpBodyTemplate(
      paddedLine(line, statementText, statementColumn),
      paramNames,
      diagnostics,
      parseOptions,
    );
    if (template) templates.push(template);
  }
  return templates;
}

function isChainedDirectiveOrDeclaration(text: string): boolean {
  return (
    /^\./.test(text) ||
    /^(?:org|equ|db|dw|ds|align|include|import|binfrom|binto|cstr|pstr|istr|end|enum|type|union|field|byte|word|addr|endtype|endunion|typealias|if|else|endif|op)\b/i.test(text) ||
    /^[A-Za-z_.$?][A-Za-z0-9_.$?]*\s+\.?(?:equ|enum|type|union|typealias)\b/i.test(text)
  );
}

function paddedLine(line: LogicalLineLike, text: string, column: number): LogicalLineLike {
  return { ...line, text: `${' '.repeat(Math.max(0, column - 1))}${text}` };
}

function parseTemplateInstructionCandidate(
  text: string,
  paramNames: ReadonlySet<string>,
): Extract<OpTemplateItem, { readonly kind: 'instruction' }> | undefined {
  const instruction = new RegExp(`^(${IDENTIFIER_PATTERN})(?:\\s+(.+))?$`).exec(text);
  if (!instruction) return undefined;
  const operands = parseTemplateOperands(instruction[2] ?? '', paramNames);
  return operands
    ? { kind: 'instruction', mnemonic: (instruction[1] ?? '').toLowerCase(), operands }
    : undefined;
}

function parseTemplateOperands(
  operandText: string,
  paramNames: ReadonlySet<string>,
): readonly OpTemplateOperand[] | undefined {
  const operands =
    operandText.trim().length === 0
      ? []
      : splitOperands(operandText).map((operand) => parseTemplateOperand(operand, paramNames));
  return operands.every((operand) => operand !== undefined)
    ? (operands as OpTemplateOperand[])
    : undefined;
}

function templateContainsParam(
  template: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
): boolean {
  return template.operands.some((operand) => operand.kind === 'param' || operand.kind === 'port-param');
}

function parseOpBodySourceItems(
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
  parseOptions: ParseLogicalLineOptions,
  suppressUnsupportedLineDiagnostic: boolean,
): Extract<OpTemplateItem, { readonly kind: 'source-items' }> | undefined {
  const result = parseLogicalLine(line, parseOptions);
  if (suppressUnsupportedLineDiagnostic && isUnsupportedSourceLine(result.diagnostics)) {
    return undefined;
  }
  diagnostics.push(...result.diagnostics);
  if (result.items.length === 0) return undefined;
  return { kind: 'source-items', items: result.items };
}

function isUnsupportedSourceLine(diagnostics: readonly Diagnostic[]): boolean {
  return (
    diagnostics.length === 1 &&
    diagnostics[0]?.code === 'AZMN_PARSE' &&
    diagnostics[0].message.startsWith('unsupported source line:')
  );
}

function parseTemplateOperand(
  text: string,
  paramNames: ReadonlySet<string>,
): OpTemplateOperand | undefined {
  const trimmed = text.trim();
  if (paramNames.has(trimmed)) {
    return { kind: 'param', name: trimmed };
  }
  const portParam = new RegExp(`^\\(\\s*(${IDENTIFIER_PATTERN})\\s*\\)$`).exec(trimmed);
  if (portParam && paramNames.has(portParam[1] ?? '')) {
    return { kind: 'port-param', name: portParam[1] ?? '' };
  }
  const operand = parseOpOperand(trimmed);
  return operand ? { kind: 'literal', operand } : undefined;
}

function isTopLevelEnd(text: string): boolean {
  return /^(?:\.end|end)\s*$/i.test(stripLineComment(text).trim());
}

function isOpEnd(text: string): boolean {
  return /^end\s*$/i.test(stripLineComment(text).trim());
}

function parseDiagnostic(line: LogicalLineLike, message: string): Diagnostic {
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
