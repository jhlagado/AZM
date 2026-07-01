import { getZ80InstructionEffect } from '../z80/effects.js';
import { instructionHead } from './instruction-head.js';
import {
  isAccumulatorSelfOperand,
  isImmediateZeroOperand,
  isPureTokenTransferInstruction,
  isRegisterOperand,
} from './instruction-predicates.js';
import { boundarySummary } from './summary-boundary.js';
import {
  CONTRACT_FLAG_UNITS,
  STACK_POINTER_UNITS,
  TRACKED_UNITS,
  isTrackedUnit,
  markProducedReadsConsumed,
  readToken,
  semanticReadOrigins,
  type Token,
} from './summary-state.js';
import { applyPureTokenTransfer } from './summary-token-transfer.js';
export { applyRoutineContract } from './summary-contract.js';
import { buildRoutineSummary, type RoutineInferenceStackState } from './summary-result.js';
import type {
  InstructionEffect,
  RegisterContractsInstruction,
  RegisterContractsRoutine,
  RegisterContractsStackFrameUnit,
  RegisterContractsUnit,
  RoutineSummary,
} from './types.js';

function isOpaqueBoundary(item: RegisterContractsInstruction, effect: InstructionEffect): boolean {
  if (effect.control.kind === 'call' || effect.control.kind === 'rst') return true;
  return (
    effect.control.kind === 'jump' &&
    (instructionHead(item) === 'jp' || instructionHead(item) === 'jp-cc') &&
    !effect.control.conditional &&
    Boolean(effect.control.target) &&
    !effect.control.target?.startsWith('.')
  );
}

function isRoutineReturn(effect: InstructionEffect): boolean {
  return effect.control.kind === 'return';
}

function isPureTokenTransfer(item: RegisterContractsInstruction): boolean {
  return isPureTokenTransferInstruction(item);
}

function isCarryClearBeforeSbcHl(
  item: RegisterContractsInstruction,
  next: RegisterContractsInstruction | undefined,
): boolean {
  const head = instructionHead(item).toLowerCase();
  if (head !== 'or' && head !== 'and') return false;
  if (!isAccumulatorSelfOperand(item)) return false;
  return next !== undefined && instructionHead(next) === 'sbc' && isRegisterOperand(next, 0, 'HL');
}

function intentOutputUnits(item: RegisterContractsInstruction): RegisterContractsUnit[] {
  const head = instructionHead(item).toLowerCase();
  if (head === 'scf' || head === 'ccf') return ['carry'];
  if (head === 'cp')
    return isImmediateZeroOperand(item) ? ['A', 'carry', 'zero'] : ['carry', 'zero'];
  if ((head === 'or' || head === 'and' || head === 'xor') && isAccumulatorSelfOperand(item)) {
    return ['A', 'carry', 'zero'];
  }
  return [];
}

function isMechanicalResidueWrite(
  item: RegisterContractsInstruction,
  unit: RegisterContractsUnit,
): boolean {
  const head = instructionHead(item).toLowerCase();
  if (head === 'djnz') return unit === 'B';
  if (BLOCK_TRANSFER_HEADS.has(head)) return BLOCK_TRANSFER_RESIDUE_UNITS.has(unit);
  return false;
}

const BLOCK_TRANSFER_HEADS = new Set(['ldi', 'ldir', 'ldd', 'lddr']);
const BLOCK_TRANSFER_RESIDUE_UNITS = new Set<RegisterContractsUnit>(['B', 'C', 'D', 'E', 'H', 'L']);

interface InferenceStackEntry {
  readonly units: readonly RegisterContractsUnit[];
  readonly tokens: readonly Token[];
}

