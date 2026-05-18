import { getZ80InstructionEffect } from '../z80/effects.js';
import { azmDocList } from './report.js';
import type {
  RegisterCareInstruction,
  RegisterCareOutputCandidate,
  RegisterCareRoutine,
  RegisterCareUnit,
} from './types.js';

export interface RegisterCareExpectOutFix {
  file: string;
  line: number;
  column: number;
  routine: string;
  carriers: RegisterCareUnit[];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function sameLocation(a: RegisterCareInstruction, b: RegisterCareOutputCandidate): boolean {
  return a.file === b.file && a.line === b.line && a.column === b.column;
}

function isUnconditionalDirectCall(item: RegisterCareInstruction): boolean {
  const effect = getZ80InstructionEffect(item.instruction);
  return (
    effect.control.kind === 'call' &&
    effect.control.target !== undefined &&
    !effect.control.conditional
  );
}

function labelIndex(routine: RegisterCareRoutine): Map<string, number> {
  const out = new Map<string, number>();
  routine.instructions.forEach((item, index) => {
    for (const label of item.labels) out.set(label, index);
  });
  return out;
}

function localTargetIndex(
  labels: ReadonlyMap<string, number>,
  target: string | undefined,
): number | undefined {
  if (!target) return undefined;
  return labels.get(target);
}

function successors(
  routine: RegisterCareRoutine,
  index: number,
  labels: ReadonlyMap<string, number>,
): number[] {
  const item = routine.instructions[index];
  if (!item) return [];
  const effect = getZ80InstructionEffect(item.instruction);
  const next = index + 1 < routine.instructions.length ? index + 1 : undefined;

  if (effect.control.kind === 'fallthrough') return next === undefined ? [] : [next];
  if (effect.control.kind === 'jump') {
    const target = localTargetIndex(labels, effect.control.target);
    if (effect.control.conditional) {
      return unique([
        ...(target === undefined ? [] : [target]),
        ...(next === undefined ? [] : [next]),
      ]);
    }
    return target === undefined ? [] : [target];
  }
  return [];
}

function continuationReads(
  routine: RegisterCareRoutine,
  callIndex: number,
  carriers: RegisterCareUnit[],
): RegisterCareUnit[] {
  const labels = labelIndex(routine);
  const confirmed = new Set<RegisterCareUnit>();
  const work: Array<{ index: number; pending: RegisterCareUnit[] }> =
    callIndex + 1 < routine.instructions.length
      ? [{ index: callIndex + 1, pending: unique(carriers) }]
      : [];
  const seen = new Set<string>();
  let steps = 0;

  while (work.length > 0 && steps < 512) {
    steps += 1;
    const state = work.pop()!;
    const pending = state.pending.filter((unit) => !confirmed.has(unit));
    if (pending.length === 0) continue;

    const key = `${state.index}:${pending.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const item = routine.instructions[state.index];
    if (!item) continue;
    const effect = getZ80InstructionEffect(item.instruction);
    const reads = new Set(effect.reads);
    const writes = new Set(effect.writes);
    const remaining: RegisterCareUnit[] = [];

    for (const unit of pending) {
      if (reads.has(unit)) {
        confirmed.add(unit);
        continue;
      }
      if (!writes.has(unit)) remaining.push(unit);
    }
    if (remaining.length === 0) continue;

    for (const next of successors(routine, state.index, labels)) {
      work.push({ index: next, pending: remaining });
    }
  }

  return carriers.filter((unit) => confirmed.has(unit));
}

export function findExpectOutFixes(
  routines: RegisterCareRoutine[],
  candidates: RegisterCareOutputCandidate[],
): RegisterCareExpectOutFix[] {
  const out: RegisterCareExpectOutFix[] = [];
  for (const routine of routines) {
    for (let index = 0; index < routine.instructions.length; index += 1) {
      const item = routine.instructions[index]!;
      if (!isUnconditionalDirectCall(item)) continue;
      const candidate = candidates.find((entry) => sameLocation(item, entry));
      if (!candidate) continue;
      const carriers = continuationReads(routine, index, candidate.carriers);
      if (carriers.length === 0) continue;
      out.push({ ...candidate, carriers });
    }
  }
  return out;
}

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

function isExpectOutLine(line: string): boolean {
  return /^\s*;\s*(?:!\s*@expect-out|expects\s+out)\b/i.test(line);
}

function expectedCallLine(
  originalLines: string[],
  fix: RegisterCareExpectOutFix,
): string | undefined {
  return originalLines[fix.line - 1]?.trim();
}

function findCallLineIndex(
  lines: string[],
  originalLines: string[],
  fix: RegisterCareExpectOutFix,
): number | undefined {
  const expected = expectedCallLine(originalLines, fix);
  if (!expected) return undefined;
  const preferred = fix.line - 1;
  if (lines[preferred]?.trim() === expected) return preferred;

  let best: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== expected) continue;
    const distance = Math.abs(index - preferred);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function indentation(line: string): string {
  return line.match(/^\s*/)?.[0] ?? '';
}

export function applyExpectOutFixesToSource(
  source: string,
  fixes: RegisterCareExpectOutFix[],
  referenceSource = source,
): string {
  if (fixes.length === 0) return source;
  const originalLines = referenceSource.split(/\r?\n/);
  const { lines, trailingNewline, eol } = splitLines(source);
  const sorted = [...fixes].sort((a, b) => b.line - a.line || b.column - a.column);

  for (const fix of sorted) {
    const index = findCallLineIndex(lines, originalLines, fix);
    if (index === undefined) continue;
    if (index > 0 && isExpectOutLine(lines[index - 1] ?? '')) continue;
    const prefix = indentation(lines[index] ?? '');
    lines.splice(index, 0, `${prefix}; expects out ${azmDocList(fix.carriers)}`);
  }

  return joinLines(lines, trailingNewline, eol);
}
