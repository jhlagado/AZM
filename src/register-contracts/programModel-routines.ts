import type { SourceItem } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';
import { instructionCallTarget, pushDirectBoundary } from './programModel-boundaries.js';
import type {
  RegisterContractsDirectCall,
  RegisterContractsInstruction,
  RegisterContractsRoutine,
} from './types.js';

type LabelItem = Extract<SourceItem, { kind: 'label' }>;
type InstructionItem = Extract<SourceItem, { kind: 'instruction' }>;

interface RoutineBuildState {
  routineName?: string;
  entryLabels: string[];
  labels: string[];
  sourceName?: string;
  sourceUnit?: string;
  sourceRelation?: SourceSpan['sourceRelation'];
  sourceUnitRelation?: SourceSpan['sourceUnitRelation'];
  routineStartLine?: number;
  routineStartColumn?: number;
  instructions: RegisterContractsInstruction[];
}

interface RoutineBuildContext {
  readonly constants: ReadonlyMap<string, number>;
  readonly filesWithEntryLabels: ReadonlySet<string>;
  readonly directCallTargets: ReadonlySet<string>;
}

export interface RoutineBuildResult {
  routines: RegisterContractsRoutine[];
  directCalls: RegisterContractsDirectCall[];
}

function isGlobalLabel(name: string): boolean {
  return !name.startsWith('.');
}

function isGeneratedOpLabel(name: string): boolean {
  return name.startsWith('__azm_op_');
}

function emptyState(): RoutineBuildState {
  return {
    entryLabels: [],
    labels: [],
    instructions: [],
  };
}

function toInstruction(
  item: InstructionItem,
  labels: readonly string[],
  constants: ReadonlyMap<string, number>,
): RegisterContractsInstruction {
  const span = effectiveInstructionSpan(item);
  return {
    instruction: item.instruction,
    file: span.sourceName,
    line: span.line,
    column: span.column,
    ...(span.sourceUnit !== undefined ? { sourceUnit: span.sourceUnit } : {}),
    ...(span.sourceRelation !== undefined ? { sourceRelation: span.sourceRelation } : {}),
    ...(span.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: span.sourceUnitRelation }
      : {}),
    labels: [...labels],
    constants,
  };
}

function effectiveInstructionSpan(item: InstructionItem): SourceSpan {
  return item.emittedSource?.span ?? item.span;
}

function startRoutine(state: RoutineBuildState, item: LabelItem): void {
  state.sourceName = item.span.sourceName;
  if (item.span.sourceUnit !== undefined) state.sourceUnit = item.span.sourceUnit;
  else delete state.sourceUnit;
  if (item.span.sourceRelation !== undefined) state.sourceRelation = item.span.sourceRelation;
  else delete state.sourceRelation;
  if (item.span.sourceUnitRelation !== undefined) {
    state.sourceUnitRelation = item.span.sourceUnitRelation;
  } else {
    delete state.sourceUnitRelation;
  }
  state.routineName = item.name;
  state.entryLabels = item.isEntry === true ? [item.name] : [];
  state.labels = [item.name];
  state.routineStartLine = item.span.line;
  state.routineStartColumn = item.span.column;
  state.instructions = [];
}

function routineSpan(
  state: RoutineBuildState,
  end?: RegisterContractsInstruction,
): RegisterContractsRoutine['span'] {
  const line = state.routineStartLine ?? 1;
  return {
    file: state.sourceName ?? '',
    ...(state.sourceUnit !== undefined ? { sourceUnit: state.sourceUnit } : {}),
    ...(state.sourceRelation !== undefined ? { sourceRelation: state.sourceRelation } : {}),
    ...(state.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: state.sourceUnitRelation }
      : {}),
    start: { line, column: state.routineStartColumn ?? 1 },
    end: { line: end?.line ?? line, column: end?.column ?? state.routineStartColumn ?? 1 },
  };
}

function flushRoutine(
  routines: RegisterContractsRoutine[],
  state: RoutineBuildState,
  constants: ReadonlyMap<string, number>,
): void {
  if (state.routineName === undefined || state.routineStartLine === undefined) return;
  const end = state.instructions[state.instructions.length - 1];
  routines.push({
    name: state.routineName,
    labels: [...state.labels],
    entryLabels: [...state.entryLabels],
    instructions: [...state.instructions],
    constants,
    span: routineSpan(state, end),
  });
}

