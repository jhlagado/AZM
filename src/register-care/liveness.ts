import { getZ80InstructionEffect } from '../z80/effects.js';
import { precedingCServiceName } from './boundaryHints.js';
import { instructionSuccessors, labelIndex } from './controlFlow.js';
import { rstServiceTargetName, rstTargetName } from './profiles.js';
import type {
  LocatedSmartComment,
  InstructionEffect,
  RegisterCareConflict,
  RegisterCareInstruction,
  RegisterCareOutputCandidate,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
} from './types.js';

type BoundaryTarget = {
  targets: string[];
  conditional: boolean;
  subject: string;
};

type ResolvedBoundary = {
  item: RegisterCareInstruction;
  index: number;
  boundary: BoundaryTarget;
  target: string;
  summary: RoutineSummary;
};

function unique<T>(units: T[]): T[] {
  return [...new Set(units)];
}

function boundaryTarget(
  routine: RegisterCareRoutine,
  index: number,
  effect: InstructionEffect,
): BoundaryTarget | undefined {
  const item = routine.instructions[index];
  if (effect.control.kind === 'call' && effect.control.target) {
    return {
      targets: [effect.control.target],
      conditional: effect.control.conditional,
      subject: `CALL ${effect.control.target}`,
    };
  }
  if (
    effect.control.kind === 'jump' &&
    item?.instruction.mnemonic === 'jp' &&
    !effect.control.conditional &&
    effect.control.target &&
    !effect.control.target.startsWith('.')
  ) {
    return {
      targets: [effect.control.target],
      conditional: false,
      subject: `JP ${effect.control.target}`,
    };
  }
  if (effect.control.kind === 'rst' && effect.control.vector !== undefined) {
    const target = rstTargetName(effect.control.vector);
    const service = precedingCServiceName(routine.instructions[index - 1]);
    const targets = service
      ? [rstServiceTargetName(effect.control.vector, service), target]
      : [target];
    return { targets, conditional: false, subject: target };
  }
  return undefined;
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
): RegisterCareUnit[] {
  const prior = hints.find(
    (hint) => hint.file === file && hint.line === callLine - 1 && hint.comment.kind === 'expectOut',
  );
  return prior?.comment.kind === 'expectOut' ? unique(prior.comment.carriers) : [];
}

function outputUnits(summary: RoutineSummary): RegisterCareUnit[] {
  return unique(summary.valueRelations.flatMap((relation) => relation.out));
}

function setEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  if (left.size !== right.size) return false;
  for (const item of left) if (!right.has(item)) return false;
  return true;
}

function unionLive(sets: Iterable<ReadonlySet<RegisterCareUnit>>): Set<RegisterCareUnit> {
  const out = new Set<RegisterCareUnit>();
  for (const set of sets) {
    for (const unit of set) out.add(unit);
  }
  return out;
}

function transferLiveBefore(
  item: RegisterCareInstruction,
  effect: InstructionEffect,
  boundary: BoundaryTarget | undefined,
  summary: RoutineSummary | undefined,
  liveAfter: ReadonlySet<RegisterCareUnit>,
  hints: LocatedSmartComment[],
): Set<RegisterCareUnit> {
  const live = new Set(liveAfter);
  if (boundary && summary) {
    const accepted = new Set<RegisterCareUnit>();
    for (const unit of hintUnitsForLine(hints, item.file, item.line)) accepted.add(unit);
    for (const unit of outputUnits(summary)) accepted.add(unit);
    if (!boundary.conditional) {
      for (const unit of summary.mayWrite) live.delete(unit);
      for (const unit of accepted) live.delete(unit);
    }
    for (const unit of summary.mayRead) live.add(unit);
  }

  const instructionWritesAreConditional =
    effect.control.kind === 'call' && effect.control.conditional;
  if (!instructionWritesAreConditional) {
    for (const unit of effect.writes) live.delete(unit);
  }
  for (const unit of semanticReadsForLiveness(item, effect, liveAfter)) live.add(unit);
  return live;
}

