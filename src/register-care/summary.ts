import { getZ80InstructionEffect } from '../z80/effects.js';
import {
  instructionHead,
  instructionOperand,
  instructionOperandCount,
  isAccumulatorSelfOperand,
  isImmediateZeroOperand,
  isPureTokenTransferInstruction,
  isRegisterOperand,
  isUnconditionalReturnInstruction,
  regName,
} from './instruction-shape.js';
import { precedingCServiceName } from './boundaryHints.js';
import { expandCarrierList } from './carriers.js';
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

const FLAG_UNIT_LIST: RegisterCareUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];
const TRACKED_UNITS: RegisterCareUnit[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
  ...FLAG_UNIT_LIST,
];
const GENERAL_REGISTER_UNITS = new Set<RegisterCareUnit>(['A', 'B', 'C', 'D', 'E', 'H', 'L']);
const CONTRACT_FLAG_UNITS = new Set<RegisterCareUnit>(['carry', 'zero']);
const STACK_POINTER_UNITS = new Set<RegisterCareUnit>(['SPH', 'SPL']);
const REGISTER_PAIRS: RegisterCareUnit[][] = [
  ['B', 'C'],
  ['D', 'E'],
  ['H', 'L'],
];

type Token = { origin: RegisterCareUnit } | { origin: 'produced' } | { origin: 'unknown' };

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isTrackedUnit(unit: RegisterCareUnit): boolean {
  return TRACKED_UNITS.includes(unit);
}

function getRegisterUnits(name: string): RegisterCareUnit[] | undefined {
  return expandCarrierList([name]);
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
    if (token.origin !== 'unknown' && token.origin !== 'produced') origins.push(token.origin);
  }
  return origins;
}

function markProducedReadsConsumed(
  tokens: Map<RegisterCareUnit, Token>,
  consumedProduced: Set<RegisterCareUnit>,
  reads: RegisterCareUnit[],
  writes: ReadonlySet<RegisterCareUnit>,
  item?: RegisterCareInstruction,
): void {
  for (const unit of reads) {
    if (!isTrackedUnit(unit) || writes.has(unit)) continue;
    if (item !== undefined && instructionHead(item) === 'cp' && unit === 'A') continue;
    if (readToken(tokens, unit).origin === 'produced') consumedProduced.add(unit);
  }
}

function tokenPreservesUnit(token: Token | undefined, unit: RegisterCareUnit): boolean {
  return token?.origin === unit;
}

function isOpaqueBoundary(item: RegisterCareInstruction, effect: InstructionEffect): boolean {
  if (effect.control.kind === 'call' || effect.control.kind === 'rst') return true;
  return (
    effect.control.kind === 'jump' &&
    (instructionHead(item) === 'jp' || instructionHead(item) === 'jp-cc') &&
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
    (instructionHead(item) === 'jp' || instructionHead(item) === 'jp-cc') &&
    effect.control.target &&
    !effect.control.target.startsWith('.') &&
    !routine.labels.includes(effect.control.target)
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
    if (!token || token.origin === 'unknown' || token.origin === 'produced') return undefined;
    from.push(token.origin);
  }
  if (out.every((unit, idx) => unit === from[idx])) return undefined;
  if (out.some((unit, idx) => unit === from[idx])) return undefined;
  return { out, from };
}

function producedPairRelation(
  tokens: Map<RegisterCareUnit, Token>,
  consumedProduced: ReadonlySet<RegisterCareUnit>,
  out: RegisterCareUnit[],
): ValueRelation | undefined {
  if (out.some((unit) => tokens.get(unit)?.origin !== 'produced' || consumedProduced.has(unit))) {
    return undefined;
  }
  return { out, from: [] };
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
  return isUnconditionalReturnInstruction(item);
}

function isPureTokenTransfer(item: RegisterCareInstruction): boolean {
  return isPureTokenTransferInstruction(item);
}

function isCarryClearBeforeSbcHl(
  item: RegisterCareInstruction,
  next: RegisterCareInstruction | undefined,
): boolean {
  const head = instructionHead(item).toLowerCase();
  if (head !== 'or' && head !== 'and') return false;
  if (!isAccumulatorSelfOperand(item)) return false;
  return (
    next !== undefined &&
    instructionHead(next) === 'sbc' &&
    isRegisterOperand(next, 0, 'HL')
  );
}

function intentOutputUnits(item: RegisterCareInstruction): RegisterCareUnit[] {
  const head = instructionHead(item).toLowerCase();
  if (head === 'scf' || head === 'ccf') return ['carry'];
  if (head === 'cp')
    return isImmediateZeroOperand(item) ? ['A', 'carry', 'zero'] : ['carry', 'zero'];
  if ((head === 'or' || head === 'and' || head === 'xor') && isAccumulatorSelfOperand(item)) {
    return ['A', 'carry', 'zero'];
  }
  return [];
}

function isMechanicalResidueWrite(item: RegisterCareInstruction, unit: RegisterCareUnit): boolean {
  const head = instructionHead(item).toLowerCase();
  if (head === 'djnz') return unit === 'B';
  if (head === 'ldi' || head === 'ldir' || head === 'ldd' || head === 'lddr') {
    return (
      unit === 'B' || unit === 'C' || unit === 'D' || unit === 'E' || unit === 'H' || unit === 'L'
    );
  }
  return false;
}

