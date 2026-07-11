import { getZ80InstructionEffect } from '../z80/effects.js';
import { instructionSuccessors, labelIndex } from './controlFlow.js';
import { instructionHead } from './instruction-head.js';
import {
  isAccumulatorSelfOperand,
  isImmediateZeroOperand,
  isPureTokenTransferInstruction,
  isRegisterOperand,
} from './instruction-predicates.js';
import { boundarySummary, isExternalTailJump } from './summary-boundary.js';
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
export {
  applyRoutineContract,
  bodyEffectWriteUnits,
  declarationContractMismatchUnits,
  declaredAllowedWriteUnits,
  hasExplicitDeclaredContract,
} from './summary-contract.js';
import { buildRoutineSummary, type RoutineInferenceStackState } from './summary-result.js';
import type {
  InstructionEffect,
  RegisterContractsInstruction,
  RegisterContractsRoutine,
  RegisterContractsServiceRangeContract,
  RegisterContractsStackFrameUnit,
  RegisterContractsUnit,
  RoutineSummary,
} from './types.js';

function isOpaqueBoundary(
  routine: RegisterContractsRoutine,
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
): boolean {
  if (effect.control.kind === 'call' || effect.control.kind === 'rst') return true;
  return isExternalTailJump(routine, item, effect) && !effect.control.conditional;
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
  if (knownBoundary !== undefined) {
    if (!knownBoundary.stackBalanced) state.stackBalanced = false;
    if (knownBoundary.hasUnknownStackEffect === true) state.hasUnknownStackEffect = true;
  }

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

function cloneStack(stack: readonly InferenceStackEntry[]): InferenceStackEntry[] {
  return stack.map((entry) => ({
    units: [...entry.units],
    tokens: [...entry.tokens],
  }));
}

function stackSignature(stack: readonly InferenceStackEntry[]): string {
  return stack.map((entry) => entry.units.join('+')).join('/');
}

function emptyStackProofState(): RoutineInferenceStackState {
  return { stackBalanced: true, hasUnknownStackEffect: false };
}

function boundaryFallsThrough(effect: InstructionEffect): boolean {
  return effect.control.kind === 'call' || effect.control.kind === 'rst';
}

function isTerminalExit(
  routine: RegisterContractsRoutine,
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  successors: readonly number[],
): boolean {
  if (successors.length > 0) return false;
  if (effect.control.kind === 'return' && !effect.control.conditional) return true;
  return isOpaqueBoundary(routine, item, effect) || effect.control.kind === 'fallthrough';
}

function proveStackDiscipline(
  routine: RegisterContractsRoutine,
  boundarySummaries: ReadonlyMap<string, RoutineSummary>,
  serviceRanges: readonly RegisterContractsServiceRangeContract[],
): RoutineInferenceStackState {
  const labels = labelIndex(routine);
  const state = emptyStackProofState();
  const seen = new Set<string>();
  const work: Array<{ index: number; stack: InferenceStackEntry[] }> =
    routine.instructions.length > 0 ? [{ index: 0, stack: [] }] : [];

  while (work.length > 0) {
    const current = work.pop()!;
    const seenKey = `${current.index}|${stackSignature(current.stack)}`;
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    if (seen.size > 5000) {
      state.hasUnknownStackEffect = true;
      return state;
    }

    const item = routine.instructions[current.index];
    if (item === undefined) {
      if (current.stack.length !== 0) state.stackBalanced = false;
      continue;
    }

    const effect = getZ80InstructionEffect(item.instruction);
    const stack = cloneStack(current.stack);
    const knownBoundary = boundarySummary(routine, current.index, boundarySummaries, serviceRanges);
    if (effect.control.kind === 'jump' && effect.control.conditional && knownBoundary) {
      const branchStack = cloneStack(stack);
      applyStackEffect(
        new Map(),
        new Set(),
        new Set(),
        branchStack,
        state,
        effect,
        false,
        knownBoundary,
      );
      if (branchStack.length !== 0) state.stackBalanced = false;
      applyStackEffect(new Map(), new Set(), new Set(), stack, state, effect, false, undefined);
    } else {
      applyStackEffect(
        new Map(),
        new Set(),
        new Set(),
        stack,
        state,
        effect,
        isRoutineReturn(effect),
        knownBoundary,
      );
    }

    const successors = instructionSuccessors(routine, current.index, effect, labels, {
      boundaryFallthrough: boundaryFallsThrough(effect),
    });
    if (isTerminalExit(routine, item, effect, successors) && stack.length !== 0) {
      state.stackBalanced = false;
    }
    for (const successor of successors) {
      work.push({ index: successor, stack: cloneStack(stack) });
    }
  }

  return state;
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
  readonly opaqueBoundary: boolean;
}

function cloneInferenceState(state: InferenceState): InferenceState {
  return {
    tokens: new Map(state.tokens),
    stack: cloneStack(state.stack),
    mayRead: [...state.mayRead],
    directMayWrite: [...state.directMayWrite],
    consumedProduced: new Set(state.consumedProduced),
    intendedProduced: new Set(state.intendedProduced),
    stackState: { ...state.stackState },
  };
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
  serviceRanges: readonly RegisterContractsServiceRangeContract[],
): InstructionInferenceContext {
  const item = routine.instructions[index]!;
  const effect = getZ80InstructionEffect(item.instruction);
  const carryClearBeforeSbcHl = isCarryClearBeforeSbcHl(item, routine.instructions[index + 1]);
  return {
    item,
    effect,
    knownBoundary: boundarySummary(routine, index, boundarySummaries, serviceRanges),
    carryClearBeforeSbcHl,
    expectedTerminalReturn: isRoutineReturn(effect),
    effectWrites: new Set(effect.writes),
    instructionIntentOutputs: carryClearBeforeSbcHl ? [] : intentOutputUnits(item),
    semanticReads: carryClearBeforeSbcHl
      ? effect.reads.filter((unit) => unit !== 'A')
      : effect.reads,
    opaqueBoundary: isOpaqueBoundary(routine, item, effect),
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
  } else if (context.opaqueBoundary) {
    for (const unit of TRACKED_UNITS) {
      state.tokens.set(unit, { origin: 'unknown' });
      state.consumedProduced.delete(unit);
      state.intendedProduced.delete(unit);
    }
  }
}

function isConditionalTailBoundary(context: InstructionInferenceContext): boolean {
  return (
    context.knownBoundary !== undefined &&
    context.effect.control.kind === 'jump' &&
    context.effect.control.conditional
  );
}

function isUnconditionalExternalTail(
  routine: RegisterContractsRoutine,
  context: InstructionInferenceContext,
): boolean {
  return (
    isExternalTailJump(routine, context.item, context.effect) &&
    !context.effect.control.conditional
  );
}

function summaryFromState(
  routine: RegisterContractsRoutine,
  state: InferenceState,
): RoutineSummary {
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

function summaryFromNonReturningState(
  routine: RegisterContractsRoutine,
  state: InferenceState,
): RoutineSummary {
  const nonReturningState = cloneInferenceState(state);
  nonReturningState.stack.length = 0;
  const summary = summaryFromState(routine, nonReturningState);
  return {
    ...summary,
    mayWrite: [
      ...new Set([
        ...summary.mayWrite,
        ...summary.valueRelations.flatMap((relation) => relation.out),
      ]),
    ],
    valueRelations: [],
  };
}

function relationKey(relation: RoutineSummary['valueRelations'][number]): string {
  return `${relation.out.join(',')}<-${relation.from.join(',')}`;
}

function intersection<T>(left: readonly T[], right: readonly T[]): T[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function mergeAlternativeSummaries(left: RoutineSummary, right: RoutineSummary): RoutineSummary {
  const rightRelations = new Set(right.valueRelations.map(relationKey));
  const valueRelations = left.valueRelations.filter((relation) =>
    rightRelations.has(relationKey(relation)),
  );
  const guaranteedOutputs = new Set(valueRelations.flatMap((relation) => relation.out));
  const alternativeWrites = [
    ...left.mayWrite,
    ...right.mayWrite,
    ...left.valueRelations.flatMap((relation) => relation.out),
    ...right.valueRelations.flatMap((relation) => relation.out),
  ];
  return {
    name: left.name,
    ...(left.identity !== undefined ? { identity: left.identity } : {}),
    mayRead: [...new Set([...left.mayRead, ...right.mayRead])],
    mayWrite: [...new Set(alternativeWrites)].filter((unit) => !guaranteedOutputs.has(unit)),
    ...(left.mayOutput !== undefined || right.mayOutput !== undefined
      ? { mayOutput: intersection(left.mayOutput ?? [], right.mayOutput ?? []) }
      : {}),
    preserved: intersection(left.preserved, right.preserved),
    valueRelations,
    stackBalanced: left.stackBalanced && right.stackBalanced,
    hasUnknownStackEffect:
      left.hasUnknownStackEffect === true || right.hasUnknownStackEffect === true,
    ...(left.consumesStackFrame !== undefined || right.consumesStackFrame !== undefined
      ? {
          consumesStackFrame: intersection(
            left.consumesStackFrame ?? [],
            right.consumesStackFrame ?? [],
          ),
        }
      : {}),
  };
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

function inferenceStateSignature(state: InferenceState): string {
  const tokens = TRACKED_UNITS.map((unit) => `${unit}:${readToken(state.tokens, unit).origin}`);
  const stack = state.stack.map((entry) =>
    entry.units.map((unit, index) => `${unit}:${entry.tokens[index]?.origin ?? 'unknown'}`).join('+'),
  );
  const sorted = (values: Iterable<RegisterContractsUnit>) => [...new Set(values)].sort();
  return JSON.stringify([
    tokens,
    stack,
    sorted(state.mayRead),
    sorted(state.directMayWrite),
    sorted(state.consumedProduced),
    sorted(state.intendedProduced),
    state.stackState.stackBalanced,
    state.stackState.hasUnknownStackEffect,
  ]);
}

function conservativeInferenceState(state: InferenceState): InferenceState {
  const conservative = cloneInferenceState(state);
  for (const unit of TRACKED_UNITS) conservative.tokens.set(unit, { origin: 'unknown' });
  conservative.mayRead.push(...TRACKED_UNITS);
  conservative.consumedProduced.clear();
  conservative.intendedProduced.clear();
  conservative.stackState.hasUnknownStackEffect = true;
  return conservative;
}

function pushSuccessorStates(
  work: Array<{ index: number; state: InferenceState }>,
  successors: readonly number[],
  state: InferenceState,
  exits: InferenceState[],
): void {
  if (successors.length === 0) {
    exits.push(state);
    return;
  }
  successors.forEach((index, position) => {
    work.push({ index, state: position === 0 ? state : cloneInferenceState(state) });
  });
}

function inferRoutineExitStates(
  routine: RegisterContractsRoutine,
  boundarySummaries: ReadonlyMap<string, RoutineSummary>,
  serviceRanges: readonly RegisterContractsServiceRangeContract[],
): { exits: InferenceState[]; cycles: InferenceState[] } {
  if (routine.instructions.length === 0) {
    return { exits: [createInferenceState()], cycles: [] };
  }
  const labels = labelIndex(routine);
  const exits: InferenceState[] = [];
  const cycles: InferenceState[] = [];
  const work = [{ index: 0, state: createInferenceState() }];
  const seen = new Set<string>();

  while (work.length > 0) {
    const current = work.pop()!;
    const key = `${current.index}|${inferenceStateSignature(current.state)}`;
    if (seen.has(key)) {
      cycles.push(current.state);
      continue;
    }
    seen.add(key);
    if (seen.size > 5000) {
      exits.push(conservativeInferenceState(current.state));
      break;
    }

    const context = instructionInferenceContext(
      routine,
      current.index,
      boundarySummaries,
      serviceRanges,
    );
    if (isConditionalTailBoundary(context)) {
      const branchState = cloneInferenceState(current.state);
      inferInstructionSummaryStep(branchState, context);
      exits.push(branchState);
      inferInstructionSummaryStep(current.state, { ...context, knownBoundary: undefined });
      pushSuccessorStates(
        work,
        instructionSuccessors(routine, current.index, context.effect, labels),
        current.state,
        exits,
      );
      continue;
    }
    if (context.effect.control.kind === 'return' && context.effect.control.conditional) {
      const branchState = cloneInferenceState(current.state);
      inferInstructionSummaryStep(branchState, context);
      exits.push(branchState);
      inferInstructionSummaryStep(current.state, {
        ...context,
        effect: { ...context.effect, stack: { kind: 'none' } },
        expectedTerminalReturn: false,
      });
      pushSuccessorStates(
        work,
        instructionSuccessors(routine, current.index, context.effect, labels),
        current.state,
        exits,
      );
      continue;
    }

    inferInstructionSummaryStep(current.state, context);
    if (isUnconditionalExternalTail(routine, context)) {
      exits.push(current.state);
      continue;
    }
    pushSuccessorStates(
      work,
      instructionSuccessors(routine, current.index, context.effect, labels, {
        boundaryFallthrough: true,
      }),
      current.state,
      exits,
    );
  }

  if (exits.length === 0 && cycles.length === 0) {
    exits.push(conservativeInferenceState(createInferenceState()));
  }
  return { exits, cycles };
}

export function inferRoutineSummary(
  routine: RegisterContractsRoutine,
  boundarySummaries: ReadonlyMap<string, RoutineSummary> = new Map(),
  serviceRanges: readonly RegisterContractsServiceRangeContract[] = [],
): RoutineSummary {
  const { exits, cycles } = inferRoutineExitStates(routine, boundarySummaries, serviceRanges);
  const stackProof = proveStackDiscipline(routine, boundarySummaries, serviceRanges);
  for (const state of [...exits, ...cycles]) {
    state.stackState.stackBalanced = state.stackState.stackBalanced && stackProof.stackBalanced;
    if (stackProof.hasUnknownStackEffect) state.stackState.hasUnknownStackEffect = true;
  }
  const cycleSummaries = cycles.map((state) => summaryFromNonReturningState(routine, state));
  const summaries =
    exits.length > 0
      ? exits.map((state) => summaryFromState(routine, state))
      : cycleSummaries;
  const [first, ...rest] = summaries;
  const merged = rest.reduce(mergeAlternativeSummaries, first!);
  return exits.length === 0
    ? merged
    : {
        ...merged,
        mayRead: [
          ...new Set([...merged.mayRead, ...cycleSummaries.flatMap((summary) => summary.mayRead)]),
        ],
      };
}
