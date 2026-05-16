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

function unique(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return [...new Set(units)];
}

function directCallTarget(effect: InstructionEffect): string | undefined {
  return effect.control.kind === 'call' ? effect.control.target : undefined;
}

function hintUnitsForLine(
  hints: LocatedSmartComment[],
  file: string,
  callLine: number,
): RegisterCareUnit[] {
  const prior = hints.find(
    (hint) => hint.file === file && hint.line === callLine - 1 && hint.comment.kind === 'expectOut',
  );
  return prior?.comment.kind === 'expectOut' ? prior.comment.carriers : [];
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
    const target = directCallTarget(effect);
    const accepted = new Set<RegisterCareUnit>();

    if (target) {
      const summary = summaries.get(target);
      if (summary) {
        for (const unit of hintUnitsForLine(hints, item.file, item.line)) accepted.add(unit);
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
            message: `CALL ${target} may modify ${carriers.join(
              ',',
            )}, but the pre-call value is used later.`,
          });
        }

        for (const unit of summary.mayWrite) live.delete(unit);
        for (const unit of accepted) live.delete(unit);
        for (const unit of summary.mayRead) live.add(unit);
      }
    }

    for (const unit of effect.writes) live.delete(unit);
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