function resetAndStart(
  routines: RegisterContractsRoutine[],
  state: RoutineBuildState,
  context: RoutineBuildContext,
  item: LabelItem,
): void {
  flushRoutine(routines, state, context.constants);
  Object.assign(state, emptyState());
  startRoutine(state, item);
}

function appendDirectCall(directCalls: RegisterContractsDirectCall[], item: InstructionItem): void {
  const directTarget = instructionCallTarget(item);
  if (directTarget === undefined) return;
  pushDirectBoundary(
    directCalls,
    directTarget,
    `CALL ${directTarget}`,
    effectiveInstructionSpan(item),
  );
}

function handleInstruction(
  state: RoutineBuildState,
  directCalls: RegisterContractsDirectCall[],
  item: InstructionItem,
  context: RoutineBuildContext,
): void {
  if (state.routineName === undefined || state.sourceName === undefined) return;
  if (effectiveInstructionSpan(item).sourceName !== state.sourceName) return;
  state.instructions.push(toInstruction(item, state.labels, context.constants));
  appendDirectCall(directCalls, item);
}

function handleGlobalLabel(
  routines: RegisterContractsRoutine[],
  state: RoutineBuildState,
  item: LabelItem,
  context: RoutineBuildContext,
): void {
  if (state.routineName === undefined) {
    if (shouldIgnoreNonEntryLabel(item, context)) return;
    startRoutine(state, item);
    return;
  }

  if (isDifferentRoutineSource(state, item)) {
    resetAndStart(routines, state, context, item);
    return;
  }

  if (state.instructions.length > 0) {
    if (shouldKeepPostInstructionAlias(item, context)) {
      appendRoutineLabel(state, item);
      return;
    }
    resetAndStart(routines, state, context, item);
    return;
  }

  appendRoutineLabel(state, item);
}

function shouldIgnoreNonEntryLabel(item: LabelItem, context: RoutineBuildContext): boolean {
  return (
    context.filesWithEntryLabels.has(item.span.sourceName) &&
    item.isEntry !== true &&
    !context.directCallTargets.has(item.name)
  );
}

function isDifferentRoutineSource(state: RoutineBuildState, item: LabelItem): boolean {
  return state.sourceName === undefined || state.sourceName !== item.span.sourceName;
}

function shouldKeepPostInstructionAlias(item: LabelItem, context: RoutineBuildContext): boolean {
  return shouldIgnoreNonEntryLabel(item, context);
}

function appendRoutineLabel(state: RoutineBuildState, item: LabelItem): void {
  state.labels.push(item.name);
  if (item.isEntry === true) state.entryLabels.push(item.name);
}

function handleLabel(
  routines: RegisterContractsRoutine[],
  state: RoutineBuildState,
  item: LabelItem,
  context: RoutineBuildContext,
): void {
  if (!isGlobalLabel(item.name) || isGeneratedOpLabel(item.name)) {
    if (state.routineName !== undefined) state.labels.push(item.name);
    return;
  }
  handleGlobalLabel(routines, state, item, context);
}

export function buildRoutinesAndDirectCalls(
  items: readonly SourceItem[],
  constants: ReadonlyMap<string, number>,
  filesWithEntryLabels: ReadonlySet<string>,
): RoutineBuildResult {
  const routines: RegisterContractsRoutine[] = [];
  const directCalls: RegisterContractsDirectCall[] = [];
  const context: RoutineBuildContext = {
    constants,
    filesWithEntryLabels,
    directCallTargets: collectDirectCallTargets(items),
  };
  const state = emptyState();

  for (const item of items) {
    if (item.kind === 'instruction') {
      handleInstruction(state, directCalls, item, context);
    } else if (item.kind === 'label') {
      handleLabel(routines, state, item, context);
    }
  }

  flushRoutine(routines, state, constants);
  return { routines, directCalls };
}

function collectDirectCallTargets(items: readonly SourceItem[]): ReadonlySet<string> {
  const targets = new Set<string>();
  for (const item of items) {
    const target = instructionCallTarget(item);
    if (target !== undefined) targets.add(target);
  }
  return targets;
}
