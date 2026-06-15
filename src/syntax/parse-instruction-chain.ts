import type { Diagnostic } from '../model/diagnostic.js';
import { splitInstructionChain } from '../source/instruction-chain.js';
import type { ParsedLeadingLabel } from './names.js';
import { hasLeadingLabel, parseLeadingLabel } from './names.js';
import { isChainedDirectiveOrDeclaration } from './statement-classification.js';

interface InstructionChainLine {
  readonly text: string;
}

export interface ParseChainStatementResult<TItem> {
  readonly items: readonly TItem[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseInstructionChainOptions<TLine extends InstructionChainLine, TItem> {
  readonly line: TLine;
  readonly parseStatement: (
    line: TLine,
    statementText: string,
    statementColumn: number,
  ) => ParseChainStatementResult<TItem>;
  readonly makeLabelItem: (label: ParsedLeadingLabel, line: TLine) => TItem;
  readonly makeDiagnostic: (line: TLine, column: number, message: string) => Diagnostic;
  readonly appendLineComment?: (items: TItem[], line: TLine) => void;
}

export interface ParseInstructionChainResult<TItem> {
  readonly items: readonly TItem[];
  readonly diagnostics: readonly Diagnostic[];
}

export function parseInstructionChain<TLine extends InstructionChainLine, TItem>(
  options: ParseInstructionChainOptions<TLine, TItem>,
): ParseInstructionChainResult<TItem> | undefined {
  const segments = splitInstructionChain(options.line.text);
  if (segments === undefined) return undefined;

  const items: TItem[] = [];
  const diagnostics: Diagnostic[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const parsed = parseInstructionChainSegment(options, segment.text, segment.column, index);
    diagnostics.push(...parsed.diagnostics);
    items.push(...parsed.items);
  }

  options.appendLineComment?.(items, options.line);
  return { items, diagnostics };
}

function parseInstructionChainSegment<TLine extends InstructionChainLine, TItem>(
  options: ParseInstructionChainOptions<TLine, TItem>,
  text: string,
  column: number,
  segmentIndex: number,
): ParseInstructionChainResult<TItem> {
  if (text.length === 0) {
    return {
      items: [],
      diagnostics: [
        options.makeDiagnostic(options.line, column, 'empty instruction segment in chained line'),
      ],
    };
  }

  if (segmentIndex > 0 && hasLeadingLabel(text)) {
    return {
      items: [],
      diagnostics: [
        options.makeDiagnostic(
          options.line,
          column,
          'labels are only allowed before the first chained instruction',
        ),
      ],
    };
  }

  const labeled = segmentIndex === 0 ? parseLeadingLabel(text, column) : undefined;
  const statementText = labeled?.statementText ?? text;
  const statementColumn = labeled?.statementColumn ?? column;
  if (statementText.length === 0) {
    return {
      items: [],
      diagnostics: [
        options.makeDiagnostic(
          options.line,
          statementColumn,
          'empty instruction segment in chained line',
        ),
      ],
    };
  }
  if (isChainedDirectiveOrDeclaration(statementText)) {
    return {
      items: [],
      diagnostics: [
        options.makeDiagnostic(
          options.line,
          statementColumn,
          'directives must be on their own line; chained lines only support instructions and ops',
        ),
      ],
    };
  }

  const items: TItem[] = [];
  if (labeled) {
    items.push(options.makeLabelItem(labeled, options.line));
  }
  const statement = options.parseStatement(options.line, statementText, statementColumn);
  items.push(...statement.items);
  return { items, diagnostics: statement.diagnostics };
}