function applyPureTokenTransfer(
  tokens: Map<RegisterCareUnit, Token>,
  consumedProduced: Set<RegisterCareUnit>,
  item: RegisterCareInstruction,
): RegisterCareUnit[] {
  const inst = item.instruction;
  const head = instructionHead(item).toLowerCase();
  if (head === 'ld' && instructionOperandCount(inst) === 2) {
    const dst = instructionOperand(inst, 0);
    const src = instructionOperand(inst, 1);
    const dstName = regName(dst);
    if (dstName === undefined) return [];
    const dstUnits = getRegisterUnits(dstName);
    if (!dstUnits) return [];
    const srcName = regName(src);
    const srcUnits = srcName ? getRegisterUnits(srcName) : undefined;
    if (srcUnits && srcUnits.length === dstUnits.length) {
      dstUnits.forEach((unit, index) => {
        tokens.set(unit, readToken(tokens, srcUnits[index]!));
        if (readToken(tokens, srcUnits[index]!).origin === 'produced') {
          consumedProduced.add(srcUnits[index]!);
        }
        consumedProduced.delete(unit);
      });
    } else {
      for (const unit of dstUnits) {
        tokens.set(unit, { origin: 'produced' });
        consumedProduced.delete(unit);
      }
    }
    return dstUnits;
  }

  if (head === 'ex' && instructionOperandCount(inst) === 2) {
    const left = instructionOperand(inst, 0);
    const right = instructionOperand(inst, 1);
    const leftName = regName(left);
    const rightName = regName(right);
    if (leftName === undefined || rightName === undefined) return [];
    const leftUnits = getRegisterUnits(leftName);
    const rightUnits = getRegisterUnits(rightName);
    if (!leftUnits || !rightUnits || leftUnits.length !== rightUnits.length) return [];
    const leftTokens = leftUnits.map((unit) => readToken(tokens, unit));
    const rightTokens = rightUnits.map((unit) => readToken(tokens, unit));
    leftUnits.forEach((unit, index) =>
      tokens.set(unit, rightTokens[index] ?? { origin: 'unknown' }),
    );
    rightUnits.forEach((unit, index) =>
      tokens.set(unit, leftTokens[index] ?? { origin: 'unknown' }),
    );
    return unique([...leftUnits, ...rightUnits]);
  }

  return [];
}

