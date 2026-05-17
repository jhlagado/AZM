import { expandCarrierList } from './carriers.js';
import type {
  LocatedSmartComment,
  RegisterCareRoutine,
  RoutineContract,
  SmartComment,
} from './types.js';

const TAG_RE = /^;?\s*!\s*@([A-Za-z-]+)(?:\s+(.*))?$/;
const AZMDOC_TAG_RE = /(?:^|[\s([{])@([A-Za-z-]+)(?:\s+(.+))?$/;
const CARRIER_RE = /^\{([^}]+)\}(?:\s+(.+))?$/;

function parseCarrierPayload(
  rest: string | undefined,
): { carriers: string[]; name?: string } | undefined {
  if (!rest) return undefined;
  const match = CARRIER_RE.exec(rest.trim());
  if (match) {
    const carriers = match[1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const name = match[2]?.trim();
    return { carriers, ...(name ? { name } : {}) };
  }

  const tokens = rest.trim().split(/\s+/);
  const carriers: string[] = [];
  let consumed = 0;
  for (const token of tokens) {
    const cleaned = token.replace(/[.:;]+$/u, '');
    const parts = cleaned
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0 || !expandCarrierList(parts)) break;
    carriers.push(...parts);
    consumed += 1;
  }
  if (carriers.length === 0) return undefined;
  const name = tokens.slice(consumed).join(' ').trim();
  return { carriers, ...(name ? { name } : {}) };
}

export function parseSmartCommentLine(line: string): SmartComment | undefined {
  const trimmed = line.trim();
  const match = TAG_RE.exec(trimmed) ?? AZMDOC_TAG_RE.exec(trimmed);
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase();
  const rest = match[2]?.trim();

  if (tag === 'proc' || tag === 'routine') {
    return rest ? { kind: 'proc', name: rest } : undefined;
  }
  if (tag === 'extern') {
    return rest ? { kind: 'extern', name: rest } : undefined;
  }
  if (tag === 'end') {
    return { kind: 'end' };
  }

  const payload = parseCarrierPayload(rest);
  if (!payload) return undefined;
  const carriers = expandCarrierList(payload.carriers);
  if (!carriers || carriers.length === 0) return undefined;

  if (tag === 'in')
    return { kind: 'in', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'out')
    return { kind: 'out', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'clobbers') return { kind: 'clobbers', carriers };
  if (tag === 'preserves') return { kind: 'preserves', carriers };
  if (tag === 'expect-out') {
    return { kind: 'expectOut', carriers, ...(payload.name ? { name: payload.name } : {}) };
  }

  return undefined;
}

export function parseSmartComments(
  sourceLineComments: Map<string, Map<number, string>>,
): LocatedSmartComment[] {
  const out: LocatedSmartComment[] = [];
  for (const [file, comments] of sourceLineComments) {
    for (const [line, text] of comments) {
      const parsed = parseSmartCommentLine(`;${text}`);
      if (parsed) out.push({ file, line, comment: parsed });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function appendUnique<T>(out: T[], items: T[]): void {
  for (const item of items) {
    if (!out.includes(item)) out.push(item);
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

function isCommentOnlyLine(line: string): boolean {
  return /^\s*;/.test(line);
}

function collectPrecedingCommentBlock(
  routine: RegisterCareRoutine,
  sourceTexts: Map<string, string>,
): LocatedSmartComment[] {
  const source = sourceTexts.get(routine.span.file);
  if (!source) return [];
  const lines = source.split(/\r?\n/);
  const out: LocatedSmartComment[] = [];
  for (let index = routine.span.start.line - 2; index >= 0; index -= 1) {
    const raw = lines[index] ?? '';
    if (!isCommentOnlyLine(raw)) break;
    const parsed = parseSmartCommentLine(raw);
    if (parsed) {
      out.push({
        file: routine.span.file,
        line: index + 1,
        comment: parsed,
      });
    }
  }
  return out.reverse();
}

function buildImplicitRoutineContracts(
  routines: RegisterCareRoutine[],
  sourceTexts: Map<string, string>,
): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  for (const routine of routines) {
    const docBlock = collectPrecedingCommentBlock(routine, sourceTexts);
    if (
      docBlock.some(
        (item) =>
          item.comment.kind === 'proc' ||
          item.comment.kind === 'extern' ||
          item.comment.kind === 'end',
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
    };
    for (const item of docBlock) {
      applyContractComment(contract, item.comment);
    }
    if (hasContractContent(contract)) contracts.set(routine.name, contract);
  }
  return contracts;
}

export function buildRoutineContracts(
  comments: LocatedSmartComment[],
  routines: RegisterCareRoutine[] = [],
  sourceTexts: Map<string, string> = new Map(),
): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  let current: RoutineContract | undefined;

  for (const item of comments) {
    const comment = item.comment;
    if (comment.kind === 'proc' || comment.kind === 'extern') {
      current = { name: comment.name, in: [], out: [], clobbers: [], preserves: [] };
      contracts.set(comment.name, current);
      continue;
    }

    if (comment.kind === 'end') {
      current = undefined;
      continue;
    }

    if (!current) continue;
    applyContractComment(current, comment);
  }

  for (const [name, contract] of buildImplicitRoutineContracts(routines, sourceTexts)) {
    if (!contracts.has(name)) contracts.set(name, contract);
  }

  return contracts;
}
