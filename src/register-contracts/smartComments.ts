import type {
  LocatedSmartComment,
  RegisterContractsRoutine,
  RoutineContract,
  SmartComment,
} from './types.js';
import { collectPrecedingCommentBlock } from './smartCommentBlocks.js';
import { parseSmartCommentLine, parseSmartCommentLines } from './smartCommentParsing.js';

export { parseSmartCommentLine, parseSmartCommentLines };

export function parseSmartComments(
  sourceLineComments: ReadonlyMap<string, ReadonlyMap<number, string>>,
): LocatedSmartComment[] {
  const out: LocatedSmartComment[] = [];
  for (const [file, comments] of sourceLineComments) {
    for (const [line, text] of comments) {
      for (const parsed of parseSmartCommentLines(`;${text}`)) {
        out.push({ file, line, comment: parsed });
      }
    }
  }

  return out.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
}

function appendUnique<T>(items: T[], values: readonly T[]): void {
  for (const value of values) {
    if (!items.includes(value)) {
      items.push(value);
    }
  }
}

function applyContractComment(contract: RoutineContract, comment: SmartComment): void {
  if (comment.kind === 'in') appendUnique(contract.in, comment.carriers);
  if (comment.kind === 'out') appendUnique(contract.out, comment.carriers);
  if (comment.kind === 'clobbers') appendUnique(contract.clobbers, comment.carriers);
  if (comment.kind === 'preserves') appendUnique(contract.preserves, comment.carriers);
}

function hasContractContent(contract: RoutineContract): boolean {
  return (
    contract.in.length > 0 ||
    contract.out.length > 0 ||
    contract.clobbers.length > 0 ||
    contract.preserves.length > 0
  );
}

function buildImplicitRoutineContracts(
  routines: RegisterContractsRoutine[],
  sourceTexts: ReadonlyMap<string, string>,
): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  for (const routine of routines) {
    const docBlock = collectPrecedingCommentBlock(routine, sourceTexts);
    if (
      docBlock.comments.some(
        (item) => item.comment.kind === 'extern' || item.comment.kind === 'end',
      )
    ) {
      continue;
    }

    const contract: RoutineContract = {
      name: routine.name,
      in: [],
      out: [],
      clobbers: [],
      preserves: [],
      ...(docBlock.complete ? { complete: true } : {}),
    };
    for (const item of docBlock.comments) {
      applyContractComment(contract, item.comment);
    }
    if (hasContractContent(contract)) {
      contracts.set(routine.name, contract);
    }
  }

  return contracts;
}

export function buildRoutineContracts(
  comments: LocatedSmartComment[],
  routines: RegisterContractsRoutine[] = [],
  sourceTexts: ReadonlyMap<string, string> = new Map(),
): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  let current: RoutineContract | undefined;

  for (const item of comments) {
    if (item.comment.kind === 'extern') {
      current = {
        name: item.comment.name,
        in: [],
        out: [],
        clobbers: [],
        preserves: [],
      };
      contracts.set(item.comment.name, current);
      continue;
    }
    if (item.comment.kind === 'end') {
      current = undefined;
      continue;
    }
    if (current !== undefined) {
      applyContractComment(current, item.comment);
    }
  }

  for (const [name, contract] of buildImplicitRoutineContracts(routines, sourceTexts)) {
    if (!contracts.has(name)) {
      contracts.set(name, contract);
    }
  }

  return contracts;
}
