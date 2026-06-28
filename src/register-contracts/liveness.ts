import { getZ80InstructionEffect } from '../z80/effects.js';
import { precedingCServiceName, precedingRegisterImmediateValue } from './boundaryHints.js';
import { instructionSuccessors, labelIndex } from './controlFlow.js';
import {
  rstDispatcherServiceTargetNames,
  rstServiceTargetName,
  rstTargetName,
} from './profiles.js';
import type {
  LocatedSmartComment,
  InstructionEffect,
  RegisterContractsConflict,
  RegisterContractsInstruction,
  RegisterContractsOutputCandidate,
  RegisterContractsRoutine,
  RegisterContractsUnit,
  RoutineSummary,
} from './types.js';

type BoundaryTarget = {
  targets: string[];
  conditional: boolean;
  subject: string;
};

type ResolvedBoundary = {
  item: RegisterContractsInstruction;
  index: number;
  boundary: BoundaryTarget;
  target: string;
  summary: RoutineSummary;
};

function unique<T>(units: T[]): T[] {
  return [...new Set(units)];
}

function boundaryTarget(
  routine: RegisterContractsRoutine,
  index: number,
  effect: InstructionEffect,
): BoundaryTarget | undefined {
  const item = routine.instructions[index];
  return (
    callBoundaryTarget(effect) ??
    tailJumpBoundaryTarget(item, effect) ??
    rstBoundaryTarget(routine, index, effect)
  );
}

function callBoundaryTarget(effect: InstructionEffect): BoundaryTarget | undefined {
  return effect.control.kind === 'call' && effect.control.target
    ? {
        targets: [effect.control.target],
        conditional: effect.control.conditional,
        subject: `CALL ${effect.control.target}`,
      }
    : undefined;
}

function tailJumpBoundaryTarget(
  item: RegisterContractsInstruction | undefined,
  effect: InstructionEffect,
): BoundaryTarget | undefined {
  if (!isTailJumpBoundary(item, effect)) return undefined;
  return {
    targets: [effect.control.target],
    conditional: false,
    subject: `JP ${effect.control.target}`,
  };
}

function isTailJumpBoundary(
  item: RegisterContractsInstruction | undefined,
  effect: InstructionEffect,
): effect is InstructionEffect & {
  readonly control: { readonly kind: 'jump'; readonly target: string };
} {
  return (
    effect.control.kind === 'jump' &&
    item?.instruction.mnemonic === 'jp' &&
    !effect.control.conditional &&
    effect.control.target !== undefined &&
    !effect.control.target.startsWith('.')
  );
}

function rstBoundaryTarget(
  routine: RegisterContractsRoutine,
  index: number,
  effect: InstructionEffect,
): BoundaryTarget | undefined {
  if (effect.control.kind !== 'rst' || effect.control.vector === undefined) return undefined;

  const target = rstTargetName(effect.control.vector);
  return {
    targets: rstBoundaryTargets(routine, index, effect.control.vector, target),
    conditional: false,
    subject: target,
  };
}

function rstBoundaryTargets(
  routine: RegisterContractsRoutine,
  index: number,
  vector: number,
  fallbackTarget: string,
): string[] {
  const previous = routine.instructions[index - 1];
  const service = precedingCServiceName(previous);
  const numericService = precedingRegisterImmediateValue(previous, 'C');
  return [
    ...(numericService !== undefined ? [rstServiceTargetName(vector, String(numericService))] : []),
    ...rstDispatcherServiceTargetNames(vector, (register) =>
      precedingRegisterImmediateValue(previous, register),
    ),
    ...(service ? [rstServiceTargetName(vector, service)] : []),
    fallbackTarget,
  ];
}

function summaryForBoundary(
  boundary: BoundaryTarget,
  summaries: Map<string, RoutineSummary>,
): { target: string; summary: RoutineSummary } | undefined {
  for (const target of boundary.targets) {
    const summary = summaries.get(target);
    if (summary) return { target, summary };
  }
  return undefined;
}

