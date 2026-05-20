import type { Diagnostic } from '../diagnosticTypes.js';
import type { ModuleItemNode, RawDataDeclNode, SourceSpan } from './ast.js';
import { parseClassicLine } from './asm80/classicLine.js';
import { parseClassicRawValues } from './asm80/parseClassicModule.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
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
  if (/^(?:[A-Za-z_][A-Za-z0-9_]*\s*:\s*)?\.?(db|dw|ds)\b/i.test(trimmed)) return true;
  return /^(?:[A-Za-z_][A-Za-z0-9_]*\s*:\s*)?\.?(org|align|equ|binfrom|binto|end)\b/i.test(trimmed);
}

function normalizeRawDataDirectiveText(text: string): string | undefined {
  const match = /^\.?(db|dw|ds)\b(.*)$/i.exec(text.trim());
  if (!match) return undefined;
  return `${match[1]!.toLowerCase()}${match[2]!}`;
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

function classicRawDataToNode(
  parsed: Extract<ReturnType<typeof parseClassicLine>, { kind: 'rawData' }>,
  stmtSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
  label?: PendingRawLabel,
): ModuleItemNode {
  const values = parseClassicRawValues(
    filePath,
    parsed.valuesText,
    stmtSpan,
    diagnostics,
    new Map(),
  );
  if (parsed.directive === 'ds') {
    return {
      kind: 'ClassicRawData',
      span: stmtSpan,
      name: parsed.label ?? label?.name,
      directive: 'ds',
      values,
      size: values[0],
      fill: values[1],
      valuesText: '',
    } as unknown as ModuleItemNode;
  }
  return {
    kind: 'ClassicRawData',
    span: stmtSpan,
    name: parsed.label ?? label?.name,
    directive: parsed.directive,
    values,
    valuesText: parsed.valuesText,
  } as unknown as ModuleItemNode;
}

/** Parses one source-file line of ASM80-style directives for native `.azm` input. */
export function parseAzmClassicModuleLine(args: {
  rest: string;
  stmtSpan: SourceSpan;
  filePath: string;
  lineNo: number;
  diagnostics: Diagnostic[];
  ctx: Extract<ParseItemContext, { scope: 'module' }>;
  aliasPolicy?: DirectiveAliasPolicy;
}): ModuleItemNode[] | undefined {
  const { rest, stmtSpan, filePath, lineNo, diagnostics, ctx, aliasPolicy } = args;
  const trimmed = rest.trim();
  const parsedClassic = parseClassicLine(
    filePath,
    trimmed,
    lineNo,
    stmtSpan.start.offset,
    aliasPolicy,
  );
  if (
    !isAzmClassicDirectiveLine(trimmed, ctx.azmPendingRawLabel) &&
    parsedClassic?.kind !== 'rawData' &&
    parsedClassic?.kind !== 'equ' &&
    parsedClassic?.kind !== 'org' &&
    parsedClassic?.kind !== 'align' &&
    parsedClassic?.kind !== 'binfrom' &&
    parsedClassic?.kind !== 'binto' &&
    parsedClassic?.kind !== 'end' &&
    parsedClassic?.kind !== 'unsupportedDirective'
  ) {
    return undefined;
  }

  if (ctx.azmPendingRawLabel) {
    const pending = ctx.azmPendingRawLabel;
    if (parsedClassic?.kind === 'rawData') {
      delete ctx.azmPendingRawLabel;
      return [classicRawDataToNode(parsedClassic, stmtSpan, filePath, diagnostics, pending)];
    }
    const normalizedRaw = normalizeRawDataDirectiveText(trimmed);
    const parsedRaw = normalizedRaw
      ? parseRawDataDirective(pending, normalizedRaw, lineNo, stmtSpan, filePath, diagnostics)
      : undefined;
    delete ctx.azmPendingRawLabel;
    if (parsedRaw) return [rawDataDeclToClassic(parsedRaw)];
    diag(diagnostics, filePath, `Raw data label "${pending.name}" is missing a directive`, {
      line: pending.lineNo,
      column: 1,
    });
    return [];
  }

  const inlineLabelRaw = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\.?(db|dw|ds)\b(.*)$/i.exec(trimmed);
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

  const inlineLabelEqu = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\.?equ\b\s*(.+)$/i.exec(trimmed);
  if (inlineLabelEqu) {
    const exprText = inlineLabelEqu[2]!.trim();
    return [
      {
        kind: 'ClassicEqu',
        span: stmtSpan,
        name: inlineLabelEqu[1]!,
        exprText,
        value: parseImmExprFromText(filePath, exprText, stmtSpan, diagnostics),
      } as ModuleItemNode,
    ];
  }

  const bareEqu = /^([A-Za-z_][A-Za-z0-9_]*)\s+\.?equ\b\s*(.+)$/i.exec(trimmed);
  if (bareEqu) {
    const exprText = bareEqu[2]!.trim();
    return [
      {
        kind: 'ClassicEqu',
        span: stmtSpan,
        name: bareEqu[1]!,
        exprText,
        value: parseImmExprFromText(filePath, exprText, stmtSpan, diagnostics),
      } as ModuleItemNode,
    ];
  }

  const labelOnly = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(trimmed);
  if (labelOnly) {
    ctx.azmPendingRawLabel = { name: labelOnly[1]!, span: stmtSpan, lineNo, filePath };
    return [];
  }

  const bareRawText = normalizeRawDataDirectiveText(trimmed);
  const bareRaw = bareRawText
    ? parseBareRawDataDirective(bareRawText, lineNo, stmtSpan, filePath, diagnostics)
    : undefined;
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

  const parsed = parsedClassic;
  if (!parsed) return undefined;
  if (parsed.kind === 'instruction' || parsed.kind === 'label') return undefined;

  switch (parsed.kind) {
    case 'rawData':
      return [classicRawDataToNode(parsed, stmtSpan, filePath, diagnostics)];
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
      diag(diagnostics, filePath, `Unsupported ASM80 directive ".${parsed.directive}".`, {
        line: lineNo,
        column: 1,
      });
      return [];
    default:
      return undefined;
  }
}
