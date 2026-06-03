import { renderRegisterContractsSourceBlock } from './report.js';
import { joinSourceLines, splitSourceLines } from './sourceText.js';
import type { RegisterContractsRoutine, RoutineSummary } from './types.js';

export interface RegisterContractsAnnotatedFile {
  path: string;
  text: string;
}

interface RegisterContractsAnnotationInput {
  routine: RegisterContractsRoutine;
  summary: RoutineSummary;
}

const GENERATED_COMPACT_LINE_RE = /^\s*;\s*!\s*(?:in|out|maybe-out|clobbers|preserves)(?:\s|$)/i;

function isCommentLine(line: string): boolean {
  return /^\s*;/.test(line);
}

function isGeneratedCompactLine(line: string): boolean {
  return GENERATED_COMPACT_LINE_RE.test(line);
}

function precedingCommentBlockStart(lines: string[], labelIndex: number): number | undefined {
  let index = labelIndex - 1;
  if (index < 0 || !isCommentLine(lines[index] ?? '')) return undefined;
  while (index >= 0 && isCommentLine(lines[index] ?? '')) index -= 1;
  return index + 1;
}

function generatedBlockBeforeLabel(
  lines: string[],
  labelIndex: number,
): { start: number; end: number } | undefined {
  let compactStart = labelIndex;
  while (compactStart > 0 && isGeneratedCompactLine(lines[compactStart - 1] ?? '')) {
    compactStart -= 1;
  }
  if (compactStart < labelIndex) return { start: compactStart, end: labelIndex - 1 };
  return undefined;
}

function hasPrecedingCommentBlock(lines: string[], labelIndex: number): boolean {
  return precedingCommentBlockStart(lines, labelIndex) !== undefined;
}

function isExplicitEntryRoutine(routine: RegisterContractsRoutine): boolean {
  return routine.entryLabels?.includes(routine.name) === true;
}

function annotateFile(source: string, routines: RegisterContractsAnnotationInput[]): string {
  const sourceLines = splitSourceLines(source);
  const { lines } = sourceLines;
  const sorted = [...routines].sort(
    (a, b) => b.routine.span.start.line - a.routine.span.start.line,
  );

  for (const item of sorted) {
    const labelIndex = item.routine.span.start.line - 1;
    if (labelIndex < 0 || labelIndex > lines.length) continue;
    const block = renderRegisterContractsSourceBlock(item.summary);
    const hasContractContent = block.length > 0;
    const existing = generatedBlockBeforeLabel(lines, labelIndex);
    if (existing) {
      lines.splice(
        existing.start,
        existing.end - existing.start + 1,
        ...(hasContractContent ? block : []),
      );
      continue;
    }
    if (!hasContractContent) continue;
    if (!isExplicitEntryRoutine(item.routine) && !hasPrecedingCommentBlock(lines, labelIndex)) {
      continue;
    }
    lines.splice(labelIndex, 0, ...block);
  }

  return joinSourceLines(sourceLines);
}

export function annotateRegisterContractsContracts(
  sourceTexts: ReadonlyMap<string, string>,
  routines: RegisterContractsAnnotationInput[],
): RegisterContractsAnnotatedFile[] {
  const byFile = new Map<string, RegisterContractsAnnotationInput[]>();
  for (const item of routines) {
    if (!sourceTexts.has(item.routine.span.file)) continue;
    const items = byFile.get(item.routine.span.file) ?? [];
    items.push(item);
    byFile.set(item.routine.span.file, items);
  }

  const out: RegisterContractsAnnotatedFile[] = [];
  for (const [file, items] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    const source = sourceTexts.get(file);
    if (source === undefined) continue;
    const text = annotateFile(source, items);
    if (text !== source) out.push({ path: file, text });
  }
  return out;
}
