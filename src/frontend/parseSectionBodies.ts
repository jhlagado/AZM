import type { Diagnostic } from '../diagnosticTypes.js';
import type { SectionItemNode, SourceSpan } from './ast.js';
import { parseDataDeclLine } from './parseData.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import type { ParseItemContext, ParseItemResult } from './parseModuleItemDispatch.js';
import {
  parseBareRawDataDirective,
  parseRawDataDirective,
  type PendingRawLabel,
} from './parseRawDataDirectives.js';

export type SectionParseContext = Extract<ParseItemContext, { scope: 'section' }>;

export function looksLikeRawDataDirectiveStart(text: string): boolean {
  return /^(db|dw|ds)\b/i.test(text) || /^[A-Za-z_][A-Za-z0-9_]*\s*:\s*(db|dw|ds)\b/i.test(text);
}

function reportMissingRawDataDirective(
  diagnostics: Diagnostic[],
  label: PendingRawLabel,
): void {
  diag(diagnostics, label.filePath, `Raw data label "${label.name}" is missing a directive`, {
    line: label.lineNo,
    column: 1,
  });
}

export function maybeCloseSection(
  index: number,
  text: string,
  ctx: SectionParseContext,
  diagnostics: Diagnostic[],
): ParseItemResult | undefined {
  if (text.toLowerCase() !== 'end') return undefined;
  if (ctx.pendingRawLabel) {
    reportMissingRawDataDirective(diagnostics, ctx.pendingRawLabel);
    delete ctx.pendingRawLabel;
  }
  return { nextIndex: index + 1, sectionClosed: true };
}

export function parseSectionBodyItem(args: {
  index: number;
  ctx: SectionParseContext;
  rest: string;
  lineNo: number;
  filePath: string;
  stmtSpan: SourceSpan;
  diagnostics: Diagnostic[];
}): ParseItemResult | undefined {
  const { index, ctx, rest, lineNo, filePath, stmtSpan, diagnostics } = args;

  if (ctx.sectionKind === 'data') {
    if (ctx.pendingRawLabel) {
      const parsedRaw = parseRawDataDirective(
        ctx.pendingRawLabel,
        rest,
        lineNo,
        stmtSpan,
        filePath,
        diagnostics,
      );
      if (parsedRaw) {
        ctx.directDeclNamesLower.add(ctx.pendingRawLabel.name.toLowerCase());
        delete ctx.pendingRawLabel;
        return { nextIndex: index + 1, node: parsedRaw };
      }
      reportMissingRawDataDirective(diagnostics, ctx.pendingRawLabel);
      delete ctx.pendingRawLabel;
    }

    const inlineMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(db|dw|ds)\b(.*)$/i.exec(rest);
    if (inlineMatch) {
      const labelName = inlineMatch[1]!;
      const labelLower = labelName.toLowerCase();
      if (ctx.directDeclNamesLower.has(labelLower)) {
        diag(diagnostics, filePath, `Duplicate data declaration name "${labelName}".`, {
          line: lineNo,
          column: 1,
        });
        return { nextIndex: index + 1 };
      }
      const label: PendingRawLabel = { name: labelName, span: stmtSpan, lineNo, filePath };
      const parsedRaw = parseRawDataDirective(
        label,
        inlineMatch[2]! + inlineMatch[3]!,
        lineNo,
        stmtSpan,
        filePath,
        diagnostics,
      );
      if (!parsedRaw) return { nextIndex: index + 1 };
      ctx.directDeclNamesLower.add(labelLower);
      return { nextIndex: index + 1, node: parsedRaw };
    }

    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(rest);
    if (labelMatch) {
      const labelName = labelMatch[1]!;
      const labelLower = labelName.toLowerCase();
      if (ctx.directDeclNamesLower.has(labelLower)) {
        diag(diagnostics, filePath, `Duplicate data declaration name "${labelName}".`, {
          line: lineNo,
          column: 1,
        });
        return { nextIndex: index + 1 };
      }
      ctx.pendingRawLabel = { name: labelName, span: stmtSpan, lineNo, filePath };
      return { nextIndex: index + 1 };
    }

    if (looksLikeRawDataDirectiveStart(rest)) {
      const parsedBare = parseBareRawDataDirective(rest, lineNo, stmtSpan, filePath, diagnostics);
      if (parsedBare) {
        return { nextIndex: index + 1, node: parsedBare };
      }
    }
  } else if (looksLikeRawDataDirectiveStart(rest)) {
    diag(
      diagnostics,
      filePath,
      `Raw data directives are only permitted inside data sections.`,
      { line: lineNo, column: 1 },
    );
    return { nextIndex: index + 1 };
  }

  const labelOnly = /^[A-Za-z_][A-Za-z0-9_]*\s*:\s*$/.test(rest);
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(rest) && !(ctx.sectionKind === 'code' && labelOnly)) {
    const sectionDataDecl = parseDataDeclLine({
      allowOmittedInitializer: true,
      allowInferredArrayLength: false,
      modulePath: filePath,
      diagnostics,
      lineNo,
      text: rest,
      span: stmtSpan,
      seenNames: ctx.directDeclNamesLower,
    });
    if (!sectionDataDecl) return { nextIndex: index + 1 };
    if (ctx.sectionKind !== 'data') {
      diag(diagnostics, filePath, `Data declarations are only permitted inside data sections.`, {
        line: lineNo,
        column: 1,
      });
      return { nextIndex: index + 1 };
    }
    return { nextIndex: index + 1, node: sectionDataDecl };
  }

  return undefined;
}

export function parseSectionItems(args: {
  startIndex: number;
  lineCount: number;
  sectionKind: 'code' | 'data';
  diagnostics: Diagnostic[];
  parseModuleItem: (index: number, ctx: SectionParseContext) => ParseItemResult;
}): {
  items: SectionItemNode[];
  nextIndex: number;
  closed: boolean;
} {
  const { startIndex, lineCount, sectionKind, diagnostics, parseModuleItem } = args;
  const items: SectionItemNode[] = [];
  const ctx: SectionParseContext = {
    scope: 'section',
    sectionKind,
    directDeclNamesLower: new Set<string>(),
  };
  let index = startIndex;

  while (index < lineCount) {
    const parsed = parseModuleItem(index, ctx);
    if (parsed.sectionClosed) {
      delete ctx.pendingRawLabel;
      return { items, nextIndex: parsed.nextIndex, closed: true };
    }
    if (parsed.node) items.push(parsed.node as SectionItemNode);
    index = parsed.nextIndex;
  }

  if (ctx.pendingRawLabel) {
    reportMissingRawDataDirective(diagnostics, ctx.pendingRawLabel);
    delete ctx.pendingRawLabel;
  }

  return { items, nextIndex: index, closed: false };
}
