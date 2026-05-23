import type { ProgramNode } from '../../legacy-root-azm/src/frontend/ast.js';
import { parseSourceFile } from '../../legacy-root-azm/src/frontend/parser.js';
import type { SourceFile } from '../../legacy-root-azm/src/frontend/source.js';
import type { Diagnostic } from '../../legacy-root-azm/src/diagnosticTypes.js';

type ParserRawLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

export function parseSingleFileProgram(
  path: string,
  sourceText: string,
  diagnostics: Diagnostic[],
): ProgramNode {
  const sourceFile = parseSourceFile(path, sourceText, diagnostics);
  return {
    kind: 'Program',
    span: sourceFile.span,
    entryFile: path,
    files: [sourceFile],
  };
}

export function createRawLineGetter(file: SourceFile): (lineIndex: number) => ParserRawLine {
  return (lineIndex) => {
    const startOffset = file.lineStarts[lineIndex] ?? 0;
    const nextStart = file.lineStarts[lineIndex + 1] ?? file.text.length;
    let rawWithEol = file.text.slice(startOffset, nextStart);
    if (rawWithEol.endsWith('\n')) rawWithEol = rawWithEol.slice(0, -1);
    if (rawWithEol.endsWith('\r')) rawWithEol = rawWithEol.slice(0, -1);
    return {
      raw: rawWithEol,
      startOffset,
      endOffset: startOffset + rawWithEol.length,
      lineNo: lineIndex + 1,
      filePath: file.path,
    };
  };
}
