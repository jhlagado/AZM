import { expandCarrierList } from './carriers.js';
import type {
  LocatedSmartComment,
  RegisterCareRoutine,
  RoutineContract,
  SmartComment,
} from './types.js';

const TAG_RE = /^;?\s*!\s*@([A-Za-z-]+)(?:\s+(.*))?$/;
const AZMDOC_TAG_RE = /(?:^|[\s([{])@([A-Za-z-]+)(?:\s+(.+))?$/;
const AZM_BLOCK_DIVIDER_RE = /^\s*;\s*=+\s+AZM\s*$/i;
const AZM_BLOCK_TAG_RE = /^;?\s*(in|out|clobbers|preserves)(?:\s+(.+))?$/i;
const AZMI_TAG_RE = /^\s*(in|out|clobbers|preserves)(?:\s+(.+))?$/i;
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
  const expectOut = /^;?\s*expects\s+out\s+(.+)$/i.exec(trimmed);
  if (expectOut) {
    const payload = parseCarrierPayload(expectOut[1]?.trim());
    if (!payload) return undefined;
    const carriers = expandCarrierList(payload.carriers);
    if (!carriers || carriers.length === 0) return undefined;
    return { kind: 'expectOut', carriers, ...(payload.name ? { name: payload.name } : {}) };
  }

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

function parseGeneratedBlockLine(line: string): SmartComment | undefined {
  const trimmed = line.trim();
  const match = AZM_BLOCK_TAG_RE.exec(trimmed);
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase();
  const payload = parseCarrierPayload(match[2]?.trim());
  if (!payload) return undefined;
  const carriers = expandCarrierList(payload.carriers);
  if (!carriers || carriers.length === 0) return undefined;

  if (tag === 'in')
    return { kind: 'in', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'out')
    return { kind: 'out', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'clobbers') return { kind: 'clobbers', carriers };
  if (tag === 'preserves') return { kind: 'preserves', carriers };
  return undefined;
}

function parseAzmiContractLine(line: string): SmartComment | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith(';')) return undefined;
  const extern = /^extern\s+(\S+)\s*$/i.exec(trimmed);
  if (extern) return { kind: 'extern', name: extern[1]! };
  if (/^end\s*$/i.test(trimmed)) return { kind: 'end' };

  const match = AZMI_TAG_RE.exec(trimmed);
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase();
  const rest = match[2]?.trim();
  if (!rest) return undefined;
  const rawCarriers = rest.split(',').map((part) => part.trim());
  if (rawCarriers.length === 0 || rawCarriers.some((part) => part.length === 0)) {
    return undefined;
  }
  const carriers = expandCarrierList(rawCarriers);
  if (!carriers || carriers.length === 0) return undefined;

  if (tag === 'in') return { kind: 'in', carriers };
  if (tag === 'out') return { kind: 'out', carriers };
  if (tag === 'clobbers') return { kind: 'clobbers', carriers };
  if (tag === 'preserves') return { kind: 'preserves', carriers };
  return undefined;
}

function isGeneratedBlockDivider(line: string): boolean {
  return AZM_BLOCK_DIVIDER_RE.test(line);
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
): { comments: LocatedSmartComment[]; complete: boolean } {
  const source = sourceTexts.get(routine.span.file);
  if (!source) return { comments: [], complete: false };
  const lines = source.split(/\r?\n/);
  const rawBlock: Array<{ line: number; text: string }> = [];
  for (let index = routine.span.start.line - 2; index >= 0; index -= 1) {
    const raw = lines[index] ?? '';
    if (!isCommentOnlyLine(raw)) break;
    rawBlock.push({ line: index + 1, text: raw });
  }
  rawBlock.reverse();

  const dividers: number[] = [];
  rawBlock.forEach((item, index) => {
    if (isGeneratedBlockDivider(item.text)) dividers.push(index);
  });
  if (dividers.length >= 2) {
    const start = dividers[dividers.length - 2]!;
    const end = dividers[dividers.length - 1]!;
    return {
      complete: true,
      comments: rawBlock.slice(start + 1, end).flatMap((item) => {
        const parsed = parseGeneratedBlockLine(item.text);
        return parsed ? [{ file: routine.span.file, line: item.line, comment: parsed }] : [];
      }),
    };
  }

  return {
    complete: false,
    comments: rawBlock.flatMap((item) => {
      const parsed = parseSmartCommentLine(item.text);
      return parsed ? [{ file: routine.span.file, line: item.line, comment: parsed }] : [];
    }),
  };
}

function buildImplicitRoutineContracts(
  routines: RegisterCareRoutine[],
  sourceTexts: Map<string, string>,
): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  for (const routine of routines) {
    const docBlock = collectPrecedingCommentBlock(routine, sourceTexts);
    if (
      docBlock.comments.some(
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
      ...(docBlock.complete ? { complete: true } : {}),
    };
    for (const item of docBlock.comments) {
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
      current = {
        name: comment.name,
        in: [],
        out: [],
        clobbers: [],
        preserves: [],
        complete: true,
      };
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

export function parseAzmiContracts(text: string, file = '<azmi>'): Map<string, RoutineContract> {
  const comments: LocatedSmartComment[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';')) return;
    const comment = parseAzmiContractLine(line);
    if (!comment) {
      throw new Error(`${file}:${index + 1}: invalid AZMI contract line "${trimmed}"`);
    }
    comments.push({ file, line: index + 1, comment });
  });
  return buildRoutineContracts(comments);
}
