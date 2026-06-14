import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';
import { assembleProgram } from '../assembly/assemble-program.js';
import { writeIntelHex } from '../outputs/hex.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { createSourceFile } from '../source/source-file.js';
import { scanLogicalLines } from '../source/logical-lines.js';
import { splitInstructionChain } from '../source/instruction-chain.js';
import { extractLineComment, stripLineComment } from '../source/strip-line-comment.js';
import { hasLeadingLabel, parseLeadingLabel } from '../syntax/names.js';
import { parseLogicalLine } from '../syntax/parse-line.js';
import { parseLayoutDeclarationAt } from '../syntax/parse-layout-declarations.js';
import {
  collectOps,
  expandOpInvocation,
  parseOpInvocation,
  type OpDecl,
} from '../expansion/op-expansion.js';
import type { DirectiveAliasPolicy } from '../syntax/directive-aliases.js';
import { parseZ80Instruction } from '../z80/parse-instruction.js';
import { applyConditionalAssembly } from './conditional-assembly.js';

export interface CompileNextOptions {
  readonly entryName?: string;
}

export interface CompileSourceResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: Readonly<Record<string, number>>;
  readonly bytes: Uint8Array;
  readonly hexText: string;
}

interface ParseNextSourceItemsResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly items: readonly SourceItem[];
}

interface ParseNextSourceItemsOptions {
  readonly directiveAliasPolicy?: DirectiveAliasPolicy;
}

interface ParseNextContext {
  readonly diagnostics: Diagnostic[];
  readonly items: SourceItem[];
  readonly lines: readonly LogicalLine[];
  readonly ops: ReadonlyMap<string, readonly OpDecl[]>;
  readonly opLineIndexes: ReadonlySet<number>;
  readonly parseOptions: Parameters<typeof parseLogicalLine>[1];
}

interface ParsedLineStep {
  readonly consumedUntilIndex: number;
  readonly afterTopLevelEnd: boolean;
}

export function parseNextSourceItems(
  lines: readonly LogicalLine[],
  options: ParseNextSourceItemsOptions = {},
): ParseNextSourceItemsResult {
  const diagnostics: Diagnostic[] = [];
  const items: SourceItem[] = [];
  const parseOptions =
    options.directiveAliasPolicy === undefined
      ? {}
      : { directiveAliasPolicy: options.directiveAliasPolicy };
  const conditional = applyConditionalAssembly(lines, diagnostics, parseOptions.directiveAliasPolicy);
  const pendingLines = [...conditional.lines];
  const { ops, opLineIndexes } = collectOps(pendingLines, diagnostics, parseOptions);
  const context: ParseNextContext = {
    diagnostics,
    items,
    lines: pendingLines,
    ops,
    opLineIndexes,
    parseOptions,
  };
  let afterTopLevelEnd = false;

  for (let index = 0; index < pendingLines.length; index += 1) {
    const step = parsePendingLine(context, index, afterTopLevelEnd);
    index = step.consumedUntilIndex;
    afterTopLevelEnd = step.afterTopLevelEnd;
  }

  return { diagnostics, items };
}

function parsePendingLine(
  context: ParseNextContext,
  index: number,
  afterTopLevelEnd: boolean,
): ParsedLineStep {
  const line = context.lines[index]!;
  if (shouldSkipPendingLine(context, index, line, afterTopLevelEnd)) {
    return { consumedUntilIndex: index, afterTopLevelEnd };
  }

  const layoutStep = parseLayoutLine(context, index);
  if (layoutStep) return { ...layoutStep, afterTopLevelEnd };

  if (parseExpandedOpLine(context, line)) {
    return { consumedUntilIndex: index, afterTopLevelEnd };
  }

  if (parseInstructionChainLine(context, line)) {
    return { consumedUntilIndex: index, afterTopLevelEnd };
  }

  return parseNormalLine(context, index, line, afterTopLevelEnd);
}

