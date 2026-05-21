import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceItemNode, SourceSpan } from './ast.js';
import { parseAsmLine } from './asm80/asmLine.js';
import { parseAsmRawValues } from './asm80/parseAsmRawValues.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import { parseImmExprFromText } from './parseImm.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { looksLikeRawDataDirectiveStart } from './parseRawDataDirectiveStart.js';
import type { ParseItemContext } from './parseSourceItemDispatch.js';
import {
  parseBareRawDataDirective,
  parseRawDataDirective,
  parseRawDataSizeOperands,
  type PendingRawLabel,
} from './parseRawDataDirectives.js';

function isAsmFlatDirectiveLine(rest: string, pending?: PendingRawLabel): boolean {
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

function isStringEquate(name: string, stringEquates: Map<string, string>): boolean {
  const normalized = name.startsWith('@') ? name.slice(1) : name;
  return stringEquates.has(normalized.toLowerCase());
}

function directiveColumn(text: string, directive: string): number {
  const index = text.toLowerCase().indexOf(directive.toLowerCase());
  return index < 0 ? 1 : index + 1;
}

function asmRawDataToNode(
  parsed: Extract<ReturnType<typeof parseAsmLine>, { kind: 'rawData' }>,
  stmtSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
  stringEquates: Map<string, string>,
  label?: PendingRawLabel,
): SourceItemNode {
  if (parsed.directive === 'ds') {
    const ds = parseRawDataSizeOperands(
      parsed.valuesText,
      stmtSpan.start.line,
      stmtSpan,
      filePath,
      diagnostics,
    ) as Extract<SourceItemNode, { directive: 'ds' }> | undefined;
    return {
      kind: 'AsmRawData',
      span: stmtSpan,
      name: parsed.label ?? label?.name,
      directive: 'ds',
      size: ds?.size,
      fill: ds?.fill,
      valuesText: parsed.valuesText,
    } as SourceItemNode;
  }
  const values = parseAsmRawValues(filePath, parsed.valuesText, stmtSpan, diagnostics, stringEquates);
  return {
    kind: 'AsmRawData',
    span: stmtSpan,
    name: parsed.label ?? label?.name,
    directive: parsed.directive,
    values,
    valuesText: parsed.valuesText,
  } as SourceItemNode;
}

/** Parses one source-file line of ASM flat assembler directives. */
export function parseAsmFlatDirectiveLine(args: {
  rest: string;
  stmtSpan: SourceSpan;
  filePath: string;
  lineNo: number;
  diagnostics: Diagnostic[];
  ctx: Extract<ParseItemContext, { scope: 'source' }>;
  aliasPolicy?: DirectiveAliasPolicy;
  stringEquates: Map<string, string>;
}): SourceItemNode[] | undefined {
  const { rest, stmtSpan, filePath, lineNo, diagnostics, ctx, aliasPolicy, stringEquates } = args;
  const trimmed = rest.trim();
  const parsedAsm = parseAsmLine(filePath, trimmed, lineNo, stmtSpan.start.offset, aliasPolicy);
  if (ctx.asmEnded && parsedAsm?.kind !== 'binfrom' && parsedAsm?.kind !== 'binto') {
    return [];
  }
  if (
    !isAsmFlatDirectiveLine(trimmed, ctx.asmPendingRawLabel) &&
    parsedAsm?.kind !== 'rawData' &&
    parsedAsm?.kind !== 'equ' &&
    parsedAsm?.kind !== 'org' &&
    parsedAsm?.kind !== 'align' &&
    parsedAsm?.kind !== 'binfrom' &&
    parsedAsm?.kind !== 'binto' &&
    parsedAsm?.kind !== 'end' &&
    parsedAsm?.kind !== 'unsupportedDirective'
  ) {
    return undefined;
  }

  if (ctx.asmPendingRawLabel) {
    const pending = ctx.asmPendingRawLabel;
    if (parsedAsm?.kind === 'rawData') {
      delete ctx.asmPendingRawLabel;
      return [asmRawDataToNode(parsedAsm, stmtSpan, filePath, diagnostics, stringEquates, pending)];
    }
    const normalizedRaw = normalizeRawDataDirectiveText(trimmed);
    const parsedRaw = normalizedRaw
      ? parseRawDataDirective(pending, normalizedRaw, lineNo, stmtSpan, filePath, diagnostics)
      : undefined;
    delete ctx.asmPendingRawLabel;
    if (parsedRaw) return [parsedRaw];
    diag(diagnostics, filePath, `Raw data label "${pending.name}" is missing a directive`, {
      line: pending.lineNo,
      column: 1,
    });
    return [];
  }

  const inlineLabelRaw = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\.?(db|dw|ds)\b(.*)$/i.exec(trimmed);
  if (inlineLabelRaw) {
    return parsedAsm?.kind === 'rawData'
      ? [asmRawDataToNode(parsedAsm, stmtSpan, filePath, diagnostics, stringEquates)]
      : [];
  }

  const inlineLabelEqu = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\.?equ\b\s*(.+)$/i.exec(trimmed);
  if (inlineLabelEqu) {
    const exprText = inlineLabelEqu[2]!.trim();
    return [
      {
        kind: 'AsmEqu',
        span: stmtSpan,
        name: inlineLabelEqu[1]!,
        exprText,
        value: parseImmExprFromText(
          filePath,
          exprText,
          stmtSpan,
          diagnostics,
          !isStringEquate(inlineLabelEqu[1]!, stringEquates),
        ),
      } as SourceItemNode,
    ];
  }

  const bareEqu = /^([A-Za-z_][A-Za-z0-9_]*)\s+\.?equ\b\s*(.+)$/i.exec(trimmed);
  if (bareEqu) {
    const exprText = bareEqu[2]!.trim();
    return [
      {
        kind: 'AsmEqu',
        span: stmtSpan,
        name: bareEqu[1]!,
        exprText,
        value: parseImmExprFromText(
          filePath,
          exprText,
          stmtSpan,
          diagnostics,
          !isStringEquate(bareEqu[1]!, stringEquates),
        ),
      } as SourceItemNode,
    ];
  }

  const labelOnly = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(trimmed);
  if (labelOnly) {
    ctx.asmPendingRawLabel = { name: labelOnly[1]!, span: stmtSpan, lineNo, filePath };
    return [];
  }

  if (parsedAsm?.kind === 'rawData') {
    return [asmRawDataToNode(parsedAsm, stmtSpan, filePath, diagnostics, stringEquates)];
  }

  const bareRawText = normalizeRawDataDirectiveText(trimmed);
  const bareRaw = bareRawText
    ? parseBareRawDataDirective(bareRawText, lineNo, stmtSpan, filePath, diagnostics)
    : undefined;
  if (bareRaw) return [bareRaw];

  const orgMatch = /^\.?org\b\s*(.*)$/i.exec(trimmed);
  if (orgMatch) {
    const exprText = orgMatch[1]!.trim();
    return [
      {
        kind: 'AsmOrg',
        span: stmtSpan,
        exprText,
        value: parseImmExprFromText(filePath, exprText, stmtSpan, diagnostics),
      } as SourceItemNode,
    ];
  }

  const parsed = parsedAsm;
  if (!parsed) return undefined;
  if (parsed.kind === 'instruction' || parsed.kind === 'label') return undefined;

  switch (parsed.kind) {
    case 'equ':
      return [
        {
          kind: 'AsmEqu',
          span: stmtSpan,
          name: parsed.name,
          exprText: parsed.exprText,
          value: parseImmExprFromText(
            filePath,
            parsed.exprText,
            stmtSpan,
            diagnostics,
            !isStringEquate(parsed.name, stringEquates),
          ),
        } as SourceItemNode,
      ];
    case 'org':
      return [
        {
          kind: 'AsmOrg',
          span: stmtSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics),
        } as SourceItemNode,
      ];
    case 'binfrom':
      return [
        {
          kind: 'AsmBinFrom',
          span: stmtSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics),
        } as SourceItemNode,
      ];
    case 'binto':
      return [
        {
          kind: 'AsmBinTo',
          span: stmtSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics),
        } as SourceItemNode,
      ];
    case 'align': {
      const value = parseImmExprFromText(filePath, parsed.exprText, stmtSpan, diagnostics);
      return value ? [{ kind: 'AsmAlign', span: stmtSpan, value } as SourceItemNode] : [];
    }
    case 'end':
      ctx.asmEnded = true;
      return [{ kind: 'AsmEnd', span: stmtSpan } as SourceItemNode];
    case 'unsupportedDirective':
      diag(diagnostics, filePath, `Unsupported ASM80 directive ".${parsed.directive}".`, {
        line: lineNo,
        column: directiveColumn(trimmed, parsed.directive),
      });
      return [];
    default:
      return undefined;
  }
}
