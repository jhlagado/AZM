import { renderRegisterCareSourceBlock } from './report.js';
import type {
  RegisterCareAnnotationFile,
  RegisterCareOutputCandidate,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
} from './types.js';

function formatCandidateUnits(units: readonly RegisterCareUnit[]): string {
  return units.length === 1 ? units[0]! : `{${units.join(',')}}`;
}

function formatCarrierLineWithExpectOut(
  indentation: string,
  units: readonly RegisterCareUnit[],
): string {
  return `${indentation}; expects out ${formatCandidateUnits(units)}`;
}

function formatCarrierLineWithMaybeOut(
  indentation: string,
  units: readonly RegisterCareUnit[],
): string {
  return `${indentation};!      ${'maybe-out'.padEnd(10)}${formatCandidateUnits(units)}`;
}

function isGeneratedRegisterContractLine(line: string): boolean {
  return /^\s*;!\s*(in|out|clobbers|preserves|maybe-out)\b/i.test(line);
}

function isOutputCandidateHintLine(line: string): boolean {
  return /^\s*;\s*expects\s+out\b/i.test(line) || /^\s*;\s*!\s*maybe-out\b/i.test(line);
}

function normalizeLineEnding(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function splitSourceLines(text: string): string[] {
  return normalizeLineEnding(text).split('\n');
}

function lineDeltaForCandidate(
  line: number,
  deltas: readonly { anchorLine: number; delta: number }[],
): number {
  let shift = 0;
  for (const delta of deltas) {
    if (delta.anchorLine < line) {
      shift += delta.delta;
    }
  }
  return shift;
}

function applyOutputCandidateHints(
  sourceText: string,
  outputCandidates: readonly RegisterCareOutputCandidate[],
  candidateFixability: ReadonlyMap<string, boolean>,
  deltas: readonly { anchorLine: number; delta: number }[],
  outputCandidateKey: (file: string, line: number, column: number) => string,
): string {
  const lines = splitSourceLines(sourceText);
  const grouped = new Map<
    number,
    {
      carriers: RegisterCareUnit[];
      autoFixable: boolean;
    }
  >();

  for (const candidate of outputCandidates) {
    const adjustedLine = candidate.line + lineDeltaForCandidate(candidate.line, deltas);
    const existing = grouped.get(adjustedLine);
    const autoFixable =
      candidateFixability.get(
        outputCandidateKey(candidate.file, candidate.line, candidate.column),
      ) ?? false;
    if (existing === undefined) {
      grouped.set(adjustedLine, { carriers: [...candidate.carriers], autoFixable });
      continue;
    }
    const carriers = existing.carriers;
    for (const carrier of candidate.carriers) {
      if (!carriers.includes(carrier)) {
        carriers.push(carrier);
      }
    }
    existing.autoFixable = existing.autoFixable && autoFixable;
  }

  const candidates = [...grouped.entries()]
    .map(([line, entry]) => ({ line, ...entry }))
    .sort((left, right) => right.line - left.line);

  for (const candidate of candidates) {
    const index = candidate.line - 1;
    if (index < 0 || index > lines.length) continue;
    if (index > 0 && isOutputCandidateHintLine(lines[index - 1] ?? '')) continue;
    const indentation = lines[index]?.match(/^\s*/)?.[0] ?? '';
    const hint = candidate.autoFixable
      ? formatCarrierLineWithExpectOut(indentation, candidate.carriers)
      : formatCarrierLineWithMaybeOut(indentation, candidate.carriers);
    lines.splice(index, 0, hint);
  }

  return lines.join('\n');
}

interface RoutineAnnotationResult {
  text: string;
  deltas: { anchorLine: number; delta: number }[];
}

function annotateSourceFile(
  sourceText: string,
  routines: readonly RegisterCareRoutine[],
  summariesByName: ReadonlyMap<string, RoutineSummary>,
): RoutineAnnotationResult | undefined {
  const routineLines = Array.from(routines)
    .filter((routine) => summariesByName.has(routine.name))
    .sort((left, right) => right.span.start.line - left.span.start.line);

  if (routineLines.length === 0) return undefined;

  const lines = splitSourceLines(sourceText);
  let changed = false;
  const deltas: { anchorLine: number; delta: number }[] = [];

  for (const routine of routineLines) {
    const summary = summariesByName.get(routine.name);
    if (!summary) continue;

    const insertLine = routine.span.start.line - 1;
    if (insertLine < 0 || insertLine > lines.length) continue;

    const generatedLines = renderRegisterCareSourceBlock(summary);
    if (generatedLines.length === 0) continue;

    let start = insertLine;
    for (
      let index = insertLine - 1;
      index >= 0 && isGeneratedRegisterContractLine(lines[index] ?? '');
      index -= 1
    ) {
      start = index;
    }
    if (
      start === insertLine ||
      lines.slice(start, insertLine).some((line) => line.trim().length === 0)
    ) {
      start = insertLine;
    }

    const existing = lines.slice(start, insertLine);
    if (
      existing.length !== generatedLines.length ||
      existing.some((line, index) => line !== generatedLines[index])
    ) {
      changed = true;
      deltas.push({
        anchorLine: routine.span.start.line,
        delta: generatedLines.length - (insertLine - start),
      });
      lines.splice(start, insertLine - start, ...generatedLines);
    }
  }

  if (!changed) return undefined;
  return {
    text: lines.join('\n'),
    deltas,
  };
}

export function buildAnnotations(
  loaded: {
    sourceTexts: ReadonlyMap<string, string>;
  },
  programRoutines: readonly RegisterCareRoutine[],
  summariesByName: ReadonlyMap<string, RoutineSummary>,
  outputCandidates: readonly RegisterCareOutputCandidate[],
  options: {
    fixOutputCandidates: boolean;
    outputCandidateFixability: ReadonlyMap<string, boolean>;
    outputCandidateKey: (file: string, line: number, column: number) => string;
  },
): readonly RegisterCareAnnotationFile[] {
  const byFile = new Map<string, RegisterCareRoutine[]>();
  for (const routine of programRoutines) {
    if (!summariesByName.has(routine.name)) continue;
    const file = byFile.get(routine.span.file);
    if (file === undefined) {
      byFile.set(routine.span.file, [routine]);
    } else {
      file.push(routine);
    }
  }

  const out: RegisterCareAnnotationFile[] = [];
  for (const [path, routines] of byFile) {
    const sourceText = loaded.sourceTexts.get(path);
    if (sourceText === undefined) continue;
    let text = sourceText;
    let deltas: { anchorLine: number; delta: number }[] = [];
    const annotation = annotateSourceFile(sourceText, routines, summariesByName);
    if (annotation !== undefined) {
      text = annotation.text;
      deltas = annotation.deltas;
    }

    if (options.fixOutputCandidates) {
      const candidatesForFile = outputCandidates.filter((candidate) => candidate.file === path);
      if (candidatesForFile.length > 0) {
        text = applyOutputCandidateHints(
          text,
          candidatesForFile,
          options.outputCandidateFixability,
          deltas,
          options.outputCandidateKey,
        );
      }
    }

    if (text !== sourceText) out.push({ path, text });
  }
  return out;
}