function semanticReadsForLiveness(
  item: RegisterCareInstruction,
  effect: InstructionEffect,
  liveAfter: ReadonlySet<RegisterCareUnit>,
): readonly RegisterCareUnit[] {
  if (
    item.instruction.mnemonic === 'or' &&
    item.instruction.source.kind === 'reg8' &&
    item.instruction.source.register === 'a' &&
    !liveAfter.has('zero') &&
    !liveAfter.has('sign') &&
    !liveAfter.has('parity')
  ) {
    return effect.reads.filter((unit) => unit !== 'A');
  }
  if (
    item.instruction.mnemonic === 'and' &&
    item.instruction.source.kind === 'reg8' &&
    item.instruction.source.register === 'a' &&
    !liveAfter.has('zero') &&
    !liveAfter.has('sign') &&
    !liveAfter.has('parity')
  ) {
    return effect.reads.filter((unit) => unit !== 'A');
  }
  return effect.reads;
}

function liveSetsForRoutine(
  routine: RegisterCareRoutine,
  summaries: Map<string, RoutineSummary>,
  hints: LocatedSmartComment[] = [],
): { liveIn: Set<RegisterCareUnit>[]; liveOut: Set<RegisterCareUnit>[] } {
  const labels = labelIndex(routine);
  const effects = routine.instructions.map((item) => getZ80InstructionEffect(item.instruction));
  const boundaries = effects.map((effect, index) => boundaryTarget(routine, index, effect));
  const resolvedSummaries = boundaries.map((boundary) =>
    boundary ? summaryForBoundary(boundary, summaries)?.summary : undefined,
  );
  const successorIndexes = effects.map((effect, index) =>
    instructionSuccessors(routine, index, effect, labels, { boundaryFallthrough: true }),
  );
  const liveIn = routine.instructions.map(() => new Set<RegisterCareUnit>());
  const liveOut = routine.instructions.map(() => new Set<RegisterCareUnit>());
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
  routine: RegisterCareRoutine,
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

export function findRegisterCareConflicts(
  routine: RegisterCareRoutine,
  summaries: Map<string, RoutineSummary>,
  hints: LocatedSmartComment[],
): RegisterCareConflict[] {
  const conflicts: RegisterCareConflict[] = [];
  const { liveOut } = liveSetsForRoutine(routine, summaries, hints);

  for (const { item, index, boundary, target, summary } of resolvedBoundariesForRoutine(
    routine,
    summaries,
  )) {
    const accepted = new Set<RegisterCareUnit>();
    for (const unit of hintUnitsForLine(hints, item.file, item.line)) accepted.add(unit);
    for (const unit of outputUnits(summary)) accepted.add(unit);
    const carriers = unique(
      summary.mayWrite.filter((unit) => liveOut[index]!.has(unit) && !accepted.has(unit)),
    );

    if (carriers.length > 0) {
      conflicts.push({
        file: item.file,
        line: item.line,
        column: item.column,
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

function candidateMessage(boundary: BoundaryTarget, units: RegisterCareUnit[]): string {
  const carriers = units.join(',');
  const expectation = units.length === 1 ? units[0] : `{${carriers}}`;
  return `${boundary.subject} writes ${carriers} and caller reads it later; review the call site and add \`; expects out ${expectation}\` above the call if this is intentional.`;
}

export function findCallerOutputCandidateObservations(
  routines: RegisterCareRoutine[],
  summaries: Map<string, RoutineSummary>,
): RegisterCareOutputCandidate[] {
  const out: RegisterCareOutputCandidate[] = [];

  for (const routine of routines) {
    const { liveOut } = liveSetsForRoutine(routine, summaries);
    for (const { item, index, boundary, target, summary } of resolvedBoundariesForRoutine(
      routine,
      summaries,
    )) {
      const intentionalOutputs = new Set(outputUnits(summary));
      const carrierSources: RegisterCareUnit[] = [];
      for (const unit of summary.mayWrite) {
        if (liveOut[index]!.has(unit) && !intentionalOutputs.has(unit)) {
          carrierSources.push(unit);
        }
      }
      for (const unit of intentionalOutputs) {
        if (liveOut[index]!.has(unit)) {
          carrierSources.push(unit);
        }
      }
      const carriers = unique(carrierSources);
      if (carriers.length > 0) {
        out.push({
          file: item.file,
          line: item.line,
          column: item.column,
          routine: target,
          carriers,
          message: candidateMessage(boundary, carriers),
        });
      }
    }
  }

  return out;
}
