import { getZ80InstructionEffect } from '../z80/effects.js';
import { precedingCServiceName, precedingRegisterImmediateValue } from './boundaryHints.js';
import { instructionHead } from './instruction-head.js';
import { rstServiceTargetName, rstTargetName } from './profiles.js';
import type {
  InstructionEffect,
  RegisterContractsInstruction,
  RegisterContractsRoutine,
  RoutineSummary,
} from './types.js';

export function boundarySummary(
  routine: RegisterContractsRoutine,
  index: number,
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  const item = routine.instructions[index];
  if (!item) return undefined;
  const effect = getZ80InstructionEffect(item.instruction);
  return (
    callBoundarySummary(effect, summaries) ??
    jumpBoundarySummary(routine, item, effect, summaries) ??
    rstBoundarySummary(routine, index, effect, summaries)
  );
}

function callBoundarySummary(
  effect: InstructionEffect,
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  return effect.control.kind === 'call' && effect.control.target
    ? summaries.get(effect.control.target)
    : undefined;
}

function jumpBoundarySummary(
  routine: RegisterContractsRoutine,
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  return isExternalTailJump(routine, item, effect)
    ? summaries.get(effect.control.target)
    : undefined;
}

function isExternalTailJump(
  routine: RegisterContractsRoutine,
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
): effect is InstructionEffect & {
  readonly control: { readonly kind: 'jump'; readonly target: string };
} {
  return (
    effect.control.kind === 'jump' &&
    (instructionHead(item) === 'jp' || instructionHead(item) === 'jp-cc') &&
    effect.control.target !== undefined &&
    !effect.control.target.startsWith('.') &&
    !routine.labels.includes(effect.control.target)
  );
}

function rstBoundarySummary(
  routine: RegisterContractsRoutine,
  index: number,
  effect: InstructionEffect,
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  if (effect.control.kind !== 'rst' || effect.control.vector === undefined) return undefined;
  return (
    rstServiceBoundarySummary(routine, index, effect.control.vector, summaries) ??
    summaries.get(rstTargetName(effect.control.vector))
  );
}

function rstServiceBoundarySummary(
  routine: RegisterContractsRoutine,
  index: number,
  vector: number,
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  const previous = routine.instructions[index - 1];
  const numericService = precedingRegisterImmediateValue(previous, 'C');
  if (numericService !== undefined) {
    const numericSummary = summaries.get(rstServiceTargetName(vector, String(numericService)));
    if (numericSummary !== undefined) return numericSummary;
  }
  const service = precedingCServiceName(previous);
  return service ? summaries.get(rstServiceTargetName(vector, service)) : undefined;
}
