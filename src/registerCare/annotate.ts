import { renderRegisterCareSourceBlock } from './report.js';
import type { RegisterCareRoutine, RoutineSummary } from './types.js';

export interface RegisterCareAnnotatedFile {
  path: string;
  text: string;
}

interface RegisterCareAnnotationInput {
  routine: RegisterCareRoutine;
  summary: RoutineSummary;
}

const GENERATED_DIVIDER_RE = /^\s*;\s*=+\s+AZM\s*$/i;
const GENERATED_COMPACT_LINE_RE =
  /^\s*;\s*!\s*(?:in|out|maybe-out|clobbers|preserves)(?:\s|$)/i;

function lineEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function splitLines(text: string): {
  lines: string[];
  trailingNewline: boolean;
  eol: '\n' | '\r\n';
} {
  const eol = lineEnding(text);
  const trailingNewline = text.endsWith('\n');
  const lines = text.split(/\r?\n/);
  if (trailingNewline) lines.pop();
  return { lines, trailingNewline, eol };
}

function joinLines(lines: string[], trailingNewline: boolean, eol: '\n' | '\r\n'): string {
  const text = lines.join(eol);
  return trailingNewline ? `${text}${eol}` : text;
}

function isCommentLine(line: string): boolean {
  return /^\s*;/.test(line);
}

function isGeneratedDivider(line: string): boolean {
  return GENERATED_DIVIDER_RE.test(line);
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

  const commentStart = precedingCommentBlockStart(lines, labelIndex);
  if (commentStart === undefined) return undefined;
  const dividers: number[] = [];
  for (let index = commentStart; index < labelIndex; index += 1) {
    if (isGeneratedDivider(lines[index] ?? '')) dividers.push(index);
  }
  if (dividers.length < 2) return undefined;
  return { start: dividers[dividers.length - 2]!, end: dividers[dividers.length - 1]! };
}

function hasPrecedingCommentBlock(lines: string[], labelIndex: number): boolean {
  return precedingCommentBlockStart(lines, labelIndex) !== undefined;
}

function isExplicitEntryRoutine(routine: RegisterCareRoutine): boolean {
  return routine.entryLabels?.includes(routine.name) === true;
}

function annotateFile(source: string, routines: RegisterCareAnnotationInput[]): string {
  const { lines, trailingNewline, eol } = splitLines(source);
  const sorted = [...routines].sort(
    (a, b) => b.routine.span.start.line - a.routine.span.start.line,
  );

  for (const item of sorted) {
    const labelIndex = item.routine.span.start.line - 1;
    if (labelIndex < 0 || labelIndex > lines.length) continue;
    const block = renderRegisterCareSourceBlock(item.summary);
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

  return joinLines(lines, trailingNewline, eol);
}

export function annotateRegisterCareContracts(
  sourceTexts: ReadonlyMap<string, string>,
  routines: RegisterCareAnnotationInput[],
): RegisterCareAnnotatedFile[] {
  const byFile = new Map<string, RegisterCareAnnotationInput[]>();
  for (const item of routines) {
    if (!sourceTexts.has(item.routine.span.file)) continue;
    const items = byFile.get(item.routine.span.file) ?? [];
    items.push(item);
    byFile.set(item.routine.span.file, items);
  }

  const out: RegisterCareAnnotatedFile[] = [];
  for (const [file, items] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    const source = sourceTexts.get(file);
    if (source === undefined) continue;
    const text = annotateFile(source, items);
    if (text !== source) out.push({ path: file, text });
  }
  return out;
}
