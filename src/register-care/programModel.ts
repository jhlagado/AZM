import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import type {
  RegisterCareDirectCall,
  RegisterCareInstruction,
  RegisterCareProgramModel,
  RegisterCareRoutine,
} from './types.js';

function isGlobalLabel(name: string): boolean {
  return !name.startsWith('.');
}

function routineNameFromExpression(expression: Expression): string | undefined {
  return expression.kind === 'symbol' ? expression.name : undefined;
}

function instructionCallTarget(item: SourceItem): string | undefined {
  if (item.kind !== 'instruction') return undefined;
  const mnemonic = item.instruction.mnemonic;
  if (mnemonic === 'call' || mnemonic === 'call-cc') {
    return routineNameFromExpression(item.instruction.expression);
  }
  return undefined;
}

function instructionTailJumpTarget(
  item: SourceItem,
  entryNames?: ReadonlySet<string>,
): string | undefined {
  if (item.kind !== 'instruction') return undefined;
  const mnemonic = item.instruction.mnemonic;
  if (mnemonic === 'jp-cc' && entryNames === undefined) return undefined;
  if (mnemonic !== 'jp' && mnemonic !== 'jp-cc') return undefined;
  const target = routineNameFromExpression(item.instruction.expression);
  if (target === undefined || target.startsWith('.')) return undefined;
  if (entryNames !== undefined && !entryNames.has(target)) return undefined;
  return target;
}

function toInstruction(
  item: Extract<SourceItem, { kind: 'instruction' }>,
  labels: readonly string[],
): RegisterCareInstruction {
  return {
    instruction: item.instruction,
    file: item.span.sourceName,
    line: item.span.line,
    column: item.span.column,
    labels: [...labels],
  };
}

function pushDirectBoundary(
  boundaries: RegisterCareDirectCall[],
  target: string,
  subject: string,
  file: string,
  line: number,
  column: number,
): void {
  boundaries.push({ target, subject, file, line, column });
}

export function buildRegisterCareProgramModel(items: readonly SourceItem[]): RegisterCareProgramModel {
  const routines: RegisterCareRoutine[] = [];
  const directCalls: RegisterCareDirectCall[] = [];
  const filesWithEntryLabels = new Set(
    items
      .filter((item): item is Extract<SourceItem, { kind: 'label' }> => item.kind === 'label')
      .filter((item) => item.isEntry === true)
      .map((item) => item.span.sourceName),
  );

  let routineName: string | undefined;
  let entryLabels: string[] = [];
  let labels: string[] = [];
  let sourceName: string | undefined;
  let routineStartLine: number | undefined;
  let routineStartColumn: number | undefined;
  let instructions: RegisterCareInstruction[] = [];

  const startRoutine = (item: Extract<SourceItem, { kind: 'label' }>): void => {
    sourceName = item.span.sourceName;
    routineName = item.name;
    entryLabels = item.isEntry === true ? [item.name] : [];
    labels = [item.name];
    routineStartLine = item.span.line;
    routineStartColumn = item.span.column;
    instructions = [];
  };

  const flushRoutine = (): void => {
    if (routineName === undefined || routineStartLine === undefined) {
      return;
    }

    if (instructions.length === 0) {
      routines.push({
        name: routineName,
        labels: [...labels],
        entryLabels: [...entryLabels],
        instructions: [],
        span: {
          file: sourceName ?? '',
          start: { line: routineStartLine, column: routineStartColumn ?? 1 },
          end: { line: routineStartLine, column: routineStartColumn ?? 1 },
        },
      });
      return;
    }

    const end = instructions[instructions.length - 1];
    if (end === undefined) return;
    routines.push({
      name: routineName,
      labels: [...labels],
      entryLabels: [...entryLabels],
      instructions: [...instructions],
      span: {
        file: sourceName ?? '',
        start: { line: routineStartLine, column: routineStartColumn ?? 1 },
        end: { line: end.line, column: end.column },
      },
    });
  };

  const resetRoutine = (): void => {
    routineName = undefined;
    entryLabels = [];
    labels = [];
    sourceName = undefined;
    routineStartLine = undefined;
    routineStartColumn = undefined;
    instructions = [];
  };

  const finalizeAndRestart = (item: Extract<SourceItem, { kind: 'label' }>): void => {
    flushRoutine();
    resetRoutine();
    startRoutine(item);
  };

  for (const item of items) {
    if (item.kind !== 'label') {
      if (item.kind !== 'instruction') {
        continue;
      }
      if (routineName === undefined || sourceName === undefined) {
        continue;
      }
      if (item.span.sourceName !== sourceName) {
        continue;
      }
      instructions.push(toInstruction(item, labels));
      const directTarget = instructionCallTarget(item);
      if (directTarget !== undefined) {
        pushDirectBoundary(
          directCalls,
          directTarget,
          `CALL ${directTarget}`,
          item.span.sourceName,
          item.span.line,
          item.span.column,
        );
      }
      continue;
    }

    if (!isGlobalLabel(item.name)) {
      if (routineName !== undefined) {
        labels.push(item.name);
      }
      continue;
    }

    if (routineName === undefined) {
      if (filesWithEntryLabels.has(item.span.sourceName) && item.isEntry !== true) {
        continue;
      }
      startRoutine(item);
      continue;
    }

    if (sourceName === undefined || sourceName !== item.span.sourceName) {
      finalizeAndRestart(item);
      continue;
    }

    if (instructions.length > 0) {
      if (filesWithEntryLabels.has(item.span.sourceName) && item.isEntry !== true) {
        labels.push(item.name);
        continue;
      }
      finalizeAndRestart(item);
      continue;
    }

    // Multiple global labels before body on same routine are coalesced as entry labels.
    labels.push(item.name);
    if (item.isEntry === true) {
      entryLabels.push(item.name);
    }
  }

  flushRoutine();

  const entryNamesByFile = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.kind !== 'label' || item.isEntry !== true) continue;
    const names = entryNamesByFile.get(item.span.sourceName) ?? new Set<string>();
    names.add(item.name);
    entryNamesByFile.set(item.span.sourceName, names);
  }

  const directTailJumps: RegisterCareDirectCall[] = [];
  for (const item of items) {
    if (item.kind !== 'instruction') continue;
    const entryNames = filesWithEntryLabels.has(item.span.sourceName)
      ? entryNamesByFile.get(item.span.sourceName)
      : undefined;
    const target = instructionTailJumpTarget(item, entryNames);
    if (target === undefined) continue;
    pushDirectBoundary(
      directTailJumps,
      target,
      `JP ${target}`,
      item.span.sourceName,
      item.span.line,
      item.span.column,
    );
  }

  return {
    routines,
    directCalls,
    directBoundaries: [...directCalls, ...directTailJumps],
  };
}