function applyKnownBoundarySummary(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  intendedProduced: Set<RegisterContractsUnit>,
  directMayWrite: RegisterContractsUnit[],
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

function applyStackPop(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  intendedProduced: Set<RegisterContractsUnit>,
  stack: InferenceStackEntry[],
  state: RoutineInferenceStackState,
  units: readonly RegisterContractsUnit[],
): void {
  const popped = stack.pop();
  if (!popped) {
    state.stackBalanced = false;
    for (const unit of units) {
      tokens.set(unit, { origin: 'unknown' });
      intendedProduced.delete(unit);
    }
    return;
  }
  if (popped.tokens.length !== units.length) {
    for (const unit of units) {
      tokens.set(unit, { origin: 'unknown' });
      consumedProduced.delete(unit);
      intendedProduced.delete(unit);
    }
    return;
  }
  units.forEach((unit, idx) => {
    tokens.set(unit, popped.tokens[idx] ?? { origin: 'unknown' });
    consumedProduced.delete(unit);
    intendedProduced.delete(unit);
  });
}

function stackFrameUnits(frameUnit: RegisterContractsStackFrameUnit): RegisterContractsUnit[] {
  if (frameUnit === 'AF') return ['A', 'sign', 'zero', 'halfCarry', 'parity', 'carry'];
  if (frameUnit === 'BC') return ['B', 'C'];
  if (frameUnit === 'DE') return ['D', 'E'];
  if (frameUnit === 'HL') return ['H', 'L'];
  if (frameUnit === 'IX') return ['IXH', 'IXL'];
  return ['IYH', 'IYL'];
}

function consumeKnownBoundaryStackFrame(
  stack: InferenceStackEntry[],
  state: RoutineInferenceStackState,
  knownBoundary: RoutineSummary | undefined,
): void {
  for (const frameUnit of knownBoundary?.consumesStackFrame ?? []) {
    const expected = stackFrameUnits(frameUnit);
    const popped = stack.pop();
    if (
      popped === undefined ||
      popped.units.length !== expected.length ||
      !popped.units.every((unit, index) => unit === expected[index])
    ) {
      state.stackBalanced = false;
    }
  }
}

function applyUnknownStackUnits(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  intendedProduced: Set<RegisterContractsUnit>,
  units: readonly RegisterContractsUnit[],
): void {
  for (const unit of units) {
    tokens.set(unit, { origin: 'unknown' });
    consumedProduced.delete(unit);
    intendedProduced.delete(unit);
  }
}

function applyStackEffect(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  intendedProduced: Set<RegisterContractsUnit>,
  stack: InferenceStackEntry[],
  state: RoutineInferenceStackState,
  effect: InstructionEffect,
  expectedTerminalReturn: boolean,
  knownBoundary: RoutineSummary | undefined,
): void {
  if (effect.stack.kind === 'push') {
    stack.push({
      units: effect.stack.units,
      tokens: effect.stack.units.map((unit) => readToken(tokens, unit)),
    });
    return;
  }

  if (effect.stack.kind === 'pop') {
    applyStackPop(tokens, consumedProduced, intendedProduced, stack, state, effect.stack.units);
    return;
  }

  if (effect.stack.kind === 'exchangeTop') {
    state.hasUnknownStackEffect = true;
    applyUnknownStackUnits(tokens, consumedProduced, intendedProduced, effect.stack.units);
    return;
  }

  consumeKnownBoundaryStackFrame(stack, state, knownBoundary);

  if (expectedTerminalReturn && stack.length !== 0) {
    state.stackBalanced = false;
  }

  if (
    effect.stack.kind === 'unknown' &&
    !expectedTerminalReturn &&
    (!knownBoundary || !knownBoundary.stackBalanced || knownBoundary.hasUnknownStackEffect)
  ) {
    state.hasUnknownStackEffect = true;
  }
}

function applyEffectWrites(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  intendedProduced: Set<RegisterContractsUnit>,
  directMayWrite: RegisterContractsUnit[],
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  transferWrites: ReadonlySet<RegisterContractsUnit>,
  instructionIntentOutputs: readonly RegisterContractsUnit[],
  carryClearBeforeSbcHl: boolean,
): void {
  for (const unit of effect.writes) {
    if (shouldIgnoreEffectWrite(unit, effect, transferWrites)) continue;
    if (applyAccumulatorSelfWrite(unit, item, intendedProduced, carryClearBeforeSbcHl)) continue;
    applyEffectWriteUnit(
      tokens,
      consumedProduced,
      intendedProduced,
      directMayWrite,
      item,
      unit,
      instructionIntentOutputs,
    );
  }
}

function shouldIgnoreEffectWrite(
  unit: RegisterContractsUnit,
  effect: InstructionEffect,
  transferWrites: ReadonlySet<RegisterContractsUnit>,
): boolean {
  return (
    STACK_POINTER_UNITS.has(unit) ||
    isStackPopTrackedWrite(unit, effect) ||
    (transferWrites.has(unit) && isTrackedUnit(unit))
  );
}

function isStackPopTrackedWrite(unit: RegisterContractsUnit, effect: InstructionEffect): boolean {
  return effect.stack.kind === 'pop' && effect.stack.units.includes(unit) && isTrackedUnit(unit);
}

function applyAccumulatorSelfWrite(
  unit: RegisterContractsUnit,
  item: RegisterContractsInstruction,
  intendedProduced: Set<RegisterContractsUnit>,
  carryClearBeforeSbcHl: boolean,
): boolean {
  if (unit !== 'A' || !isOrAndAccumulatorSelf(item)) return false;
  if (!carryClearBeforeSbcHl) intendedProduced.add(unit);
  return true;
}

function isOrAndAccumulatorSelf(item: RegisterContractsInstruction): boolean {
  const head = instructionHead(item).toLowerCase();
  return (head === 'or' || head === 'and') && isAccumulatorSelfOperand(item);
}

function applyEffectWriteUnit(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  intendedProduced: Set<RegisterContractsUnit>,
  directMayWrite: RegisterContractsUnit[],
  item: RegisterContractsInstruction,
  unit: RegisterContractsUnit,
  instructionIntentOutputs: readonly RegisterContractsUnit[],
): void {
  if (!isTrackedUnit(unit)) {
    directMayWrite.push(unit);
    return;
  }

  tokens.set(unit, { origin: isMechanicalResidueWrite(item, unit) ? 'unknown' : 'produced' });
  consumedProduced.delete(unit);
  if (instructionIntentOutputs.includes(unit)) intendedProduced.add(unit);
  else intendedProduced.delete(unit);
}

function addInstructionIntentOutputs(
  intendedProduced: Set<RegisterContractsUnit>,
  effectWrites: ReadonlySet<RegisterContractsUnit>,
  instructionIntentOutputs: readonly RegisterContractsUnit[],
): void {
  for (const unit of instructionIntentOutputs) {
    if (!isTrackedUnit(unit) || effectWrites.has(unit)) continue;
    intendedProduced.add(unit);
  }
}

function recordInstructionReads(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  intendedProduced: Set<RegisterContractsUnit>,
  mayRead: RegisterContractsUnit[],
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  knownBoundary: RoutineSummary | undefined,
  semanticReads: RegisterContractsUnit[],
  effectWrites: ReadonlySet<RegisterContractsUnit>,
): void {
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
}

interface InferenceState {
  readonly tokens: Map<RegisterContractsUnit, Token>;
  readonly stack: InferenceStackEntry[];
  readonly mayRead: RegisterContractsUnit[];
  readonly directMayWrite: RegisterContractsUnit[];
  readonly consumedProduced: Set<RegisterContractsUnit>;
  readonly intendedProduced: Set<RegisterContractsUnit>;
  readonly stackState: RoutineInferenceStackState;
}

interface InstructionInferenceContext {
  readonly item: RegisterContractsInstruction;
  readonly effect: InstructionEffect;
  readonly knownBoundary: RoutineSummary | undefined;
  readonly carryClearBeforeSbcHl: boolean;
  readonly expectedTerminalReturn: boolean;
  readonly effectWrites: ReadonlySet<RegisterContractsUnit>;
  readonly instructionIntentOutputs: readonly RegisterContractsUnit[];
  readonly semanticReads: readonly RegisterContractsUnit[];
}

function createInferenceState(): InferenceState {
  const tokens = new Map<RegisterContractsUnit, Token>();
  for (const unit of TRACKED_UNITS) tokens.set(unit, { origin: unit });

  return {
    tokens,
    stack: [],
    mayRead: [],
    directMayWrite: [],
    consumedProduced: new Set<RegisterContractsUnit>(),
    intendedProduced: new Set<RegisterContractsUnit>(),
    stackState: {
      stackBalanced: true,
      hasUnknownStackEffect: false,
    },
  };
}

function instructionInferenceContext(
  routine: RegisterContractsRoutine,
  index: number,
  boundarySummaries: ReadonlyMap<string, RoutineSummary>,
): InstructionInferenceContext {
  const item = routine.instructions[index]!;
  const effect = getZ80InstructionEffect(item.instruction);
  const carryClearBeforeSbcHl = isCarryClearBeforeSbcHl(item, routine.instructions[index + 1]);
  return {
    item,
    effect,
    knownBoundary: boundarySummary(routine, index, boundarySummaries),
    carryClearBeforeSbcHl,
    expectedTerminalReturn: isRoutineReturn(effect),
    effectWrites: new Set(effect.writes),
    instructionIntentOutputs: carryClearBeforeSbcHl ? [] : intentOutputUnits(item),
    semanticReads: carryClearBeforeSbcHl
      ? effect.reads.filter((unit) => unit !== 'A')
      : effect.reads,
  };
}

function applyBoundaryOrOpaqueWrites(
  state: InferenceState,
  context: InstructionInferenceContext,
): void {
  if (context.knownBoundary) {
    applyKnownBoundarySummary(
      state.tokens,
      state.consumedProduced,
      state.intendedProduced,
      state.directMayWrite,
      context.knownBoundary,
    );
  } else if (isOpaqueBoundary(context.item, context.effect)) {
    for (const unit of TRACKED_UNITS) {
      state.tokens.set(unit, { origin: 'unknown' });
      state.consumedProduced.delete(unit);
      state.intendedProduced.delete(unit);
    }
  }
}

function inferInstructionSummaryStep(
  state: InferenceState,
  context: InstructionInferenceContext,
): void {
  recordInstructionReads(
    state.tokens,
    state.consumedProduced,
    state.intendedProduced,
    state.mayRead,
    context.item,
    context.effect,
    context.knownBoundary,
    [...context.semanticReads],
    context.effectWrites,
  );

  applyStackEffect(
    state.tokens,
    state.consumedProduced,
    state.intendedProduced,
    state.stack,
    state.stackState,
    context.effect,
    context.expectedTerminalReturn,
    context.knownBoundary,
  );

  const transferWrites = new Set(
    isPureTokenTransfer(context.item)
      ? applyPureTokenTransfer(state.tokens, state.consumedProduced, context.item)
      : [],
  );

  applyBoundaryOrOpaqueWrites(state, context);

  applyEffectWrites(
    state.tokens,
    state.consumedProduced,
    state.intendedProduced,
    state.directMayWrite,
    context.item,
    context.effect,
    transferWrites,
    context.instructionIntentOutputs,
    context.carryClearBeforeSbcHl,
  );
  addInstructionIntentOutputs(
    state.intendedProduced,
    context.effectWrites,
    context.instructionIntentOutputs,
  );
}

export function inferRoutineSummary(
  routine: RegisterContractsRoutine,
  boundarySummaries: ReadonlyMap<string, RoutineSummary> = new Map(),
): RoutineSummary {
  const state = createInferenceState();

  for (let index = 0; index < routine.instructions.length; index += 1) {
    inferInstructionSummaryStep(
      state,
      instructionInferenceContext(routine, index, boundarySummaries),
    );
  }

  if (state.stack.length !== 0) state.stackState.stackBalanced = false;

  return buildRoutineSummary(
    routine,
    state.tokens,
    state.consumedProduced,
    state.intendedProduced,
    state.directMayWrite,
    state.mayRead,
    state.stackState,
  );
}
