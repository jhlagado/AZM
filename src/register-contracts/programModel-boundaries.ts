import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import type { RegisterContractsDirectCall } from './types.js';

function routineNameFromExpression(expression: Expression): string | undefined {
  return expression.kind === 'symbol' ? expression.name : undefined;
}

export function instructionCallTarget(item: SourceItem): string | undefined {
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
  if (!isTailJumpInstruction(item.instruction, entryNames)) return undefined;
  const target = routineNameFromExpression(item.instruction.expression);
  return isEligibleTailJumpTarget(target, entryNames) ? target : undefined;
}

function isTailJumpInstruction(
  instruction: Extract<SourceItem, { readonly kind: 'instruction' }>['instruction'],
  entryNames: ReadonlySet<string> | undefined,
): instruction is Extract<
  Extract<SourceItem, { readonly kind: 'instruction' }>['instruction'],
  { readonly mnemonic: 'jp' | 'jp-cc' }
> {
  return (
    instruction.mnemonic === 'jp' || (instruction.mnemonic === 'jp-cc' && entryNames !== undefined)
  );
}

function isEligibleTailJumpTarget(
  target: string | undefined,
  entryNames: ReadonlySet<string> | undefined,
): target is string {
  if (target === undefined || target.startsWith('.')) return false;
  return entryNames === undefined || entryNames.has(target);
}

export function pushDirectBoundary(
  boundaries: RegisterContractsDirectCall[],
  target: string,
  subject: string,
  file: string,
  line: number,
  column: number,
): void {
  boundaries.push({ target, subject, file, line, column });
}

export function collectFilesWithEntryLabels(items: readonly SourceItem[]): Set<string> {
  return new Set(
    items
      .filter((item): item is Extract<SourceItem, { kind: 'label' }> => item.kind === 'label')
      .filter((item) => item.isEntry === true)
      .map((item) => item.span.sourceName),
  );
}

function entryNamesByFile(items: readonly SourceItem[]): Map<string, Set<string>> {
  const namesByFile = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.kind !== 'label' || item.isEntry !== true) continue;
    const names = namesByFile.get(item.span.sourceName) ?? new Set<string>();
    names.add(item.name);
    namesByFile.set(item.span.sourceName, names);
  }
  return namesByFile;
}

export function collectDirectTailJumps(
  items: readonly SourceItem[],
  filesWithEntryLabels: ReadonlySet<string>,
): RegisterContractsDirectCall[] {
  const entriesByFile = entryNamesByFile(items);
  const directTailJumps: RegisterContractsDirectCall[] = [];

  for (const item of items) {
    if (item.kind !== 'instruction') continue;
    const entryNames = filesWithEntryLabels.has(item.span.sourceName)
      ? entriesByFile.get(item.span.sourceName)
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

  return directTailJumps;
}
