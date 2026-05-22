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

function toInstruction(item: SourceItem, labels: readonly string[]): RegisterCareInstruction {
  return {
    instruction: item.instruction,
    file: item.span.sourceName,
    line: item.span.line,
    column: item.span.column,
    labels: [...labels],
  };
}

export function buildRegisterCareProgramModel(items: readonly SourceItem[]): RegisterCareProgramModel {
  const routines: RegisterCareRoutine[] = [];
  const directCalls: RegisterCareDirectCall[] = [];

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
    entryLabels = [item.name];
    labels = [item.name];
    routineStartLine = item.span.line;
    routineStartColumn = item.span.column;
    instructions = [];
  };

  const flushRoutine = (): void => {
    if (routineName === undefined || instructions.length === 0 || routineStartLine === undefined) {
      return;
    }

    const end = instructions[instructions.length - 1];
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
        directCalls.push({
          target: directTarget,
          file: item.span.sourceName,
          line: item.span.line,
          column: item.span.column,
        });
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
      startRoutine(item);
      continue;
    }

    if (
      instructions.length > 0 ||
      sourceName === undefined ||
      sourceName !== item.span.sourceName
    ) {
      finalizeAndRestart(item);
      continue;
    }

    // Multiple global labels before body on same routine are coalesced as entry labels.
    labels.push(item.name);
    entryLabels.push(item.name);
  }

  flushRoutine();
  return { routines, directCalls };
}
