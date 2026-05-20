import type {
  AlignDirectiveNode,
  SourceSpan,
} from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseImmExprFromText } from './parseImm.js';
import { diagInvalidHeaderLine } from './parseModuleCommon.js';

type SimpleTopLevelContext = {
  diagnostics: Diagnostic[];
  modulePath: string;
  lineNo: number;
  text: string;
  span: SourceSpan;
  isReservedTopLevelName: (name: string) => boolean;
};

export function parseAlignDirectiveDecl(
  rest: string,
  alignTail: string | undefined,
  ctx: SimpleTopLevelContext,
): AlignDirectiveNode | undefined {
  const { diagnostics, modulePath, lineNo, text, span } = ctx;
  const exprText = rest === 'align' ? '' : (alignTail ?? '');
  if (exprText.length === 0) {
    diagInvalidHeaderLine(diagnostics, modulePath, 'align directive', text, '<imm16>', lineNo);
    return undefined;
  }
  const value = parseImmExprFromText(modulePath, exprText, span, diagnostics);
  if (!value) return undefined;
  return { kind: 'Align', span, value };
}
