import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import { getZ80InstructionEffect } from '../z80/effects.js';
import { rstServiceTargetName, rstTargetName } from './profiles.js';
import type {
  LocatedSmartComment,
  InstructionEffect,
  RegisterCareConflict,
  RegisterCareInstruction,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
} from './types.js';

type BoundaryTarget = {
  targets: string[];
  conditional: boolean;
  subject: string;
};

function unique(units: RegisterCareUnit[]): RegisterCareUnit[] {
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

export function findRegisterCareConflicts(
  routine: RegisterCareRoutine,
  summaries: Map<string, RoutineSummary>,
  hints: LocatedSmartComment[],
): RegisterCareConflict[] {
  const conflicts: RegisterCareConflict[] = [];
  const live = new Set<RegisterCareUnit>();

  for (let idx = routine.instructions.length - 1; idx >= 0; idx -= 1) {
    const item = routine.instructions[idx]!;
    const effect = getZ80InstructionEffect(item.instruction);
    const boundary = boundaryTarget(routine, idx, effect);
    const accepted = new Set<RegisterCareUnit>();

    if (boundary) {
      const resolved = summaryForBoundary(boundary, summaries);
      if (resolved) {
        const { target, summary } = resolved;
        for (const unit of hintUnitsForLine(hints, item.file, item.line)) accepted.add(unit);
        for (const unit of outputUnits(summary)) accepted.add(unit);
        const carriers = unique(
          summary.mayWrite.filter((unit) => live.has(unit) && !accepted.has(unit)),
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

        if (!boundary.conditional) {
          for (const unit of summary.mayWrite) live.delete(unit);
          for (const unit of accepted) live.delete(unit);
        }
        for (const unit of summary.mayRead) live.add(unit);
      }
    }

    const instructionWritesAreConditional =
      effect.control.kind === 'call' && effect.control.conditional;
    if (!instructionWritesAreConditional) {
      for (const unit of effect.writes) live.delete(unit);
    }
    for (const unit of effect.reads) live.add(unit);
  }

  return conflicts.reverse();
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
