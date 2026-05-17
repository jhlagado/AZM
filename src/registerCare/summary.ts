import { getZ80InstructionEffect } from '../z80/effects.js';
import { rstServiceTargetName, rstTargetName } from './profiles.js';
import type {
  InstructionEffect,
  RegisterCareInstruction,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineContract,
  RoutineSummary,
  ValueRelation,
} from './types.js';

const FLAG_UNIT_LIST: RegisterCareUnit[] = [
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
];
const TRACKED_UNITS: RegisterCareUnit[] = ['A', 'B', 'C', 'D', 'E', 'H', 'L', ...FLAG_UNIT_LIST];
const STACK_POINTER_UNITS = new Set<RegisterCareUnit>(['SPH', 'SPL']);
const REGISTER_PAIRS: RegisterCareUnit[][] = [
  ['B', 'C'],
  ['D', 'E'],
  ['H', 'L'],
];

type Token = { origin: RegisterCareUnit } | { origin: 'unknown' };

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isTrackedUnit(unit: RegisterCareUnit): boolean {
  return TRACKED_UNITS.includes(unit);
}

function readToken(tokens: Map<RegisterCareUnit, Token>, unit: RegisterCareUnit): Token {
  return tokens.get(unit) ?? { origin: 'unknown' };
}

function semanticReadOrigins(
  tokens: Map<RegisterCareUnit, Token>,
  units: RegisterCareUnit[],
): RegisterCareUnit[] {
  const origins: RegisterCareUnit[] = [];
  for (const unit of units) {
    if (!isTrackedUnit(unit)) {
      origins.push(unit);
      continue;
    }
    const token = readToken(tokens, unit);
    if (token.origin !== 'unknown') origins.push(token.origin);
  }
  return origins;
}

function tokenPreservesUnit(token: Token | undefined, unit: RegisterCareUnit): boolean {
  return token?.origin === unit;
}

function isOpaqueBoundary(item: RegisterCareInstruction, effect: InstructionEffect): boolean {
  if (effect.control.kind === 'call' || effect.control.kind === 'rst') return true;
  return (
    effect.control.kind === 'jump' &&
    item.head.toLowerCase() === 'jp' &&
    !effect.control.conditional &&
    Boolean(effect.control.target) &&
    !effect.control.target?.startsWith('.')
  );
}

function boundarySummary(
  routine: RegisterCareRoutine,
  index: number,
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  const item = routine.instructions[index];
  if (!item) return undefined;
  const effect = getZ80InstructionEffect(item.instruction);
  if (effect.control.kind === 'call' && effect.control.target) {
    return summaries.get(effect.control.target);
  }
  if (
    effect.control.kind === 'jump' &&
    item.head.toLowerCase() === 'jp' &&
    !effect.control.conditional &&
    effect.control.target &&
    !effect.control.target.startsWith('.')
  ) {
    return summaries.get(effect.control.target);
  }
  if (effect.control.kind === 'rst' && effect.control.vector !== undefined) {
    const service = precedingCServiceName(routine.instructions[index - 1]);
    if (service) {
      const serviceSummary = summaries.get(rstServiceTargetName(effect.control.vector, service));
      if (serviceSummary) return serviceSummary;
    }
    return summaries.get(rstTargetName(effect.control.vector));
  }
  return undefined;
}

function precedingCServiceName(item: RegisterCareInstruction | undefined): string | undefined {
  const inst = item?.instruction;
  if (!inst || inst.head.toLowerCase() !== 'ld' || inst.operands.length !== 2) return undefined;
  const dst = inst.operands[0];
  const src = inst.operands[1];
  if (dst?.kind !== 'Reg' || dst.name.toUpperCase() !== 'C') return undefined;
  return src?.kind === 'Imm' && src.expr.kind === 'ImmName' ? src.expr.name : undefined;
}

function relationKey(relation: ValueRelation): string {
  return `${relation.out.join(',')}<- ${relation.from.join(',')}`;
}

