import type { InstructionEffect, RegisterCareRoutine } from './types.js';

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function labelIndex(routine: RegisterCareRoutine): Map<string, number> {
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

export function instructionSuccessors(
  routine: RegisterCareRoutine,
  index: number,
  effect: InstructionEffect,
  labels: ReadonlyMap<string, number>,
  options: { boundaryFallthrough?: boolean } = {},
): number[] {
  const next = index + 1 < routine.instructions.length ? index + 1 : undefined;
  if (
    effect.control.kind === 'fallthrough' ||
    (options.boundaryFallthrough &&
      (effect.control.kind === 'call' || effect.control.kind === 'rst'))
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
  if (effect.control.kind === 'return') {
    return effect.control.conditional && next !== undefined ? [next] : [];
  }
  return [];
}
