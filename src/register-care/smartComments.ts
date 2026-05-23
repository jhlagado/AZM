import { expandCarrierList } from './carriers.js';
import type { LocatedSmartComment, RegisterCareRoutine, RoutineContract, SmartComment } from './types.js';

const COMPACT_SOURCE_TAG_RE = /^;?\s*!\s*(in|out|clobbers|preserves)(?:\s+(.+))?$/i;
const COMPACT_SOURCE_LINE_RE = /^\s*;\s*!\s*(?:in|out|maybe-out|clobbers|preserves)(?:\s|$)/i;
const INTERFACE_TAG_RE = /^\s*(in|out|clobbers|preserves)(?:\s+(.+))?$/i;
const CARRIER_RE = /^\{([^}]+)\}(?:\s+(.+))?$/;

function parseCarrierPayload(
  rest: string | undefined,
): { carriers: string[]; name?: string } | undefined {
  if (!rest) return undefined;

  const match = CARRIER_RE.exec(rest.trim());
  if (match) {
    const carriers = match[1]!.split(',').map((value) => value.trim()).filter(Boolean);
    const name = match[2]?.trim();
    return { carriers, ...(name ? { name } : {}) };
  }

  const tokens = rest.trim().split(/\s+/u);
  const carriers: string[] = [];
  let consumed = 0;
  for (const token of tokens) {
    const cleaned = token.replace(/[.:;]+$/u, '');
    const parts = cleaned
      .split(',')
      .map((value) => value.trim())
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
  const expectOut = /^;?\s*expects\s+out\s+(.+)$/i.exec(trimmed);
  if (expectOut !== null) {
    const payload = parseCarrierPayload(expectOut[1]?.trim());
    if (!payload) return undefined;
    const carriers = expandCarrierList(payload.carriers);
    if (!carriers || carriers.length === 0) return undefined;
    return { kind: 'expectOut', carriers, ...(payload.name ? { name: payload.name } : {}) };
  }

  const match = COMPACT_SOURCE_TAG_RE.exec(trimmed);
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase();
  const rest = match[2]?.trim();
  const payload = parseCarrierPayload(rest);
  if (!payload) return undefined;

  const carriers = expandCarrierList(payload.carriers);
  if (!carriers || carriers.length === 0) return undefined;
  if (tag === 'in') return { kind: 'in', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'out') return { kind: 'out', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'clobbers') return { kind: 'clobbers', carriers };
  if (tag === 'preserves') return { kind: 'preserves', carriers };
  return undefined;
}

function parseInterfaceContractLine(line: string): SmartComment | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith(';')) return undefined;
  const extern = /^extern\s+(\S+)\s*$/i.exec(trimmed);
  if (extern !== null) return { kind: 'extern', name: extern[1]! };
  if (/^end\s*$/i.test(trimmed)) return { kind: 'end' };

  const match = INTERFACE_TAG_RE.exec(trimmed);
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase();
  const rest = match[2]?.trim();
  if (!rest) return undefined;
  const rawCarriers = rest.split(',').map((part) => part.trim());
  if (rawCarriers.length === 0 || rawCarriers.some((part) => part.length === 0)) return undefined;
  const carriers = expandCarrierList(rawCarriers);
  if (!carriers || carriers.length === 0) return undefined;

  if (tag === 'in') return { kind: 'in', carriers };
  if (tag === 'out') return { kind: 'out', carriers };
  if (tag === 'clobbers') return { kind: 'clobbers', carriers };
  if (tag === 'preserves') return { kind: 'preserves', carriers };
  return undefined;
}

function isCompactSourceCommentLine(line: string): boolean {
  return COMPACT_SOURCE_LINE_RE.test(line);
}

export function parseSmartComments(
  sourceLineComments: ReadonlyMap<string, ReadonlyMap<number, string>>,
): LocatedSmartComment[] {
  const out: LocatedSmartComment[] = [];
  for (const [file, comments] of sourceLineComments) {
    for (const [line, text] of comments) {
      const parsed = parseSmartCommentLine(`;${text}`);
      if (parsed) {
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

function isCommentOnlyLine(line: string): boolean {
  return /^\s*;/.test(line);
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

function collectPrecedingCommentBlock(
  routine: RegisterCareRoutine,
  sourceTexts: ReadonlyMap<string, string>,
): { comments: LocatedSmartComment[]; complete: boolean } {
  const source = sourceTexts.get(routine.span.file);
  if (source === undefined) return { comments: [], complete: false };
  const lines = source.split(/\r?\n/);
  const rawBlock: Array<{ line: number; text: string }> = [];

  for (let index = routine.span.start.line - 2; index >= 0; index -= 1) {
    const text = lines[index] ?? '';
    if (!isCommentOnlyLine(text)) break;
    rawBlock.push({ line: index + 1, text });
  }

  rawBlock.reverse();
  let compactStart = rawBlock.length;
  while (
    compactStart > 0 &&
    isCompactSourceCommentLine(rawBlock[compactStart - 1]?.text ?? '')
  ) {
    compactStart -= 1;
  }

  return {
    complete: compactStart < rawBlock.length,
    comments: (compactStart < rawBlock.length ? rawBlock.slice(compactStart) : rawBlock).flatMap(
      (item) => {
        const parsed = parseSmartCommentLine(item.text);
        return parsed ? [{ file: routine.span.file, line: item.line, comment: parsed }] : [];
      },
    ),
  };
}

function buildImplicitRoutineContracts(
  routines: RegisterCareRoutine[],
  sourceTexts: ReadonlyMap<string, string>,
): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  for (const routine of routines) {
    const docBlock = collectPrecedingCommentBlock(routine, sourceTexts);
    if (docBlock.comments.some((item) => item.comment.kind === 'extern' || item.comment.kind === 'end')) {
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
  routines: RegisterCareRoutine[] = [],
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

export function parseInterfaceContracts(
  text: string,
  file = '<register-care-interface>',
): Map<string, RoutineContract> {
  const comments: LocatedSmartComment[] = [];
  const lines = text.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith(';')) {
      throw new Error(`${file}:${index + 1}: .asmi files do not permit comments`);
    }
    const comment = parseInterfaceContractLine(line);
    if (comment === undefined) {
      throw new Error(`${file}:${index + 1}: invalid register-care interface line \"${trimmed}\"`);
    }
    comments.push({ file, line: index + 1, comment });
  }
  const routines = buildRoutineContracts(comments);
  const out = new Map<string, RoutineContract>();
  for (const [name, contract] of routines) {
    if (hasContractContent(contract)) out.set(name, contract);
  }
  return out;
}