function addRelation(out: ValueRelation[], relation: ValueRelation): void {
  if (relation.out.length === 0 || relation.from.length === 0) return;
  const key = relationKey(relation);
  if (!out.some((existing) => relationKey(existing) === key)) out.push(relation);
}

function addContractRelation(out: ValueRelation[], relation: ValueRelation): void {
  if (relation.out.length === 0) return;
  const key = relationKey(relation);
  if (!out.some((existing) => relationKey(existing) === key)) out.push(relation);
}

function pairRelation(
  tokens: Map<RegisterCareUnit, Token>,
  out: RegisterCareUnit[],
): ValueRelation | undefined {
  const from: RegisterCareUnit[] = [];
  for (const unit of out) {
    const token = tokens.get(unit);
    if (!token || token.origin === 'unknown') return undefined;
    from.push(token.origin);
  }
  if (out.every((unit, idx) => unit === from[idx])) return undefined;
  return { out, from };
}

function withImpliedFlagUnits(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return unique(units);
}

function contractOutRelation(
  contractIn: RegisterCareUnit[],
  contractOut: RegisterCareUnit[],
): ValueRelation | undefined {
  if (contractOut.length === 0) return undefined;
  return {
    out: contractOut,
    from: contractIn.length === contractOut.length ? contractIn : [],
  };
}

function isUnconditionalReturn(item: RegisterCareInstruction): boolean {
  const head = item.head.toLowerCase();
  if (head === 'ret') return item.instruction.operands.length === 0;
  return head === 'retn' || head === 'reti';
}

function applyKnownBoundarySummary(
  tokens: Map<RegisterCareUnit, Token>,
  directMayWrite: RegisterCareUnit[],
  summary: RoutineSummary,
): void {
  for (const relation of summary.valueRelations) {
    const sameCarrierRelation =
      relation.out.length === relation.from.length &&
      relation.out.every((unit, index) => unit === relation.from[index]);
    relation.out.forEach((unit, index) => {
      if (
        !sameCarrierRelation &&
        relation.from.length === relation.out.length &&
        relation.from[index]
      ) {
        tokens.set(unit, readToken(tokens, relation.from[index]));
      } else {
        tokens.set(unit, { origin: 'unknown' });
      }
    });
  }

  for (const unit of summary.mayWrite) {
    if (STACK_POINTER_UNITS.has(unit)) continue;
    if (isTrackedUnit(unit)) {
      tokens.set(unit, { origin: 'unknown' });
    } else {
      directMayWrite.push(unit);
    }
  }
}

