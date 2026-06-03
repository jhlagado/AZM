import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { assembleProgram } from '../assembly/assemble-program.js';
import { writeIntelHex } from '../outputs/hex.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { createSourceFile } from '../source/source-file.js';
import { scanLogicalLines } from '../source/logical-lines.js';
import { stripLineComment } from '../source/strip-line-comment.js';
import { parseLogicalLine } from '../syntax/parse-line.js';
import { parseLayoutDeclarationAt } from '../syntax/parse-layout-declarations.js';
import {
  collectOps,
  expandOpInvocation,
  parseOpInvocation,
  type OpDecl,
} from '../expansion/op-expansion.js';
import type { DirectiveAliasPolicy } from '../syntax/directive-aliases.js';
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
