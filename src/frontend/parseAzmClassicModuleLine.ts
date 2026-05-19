import type { Diagnostic } from '../diagnosticTypes.js';
import type { ModuleItemNode, RawDataDeclNode, SourceSpan } from './ast.js';
import { parseClassicLine } from './asm80/classicLine.js';
import { parseImmExprFromText } from './parseImm.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { looksLikeRawDataDirectiveStart } from './parseSectionBodies.js';
import type { ParseItemContext } from './parseModuleItemDispatch.js';
import {
  parseBareRawDataDirective,
  parseRawDataDirective,
  type PendingRawLabel,
} from './parseRawDataDirectives.js';

function isAzmClassicDirectiveLine(rest: string, pending?: PendingRawLabel): boolean {
  const trimmed = rest.trim();
  if (pending) return true;
  if (looksLikeRawDataDirectiveStart(trimmed)) return true;
  return /^(?:[A-Za-z_][A-Za-z0-9_]*\s*:\s*)?\.?(org|align|equ|binfrom|binto|end)\b/i.test(trimmed);
}

function rawDataDeclToClassic(decl: RawDataDeclNode): ModuleItemNode {
  if (decl.directive === 'ds') {
    return {
      kind: 'ClassicRawData',
      span: decl.span,
      name: decl.name,
      directive: 'ds',
      size: decl.size,
      valuesText: '',
    } as unknown as ModuleItemNode;
  }
  return {
    kind: 'ClassicRawData',
    span: decl.span,
    name: decl.name,
    directive: decl.directive,
    values: decl.values,
    valuesText: '',
  } as unknown as ModuleItemNode;
}

/** Parses one module line of ASM80-style directives for native `.azm` modules. */
export function parseAzmClassicModuleLine(args: {
  rest: string;
  stmtSpan: SourceSpan;
  filePath: string;
  lineNo: number;
  diagnostics: Diagnostic[];
  ctx: Extract<ParseItemContext, { scope: 'module' }>;
}): ModuleItemNode[] | undefined {
  const { rest, stmtSpan, filePath, lineNo, diagnostics, ctx } = args;
  const trimmed = rest.trim();
  if (!isAzmClassicDirectiveLine(trimmed, ctx.azmPendingRawLabel)) return undefined;

  if (ctx.azmPendingRawLabel) {
    const pending = ctx.azmPendingRawLabel;
    const parsedRaw = parseRawDataDirective(pending, trimmed, lineNo, stmtSpan, filePath, diagnostics);
    delete ctx.azmPendingRawLabel;
    if (parsedRaw) return [rawDataDeclToClassic(parsedRaw)];
    diag(diagnostics, filePath, `Raw data label "${pending.name}" is missing a directive`, {
      line: pending.lineNo,
      column: 1,
    });
    return [];
  }

  const inlineLabelRaw = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(db|dw|ds)\b(.*)$/i.exec(trimmed);
  if (inlineLabelRaw) {
    const label: PendingRawLabel = {
      name: inlineLabelRaw[1]!,
      span: stmtSpan,
      lineNo,
      filePath,
    };
    const parsedRaw = parseRawDataDirective(
      label,
      inlineLabelRaw[2]! + inlineLabelRaw[3]!,
      lineNo,
      stmtSpan,
      filePath,
      diagnostics,
    );
    return parsedRaw ? [rawDataDeclToClassic(parsedRaw)] : [];
  }

  const labelOnly = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(trimmed);
  if (labelOnly) {
    ctx.azmPendingRawLabel = { name: labelOnly[1]!, span: stmtSpan, lineNo, filePath };
    return [];
  }

  const bareRaw = parseBareRawDataDirective(trimmed, lineNo, stmtSpan, filePath, diagnostics);
  if (bareRaw) return [rawDataDeclToClassic(bareRaw)];

  const orgMatch = /^\.?org\b\s*(.*)$/i.exec(trimmed);
  if (orgMatch) {
    const exprText = orgMatch[1]!.trim();
    return [
      {
        kind: 'ClassicOrg',
        span: stmtSpan,
        exprText,
        value: parseImmExprFromText(filePath, exprText, stmtSpan, diagnostics),
      } as ModuleItemNode,
    ];
  }

  const parsed = parseClassicLine(filePath, trimmed, lineNo, stmtSpan.start.offset);
  if (!parsed) return undefined;
  if (parsed.kind === 'instruction' || parsed.kind === 'label') return undefined;

  switch (parsed.kind) {
    case 'equ':
      return [
        {
          kind: 'ClassicEqu',
          span: stmtSpan,
          name: parsed.name,
          exprText: parsed.exprText,
          value: parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics),
        } as ModuleItemNode,
      ];
    case 'org':
      return [
        {
          kind: 'ClassicOrg',
          span: stmtSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics),
        } as ModuleItemNode,
      ];
    case 'binfrom':
      return [
        {
          kind: 'ClassicBinFrom',
          span: stmtSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics),
        } as ModuleItemNode,
      ];
    case 'binto':
      return [
        {
          kind: 'ClassicBinTo',
          span: stmtSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics),
        } as ModuleItemNode,
      ];
    case 'align': {
      const value = parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics);
      return value
        ? [{ kind: 'ClassicAlign', span: stmtSpan, value } as unknown as ModuleItemNode]
        : [];
    }
    case 'end':
      return [{ kind: 'ClassicEnd', span: stmtSpan } as ModuleItemNode];
    case 'unsupportedDirective':
      diag(
        diagnostics,
        filePath,
        `Unsupported ASM80 directive ".${parsed.directive}".`,
        { line: lineNo, column: 1 },
      );
      return [];
    default:
      return undefined;
  }
}