function hintUnitsForLine(
  hints: LocatedSmartComment[],
  file: string,
  callLine: number,
): RegisterContractsUnit[] {
  const prior = hints.find(
    (hint) => hint.file === file && hint.line === callLine - 1 && hint.comment.kind === 'expectOut',
  );
  return prior?.comment.kind === 'expectOut' ? unique(prior.comment.carriers) : [];
}

function outputUnits(summary: RoutineSummary): RegisterContractsUnit[] {
  return unique(summary.valueRelations.flatMap((relation) => relation.out));
}

function setEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  if (left.size !== right.size) return false;
  for (const item of left) if (!right.has(item)) return false;
  return true;
}

function unionLive(sets: Iterable<ReadonlySet<RegisterContractsUnit>>): Set<RegisterContractsUnit> {
  const out = new Set<RegisterContractsUnit>();
  for (const set of sets) {
    for (const unit of set) out.add(unit);
  }
  return out;
}

function transferLiveBefore(
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  boundary: BoundaryTarget | undefined,
  summary: RoutineSummary | undefined,
  liveAfter: ReadonlySet<RegisterContractsUnit>,
  hints: LocatedSmartComment[],
): Set<RegisterContractsUnit> {
  const live = liveBeforeBoundary(item, boundary, summary, liveAfter, hints);
  removeInstructionWrites(live, effect);
  addInstructionReads(live, item, effect, liveAfter);
  return live;
}

function liveBeforeBoundary(
  item: RegisterContractsInstruction,
  boundary: BoundaryTarget | undefined,
  summary: RoutineSummary | undefined,
  liveAfter: ReadonlySet<RegisterContractsUnit>,
  hints: LocatedSmartComment[],
): Set<RegisterContractsUnit> {
  const live = new Set<RegisterContractsUnit>(liveAfter);
  if (boundary && summary) {
    applyBoundarySummary(live, item, boundary, summary, hints);
  }
  return live;
}

function applyBoundarySummary(
  live: Set<RegisterContractsUnit>,
  item: RegisterContractsInstruction,
  boundary: BoundaryTarget,
  summary: RoutineSummary,
  hints: LocatedSmartComment[],
): void {
  const accepted = acceptedOutputUnits(item, summary, hints);
  if (!boundary.conditional) {
    for (const unit of summary.mayWrite) live.delete(unit);
    for (const unit of accepted) live.delete(unit);
  }
  for (const unit of summary.mayRead) live.add(unit);
}

function acceptedOutputUnits(
  item: RegisterContractsInstruction,
  summary: RoutineSummary,
  hints: LocatedSmartComment[],
): Set<RegisterContractsUnit> {
  return new Set([...hintUnitsForLine(hints, item.file, item.line), ...outputUnits(summary)]);
}

function removeInstructionWrites(
  live: Set<RegisterContractsUnit>,
  effect: InstructionEffect,
): void {
  if (!instructionWritesAreConditional(effect)) {
    for (const unit of effect.writes) live.delete(unit);
  }
}

function instructionWritesAreConditional(effect: InstructionEffect): boolean {
  return effect.control.kind === 'call' && effect.control.conditional;
}

function addInstructionReads(
  live: Set<RegisterContractsUnit>,
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  liveAfter: ReadonlySet<RegisterContractsUnit>,
): void {
  for (const unit of semanticReadsForLiveness(item, effect, liveAfter)) live.add(unit);
}

function semanticReadsForLiveness(
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  liveAfter: ReadonlySet<RegisterContractsUnit>,
): readonly RegisterContractsUnit[] {
  if (isAccumulatorFlagRefresh(item) && !hasAccumulatorDerivedFlags(liveAfter)) {
    return effect.reads.filter((unit) => unit !== 'A');
  }
  return effect.reads;
}

