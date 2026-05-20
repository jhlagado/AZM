import type { Diagnostic } from '../diagnosticTypes.js';
import type { ModuleItemNode, SourceSpan } from './ast.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import {
  azmNativeUnsupportedDiagnostic,
  consumeThroughBlockEnd,
  type RawLineReader,
} from './azmNativeUnsupported.js';
import { parseAzmAsmStreamLine, type AzmAsmStreamItem } from './parseAzmAsmStream.js';
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

function rejectRemovedNativeAsm(
  nodes: AzmAsmStreamItem[],
  diagnostics: Diagnostic[],
  filePath: string,
  lineNo: number,
): ModuleItemNode[] {
  const accepted: ModuleItemNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'AsmInstruction' && node.head === ':=') {
      azmNativeUnsupportedDiagnostic(
        diagnostics,
        filePath,
        lineNo,
        'Typed assignment is not supported in AZM-native source; use explicit Z80 instructions and layout constants.',
      );
      continue;
    }
    if (
      node.kind === 'If' ||
      node.kind === 'Else' ||
      node.kind === 'End' ||
      node.kind === 'While' ||
      node.kind === 'Repeat' ||
      node.kind === 'Until' ||
      node.kind === 'Select' ||
      node.kind === 'Case' ||
      node.kind === 'SelectElse'
    ) {
      azmNativeUnsupportedDiagnostic(
        diagnostics,
        filePath,
        lineNo,
        'Structured control is not supported in AZM-native source; use explicit labels and branch instructions.',
      );
      continue;
    }
    accepted.push(node);
  }
  return accepted;
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

  if (!args.ctx.asmControlStack) args.ctx.asmControlStack = [];

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
    asmControlStack: args.ctx.asmControlStack,
    nativeMode: true,
  });
  if (azmAsmItems === undefined) return undefined;

  return {
    nextIndex: args.index + 1,
    nodes: rejectRemovedNativeAsm(
      azmAsmItems,
      args.diagnostics,
      args.filePath,
      args.lineNo,
    ),
  };
}
