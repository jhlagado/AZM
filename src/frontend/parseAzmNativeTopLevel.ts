import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import type { ModuleItemNode, SourceSpan } from './ast.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import { azmNativeUnsupportedDiagnostic, type RawLineReader } from './azmNativeUnsupported.js';
import { parseAzmAsmStreamLine, type AzmAsmStreamItem } from './parseAzmAsmStream.js';
import { parseAzmClassicModuleLine } from './parseAzmClassicModuleLine.js';
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
  aliasPolicy?: DirectiveAliasPolicy;
}

function nativeUnsupportedMessage(keyword: string): string | undefined {
  switch (keyword) {
    case 'func':
      return 'Function declarations are not supported in AZM-native source; use assembly labels with CALL and RET.';
    case 'section':
      return 'Named section blocks are not supported in AZM-native source; use ORG, labels, and .db/.dw/.ds directives.';
    case 'data':
      return 'Typed data blocks are not supported in AZM-native source; use labels with .db/.dw/.ds plus sizeof/offset constants.';
    case 'globals':
    case 'var':
      return 'Typed storage blocks are not supported in AZM-native source; use explicit labels and assembler directives.';
    case 'extern':
      return 'Typed extern declarations are not supported in AZM-native source; use AZMI/register-care interface contracts for external routines.';
    default:
      return undefined;
  }
}

function consumeNativeUnsupportedBlock(args: ParseAzmNativeTopLevelInput, keyword: string): number {
  if (keyword !== 'data' && keyword !== 'globals' && keyword !== 'var' && keyword !== 'extern') {
    return args.index + 1;
  }

  let index = args.index + 1;
  while (index < args.lineCount) {
    const text = args.getRawLine(index).raw.replace(/;.*/, '').trim();
    if (text.length === 0) {
      index++;
      continue;
    }
    if (text.toLowerCase() === 'end') return index + 1;
    if (topLevelStartKeyword(text) !== undefined) return index;
    index++;
  }
  return index;
}

function rejectDeprecatedNativeAsm(
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
  if (keyword !== undefined) {
    const unsupportedMessage = nativeUnsupportedMessage(keyword);
    if (unsupportedMessage) {
      const id =
        keyword === 'func' || keyword === 'section'
          ? DiagnosticIds.ParseError
          : DiagnosticIds.AzmDeprecatedZaxConstruct;
      args.diagnostics.push({
        id,
        severity: 'error',
        message: unsupportedMessage,
        file: args.filePath,
        line: args.lineNo,
        column: 1,
      });
      return { nextIndex: consumeNativeUnsupportedBlock(args, keyword) };
    }
    return undefined;
  }

  if (!args.ctx.asmControlStack) args.ctx.asmControlStack = [];

  const classicItems = parseAzmClassicModuleLine({
    rest: args.rest,
    stmtSpan: args.stmtSpan,
    filePath: args.filePath,
    lineNo: args.lineNo,
    diagnostics: args.diagnostics,
    ctx: args.ctx,
    ...(args.aliasPolicy ? { aliasPolicy: args.aliasPolicy } : {}),
  });
  if (classicItems !== undefined) {
    return { nextIndex: args.index + 1, nodes: classicItems };
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
    nodes: rejectDeprecatedNativeAsm(
      azmAsmItems,
      args.diagnostics,
      args.filePath,
      args.lineNo,
    ),
  };
}