function applyKnownBoundarySummary(
  tokens: Map<RegisterCareUnit, Token>,
  consumedProduced: Set<RegisterCareUnit>,
  intendedProduced: Set<RegisterCareUnit>,
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
        tokens.set(unit, { origin: 'produced' });
        consumedProduced.delete(unit);
        if (CONTRACT_FLAG_UNITS.has(unit)) intendedProduced.add(unit);
      }
    });
  }

  for (const unit of summary.mayWrite) {
    if (STACK_POINTER_UNITS.has(unit)) continue;
    if (isTrackedUnit(unit)) {
      tokens.set(unit, { origin: 'unknown' });
      consumedProduced.delete(unit);
      intendedProduced.delete(unit);
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
  const consumedProduced = new Set<RegisterCareUnit>();
  const intendedProduced = new Set<RegisterCareUnit>();
  let stackBalanced = true;
  let hasUnknownStackEffect = false;

  for (let index = 0; index < routine.instructions.length; index += 1) {
    const item = routine.instructions[index]!;
    const effect = getZ80InstructionEffect(item.instruction);
    const knownBoundary = boundarySummary(routine, index, boundarySummaries);
    const carryClearBeforeSbcHl = isCarryClearBeforeSbcHl(item, routine.instructions[index + 1]);
    const expectedTerminalReturn =
      index === routine.instructions.length - 1 && isUnconditionalReturn(item);
    const effectWrites = new Set(effect.writes);
    const instructionIntentOutputs = carryClearBeforeSbcHl ? [] : intentOutputUnits(item);
    const semanticReads = carryClearBeforeSbcHl
      ? effect.reads.filter((unit) => unit !== 'A')
      : effect.reads;
    if (effect.stack.kind !== 'push' && !isPureTokenTransfer(item)) {
      mayRead.push(...semanticReadOrigins(tokens, semanticReads));
      markProducedReadsConsumed(tokens, consumedProduced, semanticReads, effectWrites, item);
    }
    if (instructionHead(item).toLowerCase() === 'djnz') {
      for (const unit of TRACKED_UNITS) {
        if (readToken(tokens, unit).origin === 'produced') consumedProduced.add(unit);
        intendedProduced.delete(unit);
      }
    }
    if (knownBoundary) {
      mayRead.push(...semanticReadOrigins(tokens, knownBoundary.mayRead));
      markProducedReadsConsumed(tokens, consumedProduced, knownBoundary.mayRead, new Set());
    }

    if (effect.stack.kind === 'push') {
      stack.push(effect.stack.units.map((unit) => readToken(tokens, unit)));
    } else if (effect.stack.kind === 'pop') {
      const popped = stack.pop();
      if (!popped) {
        stackBalanced = false;
        for (const unit of effect.stack.units) {
          tokens.set(unit, { origin: 'unknown' });
          intendedProduced.delete(unit);
        }
      } else if (popped.length !== effect.stack.units.length) {
        for (const unit of effect.stack.units) {
          tokens.set(unit, { origin: 'unknown' });
          consumedProduced.delete(unit);
          intendedProduced.delete(unit);
        }
      } else {
        effect.stack.units.forEach((unit, idx) => {
          tokens.set(unit, popped[idx] ?? { origin: 'unknown' });
          consumedProduced.delete(unit);
          intendedProduced.delete(unit);
        });
      }
    } else if (effect.stack.kind === 'exchangeTop') {
      hasUnknownStackEffect = true;
      for (const unit of effect.stack.units) {
        tokens.set(unit, { origin: 'unknown' });
        consumedProduced.delete(unit);
        intendedProduced.delete(unit);
      }
    } else if (
      effect.stack.kind === 'unknown' &&
      !expectedTerminalReturn &&
      (!knownBoundary || !knownBoundary.stackBalanced || knownBoundary.hasUnknownStackEffect)
    ) {
      hasUnknownStackEffect = true;
    }

    const transferWrites = new Set(
      isPureTokenTransfer(item) ? applyPureTokenTransfer(tokens, consumedProduced, item) : [],
    );

    if (knownBoundary) {
      applyKnownBoundarySummary(
        tokens,
        consumedProduced,
        intendedProduced,
        directMayWrite,
        knownBoundary,
      );
    } else if (isOpaqueBoundary(item, effect)) {
      for (const unit of TRACKED_UNITS) {
        tokens.set(unit, { origin: 'unknown' });
        consumedProduced.delete(unit);
        intendedProduced.delete(unit);
      }
    }

    for (const unit of effect.writes) {
      if (STACK_POINTER_UNITS.has(unit)) continue;
      if (effect.stack.kind === 'pop' && effect.stack.units.includes(unit) && isTrackedUnit(unit)) {
        continue;
      }
      if (transferWrites.has(unit) && isTrackedUnit(unit)) continue;
      if (
        unit === 'A' &&
        (instructionHead(item).toLowerCase() === 'or' || instructionHead(item).toLowerCase() === 'and') &&
        isAccumulatorSelfOperand(item)
      ) {
        if (!carryClearBeforeSbcHl) intendedProduced.add(unit);
        continue;
      }

      if (isTrackedUnit(unit)) {
        tokens.set(unit, { origin: isMechanicalResidueWrite(item, unit) ? 'unknown' : 'produced' });
        consumedProduced.delete(unit);
        if (instructionIntentOutputs.includes(unit)) intendedProduced.add(unit);
        else intendedProduced.delete(unit);
      } else {
        directMayWrite.push(unit);
      }
    }
    for (const unit of instructionIntentOutputs) {
      if (!isTrackedUnit(unit) || effectWrites.has(unit)) continue;
      intendedProduced.add(unit);
    }
  }

  if (stack.length !== 0) stackBalanced = false;

  const mayWrite: RegisterCareUnit[] = [...directMayWrite];
  const preserved: RegisterCareUnit[] = [];
  const valueRelations: ValueRelation[] = [];
  const outputUnits = new Set<RegisterCareUnit>();
  for (const pair of REGISTER_PAIRS) {
    const relation = producedPairRelation(tokens, consumedProduced, pair);
    if (relation) {
      addContractRelation(valueRelations, relation);
      for (const unit of pair) outputUnits.add(unit);
    }
  }
  for (const unit of TRACKED_UNITS) {
    if (outputUnits.has(unit)) continue;
    const current = tokens.get(unit);
    const eligibleProduced =
      current?.origin === 'produced' &&
      (GENERAL_REGISTER_UNITS.has(unit) ||
        (CONTRACT_FLAG_UNITS.has(unit) && intendedProduced.has(unit)));
    const eligiblePreservedIntent =
      current?.origin === unit && GENERAL_REGISTER_UNITS.has(unit) && intendedProduced.has(unit);
    if ((eligibleProduced || eligiblePreservedIntent) && !consumedProduced.has(unit)) {
      addContractRelation(valueRelations, {
        out: [unit],
        from: eligiblePreservedIntent ? [unit] : [],
      });
      outputUnits.add(unit);
    }
  }

  for (const unit of TRACKED_UNITS) {
    const current = tokens.get(unit);
    if (tokenPreservesUnit(current, unit)) {
      preserved.push(unit);
      continue;
    }

    if (outputUnits.has(unit)) continue;
    mayWrite.push(unit);
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

  const inferredWrites = withImpliedFlagUnits(summary.mayWrite);
  const baseMayWrite = contract.complete
    ? inferredWrites.filter((unit) => FLAG_UNIT_LIST.includes(unit))
    : inferredWrites;
  const mayWrite = baseMayWrite.filter((unit) => !outputSet.has(unit) && !preservedSet.has(unit));
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