function isAccumulatorFlagRefresh(item: RegisterContractsInstruction): boolean {
  return (
    (item.instruction.mnemonic === 'or' || item.instruction.mnemonic === 'and') &&
    item.instruction.source.kind === 'reg8' &&
    item.instruction.source.register === 'a'
  );
}

function hasAccumulatorDerivedFlags(liveAfter: ReadonlySet<RegisterContractsUnit>): boolean {
  return liveAfter.has('zero') || liveAfter.has('sign') || liveAfter.has('parity');
}

function liveSetsForRoutine(
  routine: RegisterContractsRoutine,
  summaries: Map<string, RoutineSummary>,
  hints: LocatedSmartComment[] = [],
): { liveIn: Set<RegisterContractsUnit>[]; liveOut: Set<RegisterContractsUnit>[] } {
  const labels = labelIndex(routine);
  const effects = routine.instructions.map((item) => getZ80InstructionEffect(item.instruction));
  const boundaries = effects.map((effect, index) => boundaryTarget(routine, index, effect));
  const resolvedSummaries = boundaries.map((boundary) =>
    boundary ? summaryForBoundary(boundary, summaries)?.summary : undefined,
  );
  const successorIndexes = effects.map((effect, index) =>
    instructionSuccessors(routine, index, effect, labels, { boundaryFallthrough: true }),
  );
  const liveIn = routine.instructions.map(() => new Set<RegisterContractsUnit>());
  const liveOut = routine.instructions.map(() => new Set<RegisterContractsUnit>());
  let changed = true;
  let passes = 0;

  while (changed && passes < Math.max(8, routine.instructions.length * 4)) {
    changed = false;
    passes += 1;
    for (let index = routine.instructions.length - 1; index >= 0; index -= 1) {
      const nextOut = unionLive(successorIndexes[index]!.map((successor) => liveIn[successor]!));
      const nextIn = transferLiveBefore(
        routine.instructions[index]!,
        effects[index]!,
        boundaries[index],
        resolvedSummaries[index],
        nextOut,
        hints,
      );
      if (!setEqual(nextOut, liveOut[index]!)) {
        liveOut[index] = nextOut;
        changed = true;
      }
      if (!setEqual(nextIn, liveIn[index]!)) {
        liveIn[index] = nextIn;
        changed = true;
      }
    }
  }

  return { liveIn, liveOut };
}

function resolvedBoundariesForRoutine(
  routine: RegisterContractsRoutine,
  summaries: Map<string, RoutineSummary>,
): ResolvedBoundary[] {
  const out: ResolvedBoundary[] = [];
  for (let index = 0; index < routine.instructions.length; index += 1) {
    const item = routine.instructions[index]!;
    const effect = getZ80InstructionEffect(item.instruction);
    const boundary = boundaryTarget(routine, index, effect);
    if (!boundary) continue;
    const resolved = summaryForBoundary(boundary, summaries);
    if (!resolved) continue;
    out.push({ item, index, boundary, target: resolved.target, summary: resolved.summary });
  }
  return out;
}

export function findRegisterContractsConflicts(
  routine: RegisterContractsRoutine,
  summaries: Map<string, RoutineSummary>,
  hints: LocatedSmartComment[],
): RegisterContractsConflict[] {
  const conflicts: RegisterContractsConflict[] = [];
  const { liveOut } = liveSetsForRoutine(routine, summaries, hints);

  for (const { item, index, boundary, target, summary } of resolvedBoundariesForRoutine(
    routine,
    summaries,
  )) {
    const accepted = new Set<RegisterContractsUnit>();
    for (const unit of hintUnitsForLine(hints, item.file, item.line)) accepted.add(unit);
    for (const unit of outputUnits(summary)) accepted.add(unit);
    const carriers = unique(
      summary.mayWrite.filter((unit) => liveOut[index]!.has(unit) && !accepted.has(unit)),
    );

    if (carriers.length > 0) {
      conflicts.push({
        kind: carriers.every((unit) => isFlagUnit(unit))
          ? 'flag_lifetime_risk'
          : 'definite_contract_violation',
        file: item.file,
        line: item.line,
        column: item.column,
        ...(item.sourceUnit !== undefined ? { sourceUnit: item.sourceUnit } : {}),
        ...(item.sourceRelation !== undefined ? { sourceRelation: item.sourceRelation } : {}),
        ...(item.sourceUnitRelation !== undefined
          ? { sourceUnitRelation: item.sourceUnitRelation }
          : {}),
        routine: routine.name,
        callTarget: target,
        carriers,
        message: `${boundary.subject} may modify ${carriers.join(
          ',',
        )}, but the pre-call value is used later.`,
      });
    }
  }

  return conflicts;
}

