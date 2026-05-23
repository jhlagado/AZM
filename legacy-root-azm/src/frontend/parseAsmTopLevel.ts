import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceSpan } from './ast.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import { parseAsmStreamLine } from './parseAsmStream.js';
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
