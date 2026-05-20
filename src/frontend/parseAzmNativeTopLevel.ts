import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceSpan } from './ast.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import {
  azmNativeUnsupportedDiagnostic,
  consumeThroughBlockEnd,
  type RawLineReader,
} from './azmNativeUnsupported.js';
import { parseAzmAsmStreamLine } from './parseAzmAsmStream.js';
import { parseAzmFlatDirectiveLine } from './parseAzmFlatDirectiveLine.js';
import { topLevelStartKeyword } from './parseModuleCommon.js';
import type { ParseItemContext, ParseItemResult } from './parseModuleItemDispatch.js';

export interface ParseAzmNativeTopLevelInput {
  index: number;
  filePath: string;
  lineNo: number;
  rest: string;
  stmtSpan: SourceSpan;
  diagnostics: Diagnostic[];
  ctx: Extract<ParseItemContext, { scope: 'module' }>;
  lineCount: number;
  getRawLine: RawLineReader;
  hasExportPrefix?: boolean;
  aliasPolicy?: DirectiveAliasPolicy;
}

function consumeNativeExport(args: ParseAzmNativeTopLevelInput, keyword: string | undefined): number {
  switch (keyword) {
    case 'op':
    case 'type':
    case 'union':
      return consumeThroughBlockEnd(args.index, args.lineCount, args.getRawLine);
    default:
      return args.index + 1;
  }
}

export function parseAzmNativeTopLevel(args: ParseAzmNativeTopLevelInput): ParseItemResult | undefined {
  const keyword = topLevelStartKeyword(args.rest);
  if (args.hasExportPrefix) {
    azmNativeUnsupportedDiagnostic(
      args.diagnostics,
      args.filePath,
      args.lineNo,
      'Export declarations are not supported in AZM-native source; use textual includes and ordinary labels/constants.',
    );
    return { nextIndex: consumeNativeExport(args, keyword) };
  }

  if (keyword !== undefined) {
    return undefined;
  }

  const directiveItems = parseAzmFlatDirectiveLine({
    rest: args.rest,
    stmtSpan: args.stmtSpan,
    filePath: args.filePath,
    lineNo: args.lineNo,
    diagnostics: args.diagnostics,
    ctx: args.ctx,
    ...(args.aliasPolicy ? { aliasPolicy: args.aliasPolicy } : {}),
  });
  if (directiveItems !== undefined) {
    return { nextIndex: args.index + 1, nodes: directiveItems };
  }

  const azmAsmItems = parseAzmAsmStreamLine({
    rest: args.rest,
    filePath: args.filePath,
    stmtSpan: args.stmtSpan,
    diagnostics: args.diagnostics,
    nativeMode: true,
  });
  if (azmAsmItems === undefined) return undefined;

  return {
    nextIndex: args.index + 1,
    nodes: azmAsmItems,
  };
}