function isFlagUnit(unit: RegisterContractsUnit): boolean {
  return (
    unit === 'carry' ||
    unit === 'zero' ||
    unit === 'sign' ||
    unit === 'parity' ||
    unit === 'halfCarry'
  );
}

function candidateMessage(boundary: BoundaryTarget, units: RegisterContractsUnit[]): string {
  const carriers = units.join(',');
  const expectation = units.length === 1 ? units[0] : `{${carriers}}`;
  return `${boundary.subject} writes ${carriers} and caller reads it later; review the call site and add \`; expects out ${expectation}\` above the call if this is intentional.`;
}

export function findCallerOutputCandidateObservations(
  routines: RegisterContractsRoutine[],
  summaries: Map<string, RoutineSummary>,
): RegisterContractsOutputCandidate[] {
  const out: RegisterContractsOutputCandidate[] = [];

  for (const routine of routines) {
    const { liveOut } = liveSetsForRoutine(routine, summaries);
    for (const { item, index, boundary, target, summary } of resolvedBoundariesForRoutine(
      routine,
      summaries,
    )) {
      const candidate = callerOutputCandidate(item, boundary, target, summary, liveOut[index]!);
      if (candidate) out.push(candidate);
    }
  }

  return out;
}

function callerOutputCandidate(
  item: RegisterContractsInstruction,
  boundary: BoundaryTarget,
  target: string,
  summary: RoutineSummary,
  liveAfter: ReadonlySet<RegisterContractsUnit>,
): RegisterContractsOutputCandidate | undefined {
  const carriers = callerOutputCandidateCarriers(summary, liveAfter);
  return carriers.length > 0
    ? {
        file: item.file,
        line: item.line,
        column: item.column,
        ...(item.sourceUnit !== undefined ? { sourceUnit: item.sourceUnit } : {}),
        ...(item.sourceRelation !== undefined ? { sourceRelation: item.sourceRelation } : {}),
        ...(item.sourceUnitRelation !== undefined
          ? { sourceUnitRelation: item.sourceUnitRelation }
          : {}),
        routine: target,
        carriers,
        message: candidateMessage(boundary, carriers),
      }
    : undefined;
}

function callerOutputCandidateCarriers(
  summary: RoutineSummary,
  liveAfter: ReadonlySet<RegisterContractsUnit>,
): RegisterContractsUnit[] {
  const intentionalOutputs = new Set(outputUnits(summary));
  return unique([
    ...unintentionalLiveWrites(summary, intentionalOutputs, liveAfter),
    ...intentionalLiveOutputs(intentionalOutputs, liveAfter),
  ]);
}

function unintentionalLiveWrites(
  summary: RoutineSummary,
  intentionalOutputs: ReadonlySet<RegisterContractsUnit>,
  liveAfter: ReadonlySet<RegisterContractsUnit>,
): RegisterContractsUnit[] {
  return summary.mayWrite.filter((unit) => liveAfter.has(unit) && !intentionalOutputs.has(unit));
}

function intentionalLiveOutputs(
  intentionalOutputs: ReadonlySet<RegisterContractsUnit>,
  liveAfter: ReadonlySet<RegisterContractsUnit>,
): RegisterContractsUnit[] {
  return [...intentionalOutputs].filter((unit) => liveAfter.has(unit));
}
