import type { ControlEffect, InstructionEffect, RegisterContractsRoutine } from './types.js';

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function labelIndex(routine: RegisterContractsRoutine): Map<string, number> {
  const out = new Map<string, number>();
  routine.instructions.forEach((item, index) => {
    for (const label of item.labels) {
      if (!out.has(label)) out.set(label, index);
    }
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

function maybeIndex(index: number | undefined): number[] {
  return index === undefined ? [] : [index];
}

function nextInstructionIndex(
  routine: RegisterContractsRoutine,
  index: number,
): number | undefined {
  return index + 1 < routine.instructions.length ? index + 1 : undefined;
}

function shouldFallThroughBoundary(
  control: ControlEffect,
  boundaryFallthrough: boolean | undefined,
): boolean {
  return Boolean(boundaryFallthrough && (control.kind === 'call' || control.kind === 'rst'));
}

function jumpSuccessors(
  control: Extract<ControlEffect, { kind: 'jump' }>,
  labels: ReadonlyMap<string, number>,
  next: number | undefined,
): number[] {
  const target = localTargetIndex(labels, control.target);
  if (!control.conditional) return maybeIndex(target);
  return unique([...maybeIndex(target), ...maybeIndex(next)]);
}

function returnSuccessors(
  control: Extract<ControlEffect, { kind: 'return' }>,
  next: number | undefined,
): number[] {
  return control.conditional ? maybeIndex(next) : [];
}

function controlSuccessors(
  control: ControlEffect,
  labels: ReadonlyMap<string, number>,
  next: number | undefined,
): number[] {
  switch (control.kind) {
    case 'fallthrough':
      return maybeIndex(next);
    case 'jump':
      return jumpSuccessors(control, labels, next);
    case 'return':
      return returnSuccessors(control, next);
    case 'call':
    case 'rst':
    case 'unknown':
      return [];
  }
}

export function instructionSuccessors(
  routine: RegisterContractsRoutine,
  index: number,
  effect: InstructionEffect,
  labels: ReadonlyMap<string, number>,
  options: { boundaryFallthrough?: boolean } = {},
): number[] {
  const next = nextInstructionIndex(routine, index);
  if (shouldFallThroughBoundary(effect.control, options.boundaryFallthrough)) {
    return maybeIndex(next);
  }
  return controlSuccessors(effect.control, labels, next);
}
