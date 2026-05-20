import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceSpan } from './ast.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import { parseAsmLine } from './asm80/asmLine.js';
import { parseAsmStreamLine } from './parseAsmStream.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { parseAsmFlatDirectiveLine } from './parseAsmFlatDirectiveLine.js';
import { topLevelStartKeyword } from './parseTopLevelCommon.js';
import type { ParseItemContext, ParseItemResult } from './parseSourceItemDispatch.js';

export interface ParseAsmTopLevelInput {
  index: number;
  filePath: string;
  lineNo: number;
  rest: string;
  stmtSpan: SourceSpan;
  diagnostics: Diagnostic[];
  ctx: Extract<ParseItemContext, { scope: 'source' }>;
  aliasPolicy?: DirectiveAliasPolicy;
  asmStringEquates?: Map<string, string>;
}

function canonicalDirectiveForRejectedAlias(head: string): string | undefined {
  switch (head.toLowerCase()) {
    case 'defb':
      return 'DB';
    case 'defw':
      return 'DW';
    case 'rmb':
      return 'DS';
    default:
      return undefined;
  }
}

function headColumn(raw: string, head: string, label?: string): number {
  const searchStart = label ? raw.indexOf(':') + 1 : 0;
  const index = raw.toLowerCase().indexOf(head.toLowerCase(), searchStart);
  return index < 0 ? 1 : index + 1;
}

export function parseAsmTopLevel(args: ParseAsmTopLevelInput): ParseItemResult | undefined {
  const keyword = topLevelStartKeyword(args.rest);
  if (keyword !== undefined) {
    return undefined;
  }

  const directiveItems = parseAsmFlatDirectiveLine({
    rest: args.rest,
    stmtSpan: args.stmtSpan,
    filePath: args.filePath,
    lineNo: args.lineNo,
    diagnostics: args.diagnostics,
    ctx: args.ctx,
    ...(args.aliasPolicy ? { aliasPolicy: args.aliasPolicy } : {}),
    stringEquates: args.asmStringEquates ?? new Map(),
  });
  if (directiveItems !== undefined) {
    return { nextIndex: args.index + 1, nodes: directiveItems };
  }

  const parsedLine = parseAsmLine(
    args.filePath,
    args.rest,
    args.lineNo,
    args.stmtSpan.start.offset,
    args.aliasPolicy,
  );
  if (parsedLine?.kind === 'instruction') {
    const canonicalDirective = canonicalDirectiveForRejectedAlias(parsedLine.head);
    if (canonicalDirective) {
      diag(
        args.diagnostics,
        args.filePath,
        `${parsedLine.head.toUpperCase()} is not part of the supported ASM80 baseline; use ${canonicalDirective}.`,
        { line: args.lineNo, column: headColumn(args.rest, parsedLine.head, parsedLine.label) },
      );
      return { nextIndex: args.index + 1, nodes: [] };
    }
  }

  const asmItems = parseAsmStreamLine({
    rest: args.rest,
    filePath: args.filePath,
    stmtSpan: args.stmtSpan,
    diagnostics: args.diagnostics,
  });
  if (asmItems === undefined) return undefined;

  return {
    nextIndex: args.index + 1,
    nodes: asmItems,
  };
}
