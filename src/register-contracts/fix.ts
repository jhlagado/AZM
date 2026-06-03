import { getZ80InstructionEffect } from '../z80/effects.js';
import { instructionSuccessors, labelIndex } from './controlFlow.js';
import { contractCarrierList } from './report.js';
import { joinSourceLines, splitSourceLines } from './sourceText.js';
import type {
  RegisterContractsInstruction,
  RegisterContractsOutputCandidate,
  RegisterContractsRoutine,
  RegisterContractsUnit,
} from './types.js';
import type { Z80Instruction } from '../z80/instruction.js';

export interface RegisterContractsExpectOutFix {
  file: string;
  line: number;
  column: number;
  routine: string;
  carriers: RegisterContractsUnit[];
}

const REGISTER_READ_UNITS: Readonly<Record<string, readonly RegisterContractsUnit[]>> = {
  bc: ['B', 'C'],
  de: ['D', 'E'],
  hl: ['H', 'L'],
  ix: ['IXH', 'IXL'],
  iy: ['IYH', 'IYL'],
  sp: ['SPH', 'SPL'],
  af: ['A'],
};

interface ContinuationState {
  readonly index: number;
  readonly pending: RegisterContractsUnit[];
}

function sameLocation(
  a: RegisterContractsInstruction,
  b: RegisterContractsOutputCandidate,
): boolean {
  return a.file === b.file && a.line === b.line && a.column === b.column;
}

function isUnconditionalDirectCall(item: RegisterContractsInstruction): boolean {
  const effect = getZ80InstructionEffect(item.instruction);
  return (
    effect.control.kind === 'call' &&
    effect.control.target !== undefined &&
    !effect.control.conditional
  );
}

function operandReadsUnit(
  operand: { readonly kind: string; readonly register?: string },
  unit: RegisterContractsUnit,
): boolean {
  switch (operand.kind) {
    case 'reg8':
      return operand.register?.toLowerCase() === unit.toLowerCase();
    case 'reg16':
    case 'reg-index16': {
      return operand.register !== undefined && registerNameReadsUnit(operand.register, unit);
    }
    case 'reg-half-index':
      return operand.register?.toLowerCase() === unit.toLowerCase();
    case 'reg-indirect':
    case 'indexed':
      return operand.register !== undefined && registerNameReadsUnit(operand.register, unit);
    default:
      return false;
  }
}

function registerNameReadsUnit(registerName: string, unit: RegisterContractsUnit): boolean {
  return REGISTER_READ_UNITS[registerName.toLowerCase()]?.includes(unit) ?? false;
}

function instructionDataReadsUnit(
  instruction: Z80Instruction,
  unit: RegisterContractsUnit,
): boolean {
  switch (instruction.mnemonic) {
    case 'ld':
      return operandReadsUnit(instruction.source, unit);
    case 'push':
      return registerNameReadsUnit(instruction.register, unit);
    case 'out':
      if (instruction.source.kind === 'zero') return false;
      return operandReadsUnit(instruction.source, unit);
    case 'inc':
    case 'dec':
      return operandReadsUnit(instruction.operand, unit);
    default:
      return false;
  }
}

function continuationReads(
  routine: RegisterContractsRoutine,
  callIndex: number,
  carriers: RegisterContractsUnit[],
): RegisterContractsUnit[] {
  const labels = labelIndex(routine);
  const confirmed = new Set<RegisterContractsUnit>();
  const work = initialContinuationWork(routine, callIndex, carriers);
  const seen = new Set<string>();
  let steps = 0;

  while (work.length > 0 && steps < 512) {
    steps += 1;
    const state = work.pop()!;
    const item = routine.instructions[state.index];
    const pending = unseenContinuationPending(state, confirmed, seen);
    if (!item || pending.length === 0) continue;

    const effect = getZ80InstructionEffect(item.instruction);
    const remaining = remainingContinuationUnits(item, pending, confirmed);
    if (remaining.length === 0) continue;

    for (const next of instructionSuccessors(routine, state.index, effect, labels)) {
      work.push({ index: next, pending: remaining });
    }
  }

  return carriers.filter((unit) => confirmed.has(unit));
}