export function inferRoutineSummary(
  routine: RegisterCareRoutine,
  boundarySummaries: ReadonlyMap<string, RoutineSummary> = new Map(),
): RoutineSummary {
  const tokens = new Map<RegisterCareUnit, Token>();
  for (const unit of TRACKED_UNITS) tokens.set(unit, { origin: unit });

  const stack: Token[][] = [];
  const mayRead: RegisterCareUnit[] = [];
  const directMayWrite: RegisterCareUnit[] = [];
  let stackBalanced = true;
  let hasUnknownStackEffect = false;

  for (let index = 0; index < routine.instructions.length; index += 1) {
    const item = routine.instructions[index]!;
    const effect = getZ80InstructionEffect(item.instruction);
    const knownBoundary = boundarySummary(routine, index, boundarySummaries);
    const expectedTerminalReturn =
      index === routine.instructions.length - 1 && isUnconditionalReturn(item);
    if (effect.stack.kind !== 'push') mayRead.push(...semanticReadOrigins(tokens, effect.reads));
    if (knownBoundary) mayRead.push(...semanticReadOrigins(tokens, knownBoundary.mayRead));

    if (effect.stack.kind === 'push') {
      stack.push(effect.stack.units.map((unit) => readToken(tokens, unit)));
    } else if (effect.stack.kind === 'pop') {
      const popped = stack.pop();
      if (!popped) {
        stackBalanced = false;
        for (const unit of effect.stack.units) tokens.set(unit, { origin: 'unknown' });
      } else if (popped.length !== effect.stack.units.length) {
        for (const unit of effect.stack.units) tokens.set(unit, { origin: 'unknown' });
      } else {
        effect.stack.units.forEach((unit, idx) => {
          tokens.set(unit, popped[idx] ?? { origin: 'unknown' });
        });
      }
    } else if (effect.stack.kind === 'exchangeTop') {
      hasUnknownStackEffect = true;
      for (const unit of effect.stack.units) tokens.set(unit, { origin: 'unknown' });
    } else if (
      effect.stack.kind === 'unknown' &&
      !expectedTerminalReturn &&
      (!knownBoundary || !knownBoundary.stackBalanced || knownBoundary.hasUnknownStackEffect)
    ) {
      hasUnknownStackEffect = true;
    }

    if (knownBoundary) {
      applyKnownBoundarySummary(tokens, directMayWrite, knownBoundary);
    } else if (isOpaqueBoundary(item, effect)) {
      for (const unit of TRACKED_UNITS) tokens.set(unit, { origin: 'unknown' });
    }

    for (const unit of effect.writes) {
      if (STACK_POINTER_UNITS.has(unit)) continue;
      if (effect.stack.kind === 'pop' && effect.stack.units.includes(unit) && isTrackedUnit(unit)) {
        continue;
      }

      if (isTrackedUnit(unit)) {
        tokens.set(unit, { origin: 'unknown' });
      } else {
        directMayWrite.push(unit);
      }
    }
  }

  if (stack.length !== 0) stackBalanced = false;

  const mayWrite: RegisterCareUnit[] = [...directMayWrite];
  const preserved: RegisterCareUnit[] = [];
  const valueRelations: ValueRelation[] = [];
  for (const unit of TRACKED_UNITS) {
    const current = tokens.get(unit);
    if (tokenPreservesUnit(current, unit)) {
      preserved.push(unit);
      continue;
    }

    mayWrite.push(unit);
    if (current && current.origin !== 'unknown') {
      addRelation(valueRelations, { out: [unit], from: [current.origin] });
    }
  }

  for (const pair of REGISTER_PAIRS) {
    const relation = pairRelation(tokens, pair);
    if (relation) addRelation(valueRelations, relation);
  }
  mayRead.push(...valueRelations.flatMap((relation) => relation.from));

  return {
    name: routine.name,
    mayRead: unique(mayRead),
    mayWrite: unique(mayWrite),
    preserved: unique(preserved),
    valueRelations,
    stackBalanced,
    hasUnknownStackEffect,
  };
}

export function applyRoutineContract(
  summary: RoutineSummary,
  contract: RoutineContract,
): RoutineSummary {
  const contractIn = withImpliedFlagUnits(contract.in);
  const contractOut = withImpliedFlagUnits(contract.out);
  const contractClobbers = withImpliedFlagUnits(contract.clobbers);
  const contractPreserves = withImpliedFlagUnits(contract.preserves);
  const outputSet = new Set(contractOut);
  const preservedSet = new Set(contractPreserves);

  const mayWrite = withImpliedFlagUnits(summary.mayWrite).filter(
    (unit) => !outputSet.has(unit) && !preservedSet.has(unit),
  );
  for (const unit of contractClobbers) {
    if (!outputSet.has(unit) && !preservedSet.has(unit) && !mayWrite.includes(unit)) {
      mayWrite.push(unit);
    }
  }
  const mayWriteSet = new Set(withImpliedFlagUnits(mayWrite));
  const preserved = unique([...summary.preserved, ...contractPreserves]).filter(
    (unit) => !outputSet.has(unit) && !mayWriteSet.has(unit),
  );

  const valueRelations = [...summary.valueRelations];
  const relation = contractOutRelation(contractIn, contractOut);
  if (relation) addContractRelation(valueRelations, relation);

  return {
    ...summary,
    mayRead: unique(contractIn),
    mayWrite,
    preserved,
    valueRelations,
  };
}