function shouldSkipPendingLine(
  context: ParseNextContext,
  index: number,
  line: LogicalLine,
  afterTopLevelEnd: boolean,
): boolean {
  return context.opLineIndexes.has(index) || (afterTopLevelEnd && !isPostEndParseAllowed(line.text));
}

function parseLayoutLine(
  context: ParseNextContext,
  index: number,
): Pick<ParsedLineStep, 'consumedUntilIndex'> | undefined {
  const layoutDeclaration = parseLayoutDeclarationAt(context.lines, index);
  if (layoutDeclaration === undefined) return undefined;

  context.diagnostics.push(...layoutDeclaration.diagnostics);
  if (layoutDeclaration.item !== undefined) {
    context.items.push(layoutDeclaration.item);
  }
  return { consumedUntilIndex: layoutDeclaration.consumedUntilIndex };
}

function parseExpandedOpLine(context: ParseNextContext, line: LogicalLine): boolean {
  const opCall = parseOpInvocation(line);
  if (!opCall || isTopLevelEnd(line.text)) return false;

  const overloads = context.ops.get(opCall.name);
  if (!overloads) return false;

  const expanded = expandOpInvocation(
    context.ops,
    overloads,
    opCall.operands,
    line,
    context.diagnostics,
  );
  context.items.push(...expanded);
  return true;
}

function parseNormalLine(
  context: ParseNextContext,
  index: number,
  line: LogicalLine,
  afterTopLevelEnd: boolean,
): ParsedLineStep {
  const result = parseLogicalLine(line, context.parseOptions);
  context.diagnostics.push(...result.diagnostics);
  context.items.push(...result.items);
  return {
    consumedUntilIndex: index,
    afterTopLevelEnd: afterTopLevelEnd || result.items.some((item) => item.kind === 'end'),
  };
}

function parseInstructionChainLine(context: ParseNextContext, line: LogicalLine): boolean {
  const segments = splitInstructionChain(line.text);
  if (segments === undefined) return false;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.text.length === 0) {
      context.diagnostics.push(chainDiagnostic(line, segment.column, 'empty instruction segment in chained line'));
      continue;
    }

    const parsed = parseInstructionChainSegment(context, line, segment.text, segment.column, index);
    context.diagnostics.push(...parsed.diagnostics);
    context.items.push(...parsed.items);
  }

  appendChainComment(context.items, line);
  return true;
}

function parseInstructionChainSegment(
  context: ParseNextContext,
  line: LogicalLine,
  text: string,
  column: number,
  segmentIndex: number,
): ParseNextSourceItemsResult {
  if (segmentIndex > 0 && hasLeadingLabel(text)) {
    return {
      items: [],
      diagnostics: [
        chainDiagnostic(line, column, 'labels are only allowed before the first chained instruction'),
      ],
    };
  }

  const labeled = segmentIndex === 0 ? parseLeadingLabel(text, column) : undefined;
  const statementText = labeled?.statementText ?? text;
  const statementColumn = labeled?.statementColumn ?? column;
  if (statementText.length === 0) {
    return {
      items: [],
      diagnostics: [chainDiagnostic(line, statementColumn, 'empty instruction segment in chained line')],
    };
  }
  if (isChainDirectiveOrDeclaration(statementText)) {
    return {
      items: [],
      diagnostics: [
        chainDiagnostic(
          line,
          statementColumn,
          'directives must be on their own line; chained lines only support instructions and ops',
        ),
      ],
    };
  }

  const segmentLine = paddedSegmentLine(line, statementText, statementColumn);
  const opCall = parseOpInvocation(segmentLine);
  const overloads = opCall ? context.ops.get(opCall.name) : undefined;
  const statement =
    opCall && overloads
      ? {
          items: expandOpInvocation(
            context.ops,
            overloads,
            opCall.operands,
            segmentLine,
            context.diagnostics,
          ),
          diagnostics: [],
        }
      : parseChainInstruction(line, statementText, statementColumn);

  const items: SourceItem[] = [];
  if (labeled) {
    items.push({
      kind: 'label',
      name: labeled.name,
      ...(labeled.isEntry ? { isEntry: true } : {}),
      span: spanAt(line, labeled.labelColumn),
    });
  }
  items.push(...statement.items);
  return { items, diagnostics: statement.diagnostics };
}

