import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import { getZ80InstructionEffect } from '../z80/effects.js';
import type {
  LocatedSmartComment,
  InstructionEffect,
  RegisterCareConflict,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
} from './types.js';

type BoundaryTarget = {
  target: string;
  conditional: boolean;
  subject: string;
};

function unique(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return [...new Set(units)];
}

const FLAG_UNIT_LIST: RegisterCareUnit[] = [
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
  'negative',
];

function withImpliedFlagUnits(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return units.includes('F') ? unique([...units, ...FLAG_UNIT_LIST]) : unique(units);
}

function rstTargetName(vector: number): string {
  return `RST_$${vector.toString(16).toUpperCase().padStart(2, '0')}`;
}

function boundaryTarget(effect: InstructionEffect): BoundaryTarget | undefined {
  if (effect.control.kind === 'call' && effect.control.target) {
    return {
      target: effect.control.target,
      conditional: effect.control.conditional,
      subject: `CALL ${effect.control.target}`,
    };
  }
  if (effect.control.kind === 'rst' && effect.control.vector !== undefined) {
    const target = rstTargetName(effect.control.vector);
    return { target, conditional: false, subject: target };
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
    const boundary = boundaryTarget(effect);
    const accepted = new Set<RegisterCareUnit>();

    if (boundary) {
      const summary = summaries.get(boundary.target);
      if (summary) {
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
            callTarget: boundary.target,
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
