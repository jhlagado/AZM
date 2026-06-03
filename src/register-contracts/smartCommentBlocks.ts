import type { LocatedSmartComment, RegisterContractsRoutine } from './types.js';
import { isCompactSourceCommentLine, parseSmartCommentLine } from './smartCommentParsing.js';

function isCommentOnlyLine(line: string): boolean {
  return /^\s*;/.test(line);
}

export function collectPrecedingCommentBlock(
  routine: RegisterContractsRoutine,
  sourceTexts: ReadonlyMap<string, string>,
): { comments: LocatedSmartComment[]; complete: boolean } {
  const source = sourceTexts.get(routine.span.file);
  if (source === undefined) return { comments: [], complete: false };
  const lines = source.split(/\r?\n/);
  const rawBlock: Array<{ line: number; text: string }> = [];

  for (let index = routine.span.start.line - 2; index >= 0; index -= 1) {
    const text = lines[index] ?? '';
    if (!isCommentOnlyLine(text)) break;
    rawBlock.push({ line: index + 1, text });
  }

  rawBlock.reverse();
  let compactStart = rawBlock.length;
  while (compactStart > 0 && isCompactSourceCommentLine(rawBlock[compactStart - 1]?.text ?? '')) {
    compactStart -= 1;
  }

  const relevantBlock = compactStart < rawBlock.length ? rawBlock.slice(compactStart) : rawBlock;
  return {
    complete: compactStart < rawBlock.length,
    comments: relevantBlock.flatMap((item) => {
      const parsed = parseSmartCommentLine(item.text);
      return parsed ? [{ file: routine.span.file, line: item.line, comment: parsed }] : [];
    }),
  };
}
