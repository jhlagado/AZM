import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import { getZ80InstructionEffect } from '../z80/effects.js';
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

function unique<T>(units: T[]): T[] {
  return [...new Set(units)];
}

function withImpliedFlagUnits(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return unique(units);
}

function precedingCServiceName(item: RegisterCareInstruction | undefined): string | undefined {
  const inst = item?.instruction;
  if (!inst || inst.head.toLowerCase() !== 'ld' || inst.operands.length !== 2) return undefined;
  const dst = inst.operands[0];
  const src = inst.operands[1];
  if (dst?.kind !== 'Reg' || dst.name.toUpperCase() !== 'C') return undefined;
  return src?.kind === 'Imm' && src.expr.kind === 'ImmName' ? src.expr.name : undefined;
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
    item?.head.toLowerCase() === 'jp' &&
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
  return prior?.comment.kind === 'expectOut' ? withImpliedFlagUnits(prior.comment.carriers) : [];
}

function outputUnits(summary: RoutineSummary): RegisterCareUnit[] {
  return withImpliedFlagUnits(summary.valueRelations.flatMap((relation) => relation.out));
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
  effect: InstructionEffect,
  labels: ReadonlyMap<string, number>,
): number[] {
  const next = index + 1 < routine.instructions.length ? index + 1 : undefined;
  if (
    effect.control.kind === 'fallthrough' ||
    effect.control.kind === 'call' ||
    effect.control.kind === 'rst'
  ) {
    return next === undefined ? [] : [next];
  }
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
  for (const unit of effect.reads) live.add(unit);
  return live;
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
    successors(routine, index, effect, labels),
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

export function findRegisterCareConflicts(
  routine: RegisterCareRoutine,
  summaries: Map<string, RoutineSummary>,
  hints: LocatedSmartComment[],
): RegisterCareConflict[] {
  const conflicts: RegisterCareConflict[] = [];
  const { liveOut } = liveSetsForRoutine(routine, summaries, hints);

  for (let idx = 0; idx < routine.instructions.length; idx += 1) {
    const item = routine.instructions[idx]!;
    const effect = getZ80InstructionEffect(item.instruction);
    const boundary = boundaryTarget(routine, idx, effect);

    if (boundary) {
      const resolved = summaryForBoundary(boundary, summaries);
      if (resolved) {
        const { target, summary } = resolved;
        const accepted = new Set<RegisterCareUnit>();
        for (const unit of hintUnitsForLine(hints, item.file, item.line)) accepted.add(unit);
        for (const unit of outputUnits(summary)) accepted.add(unit);
        const carriers = unique(
          summary.mayWrite.filter((unit) => liveOut[idx]!.has(unit) && !accepted.has(unit)),
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
    }
  }

  return conflicts;
}

function appendMapUnits(
  out: Map<string, RegisterCareUnit[]>,
  target: string,
  units: RegisterCareUnit[],
): void {
  const existing = out.get(target) ?? [];
  for (const unit of units) {
    if (!existing.includes(unit)) existing.push(unit);
  }
  out.set(target, existing);
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
    for (let idx = 0; idx < routine.instructions.length; idx += 1) {
      const item = routine.instructions[idx]!;
      const effect = getZ80InstructionEffect(item.instruction);
      const boundary = boundaryTarget(routine, idx, effect);

      if (boundary) {
        const resolved = summaryForBoundary(boundary, summaries);
        if (resolved) {
          const { target, summary } = resolved;
          const alreadyOutput = new Set(outputUnits(summary));
          const carriers = unique(
            summary.mayWrite.filter((unit) => liveOut[idx]!.has(unit) && !alreadyOutput.has(unit)),
          );
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
    }
  }

  return out;
}

export function findCallerOutputCandidates(
  routines: RegisterCareRoutine[],
  summaries: Map<string, RoutineSummary>,
): Map<string, RegisterCareUnit[]> {
  const candidates = new Map<string, RegisterCareUnit[]>();
  for (const item of findCallerOutputCandidateObservations(routines, summaries)) {
    appendMapUnits(candidates, item.routine, item.carriers);
  }
  return candidates;
}

export function findAcceptedOutputCandidatesFromHints(
  routines: RegisterCareRoutine[],
  summaries: Map<string, RoutineSummary>,
  hints: LocatedSmartComment[],
): Map<string, RegisterCareUnit[]> {
  const accepted = new Map<string, RegisterCareUnit[]>();
  for (const routine of routines) {
    for (let idx = 0; idx < routine.instructions.length; idx += 1) {
      const item = routine.instructions[idx]!;
      const effect = getZ80InstructionEffect(item.instruction);
      const boundary = boundaryTarget(routine, idx, effect);
      if (!boundary) continue;
      const resolved = summaryForBoundary(boundary, summaries);
      if (!resolved) continue;
      const units = hintUnitsForLine(hints, item.file, item.line);
      if (units.length === 0) continue;
      appendMapUnits(accepted, resolved.target, units);
    }
  }
  return accepted;
}

export function diagnosticsForRegisterCareConflicts(
  conflicts: RegisterCareConflict[],
  severity: 'warning' | 'error',
): Diagnostic[] {
  return conflicts.map((conflict) => ({
    id: DiagnosticIds.RegisterCareConflict,
    severity,
    message: conflict.message,
    file: conflict.file,
    line: conflict.line,
    column: conflict.column,
  }));
}
