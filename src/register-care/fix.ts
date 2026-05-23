import { getZ80InstructionEffect } from '../z80/effects.js';
import { instructionSuccessors, labelIndex } from './controlFlow.js';
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

function continuationReads(
  routine: RegisterCareRoutine,
  callIndex: number,
  carriers: RegisterCareUnit[],
): RegisterCareUnit[] {
  const labels = labelIndex(routine);
  const confirmed = new Set<RegisterCareUnit>();
  const work: Array<{ index: number; pending: RegisterCareUnit[] }> =
    callIndex + 1 < routine.instructions.length
      ? [{ index: callIndex + 1, pending: [...new Set(carriers)] }]
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

    for (const next of instructionSuccessors(routine, state.index, effect, labels)) {
      work.push({ index: next, pending: remaining });
    }
  }

  return carriers.filter((unit) => confirmed.has(unit));
}

function findExpectOutFixes(
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

export function autoFixableCandidateKeys(
  routines: RegisterCareRoutine[],
  candidates: RegisterCareOutputCandidate[],
): Set<string> {
  const fixes = findExpectOutFixes(routines, candidates);
  const out = new Set<string>();
  for (const fix of fixes) {
    out.add(`${fix.file}:${fix.line}:${fix.column}`);
  }
  return out;
}