function initialContinuationWork(
  routine: RegisterContractsRoutine,
  callIndex: number,
  carriers: readonly RegisterContractsUnit[],
): ContinuationState[] {
  return callIndex + 1 < routine.instructions.length
    ? [{ index: callIndex + 1, pending: [...new Set(carriers)] }]
    : [];
}

function unseenContinuationPending(
  state: ContinuationState,
  confirmed: ReadonlySet<RegisterContractsUnit>,
  seen: Set<string>,
): RegisterContractsUnit[] {
  const pending = state.pending.filter((unit) => !confirmed.has(unit));
  if (pending.length === 0) return [];
  const key = `${state.index}:${pending.join(',')}`;
  if (seen.has(key)) return [];
  seen.add(key);
  return pending;
}

function remainingContinuationUnits(
  item: RegisterContractsInstruction,
  pending: readonly RegisterContractsUnit[],
  confirmed: Set<RegisterContractsUnit>,
): RegisterContractsUnit[] {
  const effect = getZ80InstructionEffect(item.instruction);
  const reads = new Set(effect.reads);
  const writes = new Set(effect.writes);
  const remaining: RegisterContractsUnit[] = [];

  for (const unit of pending) {
    if (isConfirmedContinuationRead(item, unit, reads)) {
      confirmed.add(unit);
    } else if (!writes.has(unit)) {
      remaining.push(unit);
    }
  }

  return remaining;
}

function isConfirmedContinuationRead(
  item: RegisterContractsInstruction,
  unit: RegisterContractsUnit,
  reads: ReadonlySet<RegisterContractsUnit>,
): boolean {
  return reads.has(unit) && instructionDataReadsUnit(item.instruction, unit);
}

function findExpectOutFixes(
  routines: RegisterContractsRoutine[],
  candidates: RegisterContractsOutputCandidate[],
): RegisterContractsExpectOutFix[] {
  const out: RegisterContractsExpectOutFix[] = [];
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

export function findExpectOutFixesForCandidates(
  routines: RegisterContractsRoutine[],
  candidates: RegisterContractsOutputCandidate[],
): RegisterContractsExpectOutFix[] {
  return findExpectOutFixes(routines, candidates);
}

export function autoFixableCandidateKeys(
  routines: RegisterContractsRoutine[],
  candidates: RegisterContractsOutputCandidate[],
): Set<string> {
  const fixes = findExpectOutFixes(routines, candidates);
  const out = new Set<string>();
  for (const fix of fixes) {
    out.add(`${fix.file}:${fix.line}:${fix.column}`);
  }
  return out;
}

function isExpectOutLine(line: string): boolean {
  return /^\s*;\s*expects\s+out\b/i.test(line);
}

function expectedCallLine(
  originalLines: string[],
  fix: RegisterContractsExpectOutFix,
): string | undefined {
  return originalLines[fix.line - 1]?.trim();
}

function findCallLineIndex(
  lines: string[],
  originalLines: string[],
  fix: RegisterContractsExpectOutFix,
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
  fixes: RegisterContractsExpectOutFix[],
  referenceSource = source,
): string {
  if (fixes.length === 0) return source;
  const originalLines = referenceSource.split(/\r?\n/);
  const sourceLines = splitSourceLines(source);
  const { lines } = sourceLines;
  const sorted = [...fixes].sort((a, b) => b.line - a.line || b.column - a.column);

  for (const fix of sorted) {
    const index = findCallLineIndex(lines, originalLines, fix);
    if (index === undefined) continue;
    if (index > 0 && isExpectOutLine(lines[index - 1] ?? '')) continue;
    const prefix = indentation(lines[index] ?? '');
    lines.splice(index, 0, `${prefix}; expects out ${contractCarrierList(fix.carriers)}`);
  }

  return joinSourceLines(sourceLines);
}
