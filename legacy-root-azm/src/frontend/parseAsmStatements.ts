import type { AsmItemNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseAsmInstruction } from './parseAsmInstruction.js';

type ParsedAsmStatement = AsmItemNode | AsmItemNode[] | undefined;

export function appendParsedAsmStatement(out: AsmItemNode[], parsed: ParsedAsmStatement): void {
  if (!parsed) return;
  if (Array.isArray(parsed)) {
    out.push(...parsed);
    return;
  }
  out.push(parsed);
}

export function parseAsmStatement(
  filePath: string,
  text: string,
  stmtSpan: SourceSpan,
  diagnostics: Diagnostic[],
): ParsedAsmStatement {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  return parseAsmInstruction(filePath, trimmed, stmtSpan, diagnostics);
}
