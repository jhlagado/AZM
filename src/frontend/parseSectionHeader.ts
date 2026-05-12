import type { Diagnostic } from '../diagnosticTypes.js';
import type { NamedSectionNode, SectionAnchorNode } from './ast.js';
import { NAMED_SECTION_KINDS } from './grammarData.js';
import { parseImmExprFromText } from './parseImm.js';
import { diagInvalidHeaderLine } from './parseModuleCommon.js';
import { parseAlignDirectiveDecl } from './parseTopLevelSimple.js';

export type ParsedSectionHeader = {
  section: 'code' | 'data';
  name: string;
  anchor?: SectionAnchorNode;
};

type ParseSectionHeaderArgs = {
  sectionText: string;
  sectionSpan: NamedSectionNode['span'];
  lineNo: number;
  originalText: string;
  filePath: string;
  diagnostics: Diagnostic[];
  isReservedTopLevelName: (name: string) => boolean;
};

export function parseSectionHeader({
  sectionText,
  sectionSpan,
  lineNo,
  originalText,
  filePath,
  diagnostics,
  isReservedTopLevelName,
}: ParseSectionHeaderArgs): ParsedSectionHeader | undefined {
  const match = /^(\S+)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+at\s+(.+?)(?:\s+(size|end)\s+(.+))?)?$/i.exec(
    sectionText.trim(),
  );
  if (!match || !NAMED_SECTION_KINDS.has(match[1]!.toLowerCase())) {
    diagInvalidHeaderLine(
      diagnostics,
      filePath,
      'named section declaration',
      originalText,
      '<code|data> <name> [at <imm16> [size <n> | end <addr>]]',
      lineNo,
    );
    return undefined;
  }

  const section = match[1]!.toLowerCase() as 'code' | 'data';
  const name = match[2]!;
  const atText = match[3]?.trim();
  const rangeKeyword = match[4]?.toLowerCase();
  const rangeExprText = match[5]?.trim();

  let anchor: SectionAnchorNode | undefined;
  if (atText) {
    const at = parseImmExprFromText(filePath, atText, sectionSpan, diagnostics);
    if (!at) return undefined;
    let bound: SectionAnchorNode['bound'] = { kind: 'none' };
    anchor = {
      kind: 'SectionAnchor',
      span: sectionSpan,
      at,
      bound,
    };
    if (rangeKeyword && rangeExprText) {
      const rangeExpr = parseAlignDirectiveDecl(
        `align ${rangeExprText}`,
        rangeExprText,
        {
          diagnostics,
          modulePath: filePath,
          lineNo,
          text: originalText,
          span: sectionSpan,
          isReservedTopLevelName,
        },
      )?.value;
      if (!rangeExpr) return undefined;
      bound =
        rangeKeyword === 'size'
          ? { kind: 'size', size: rangeExpr }
          : { kind: 'end', end: rangeExpr };
      anchor.bound = bound;
    }
  }

  return { section, name, ...(anchor ? { anchor } : {}) };
}