function parseChainInstruction(
  line: LogicalLine,
  text: string,
  column: number,
): ParseNextSourceItemsResult {
  const instruction = parseZ80Instruction(text);
  if (instruction?.instruction) {
    return {
      items: [{ kind: 'instruction', instruction: instruction.instruction, span: spanAt(line, column) }],
      diagnostics: [],
    };
  }
  if (instruction?.diagnostics && instruction.diagnostics.length > 0) {
    return {
      items: [],
      diagnostics: instruction.diagnostics.map((message) => chainDiagnostic(line, column, message)),
    };
  }
  if (instruction?.error) {
    return { items: [], diagnostics: [chainDiagnostic(line, column, instruction.error)] };
  }
  return {
    items: [],
    diagnostics: [chainDiagnostic(line, column, `unsupported source line: ${text}`)],
  };
}

function appendChainComment(items: SourceItem[], line: LogicalLine): void {
  const comment = extractLineComment(line.text);
  if (!comment) return;
  items.push({
    kind: 'comment',
    text: comment,
    origin: 'user',
    span: spanAt(line, firstColumn(line.text)),
  });
}

function isChainDirectiveOrDeclaration(text: string): boolean {
  return (
    /^\./.test(text) ||
    /^(?:org|equ|db|dw|ds|align|include|import|binfrom|binto|cstr|pstr|istr|end|enum|type|union|field|byte|word|addr|endtype|endunion|typealias|if|else|endif|op)\b/i.test(text) ||
    /^[A-Za-z_.$?][A-Za-z0-9_.$?]*\s+\.?(?:equ|enum|type|union|typealias)\b/i.test(text)
  );
}

function paddedSegmentLine(line: LogicalLine, text: string, column: number): LogicalLine {
  return { ...line, text: `${' '.repeat(Math.max(0, column - 1))}${text}` };
}

function spanAt(line: LogicalLine, column: number): SourceSpan {
  return {
    sourceName: line.sourceName,
    line: line.line,
    column,
    ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
    ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
  };
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}

function chainDiagnostic(line: LogicalLine, column: number, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_PARSE',
    message,
    sourceName: line.sourceName,
    line: line.line,
    column,
  };
}

export type CompileOptions = CompileNextOptions;

export function compileSource(
  sourceText: string,
  options: CompileOptions = {},
): CompileSourceResult {
  const source = createSourceFile(options.entryName ?? '<memory>', sourceText);
  const { diagnostics, items } = parseNextSourceItems(scanLogicalLines(source));

  if (diagnostics.length > 0) {
    return {
      diagnostics,
      symbols: {},
      bytes: new Uint8Array(),
      hexText: writeIntelHex(0, new Uint8Array()),
    };
  }

  const assembly = assembleProgram(items);
  const allDiagnostics = [...diagnostics, ...assembly.diagnostics];
  return {
    diagnostics: allDiagnostics,
    symbols: assembly.symbols,
    bytes: assembly.bytes,
    hexText: writeIntelHex(
      assembly.origin,
      assembly.bytes,
      assembly.reservedAddresses,
      assembly.initializedAddresses,
    ),
  };
}

/** @deprecated Use {@link compileSource}. */
export const compileNext = compileSource;

function isTopLevelEnd(text: string): boolean {
  return /^(?:\.end|end)\s*$/i.test(stripLineComment(text).trim());
}

function isPostEndParseAllowed(text: string): boolean {
  return /^(?:\.binfrom|\.binto|binfrom|binto)\b/i.test(stripLineComment(text).trim());
}
