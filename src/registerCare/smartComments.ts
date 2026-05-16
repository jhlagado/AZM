import { expandCarrierList } from './carriers.js';
import type { LocatedSmartComment, SmartComment } from './types.js';

const TAG_RE = /^;?\s*!\s*@([A-Za-z-]+)(?:\s+(.*))?$/;
const CARRIER_RE = /^\{([^}]+)\}(?:\s+(.+))?$/;

function parseCarrierPayload(rest: string | undefined): { carriers: string[]; name?: string } | undefined {
  if (!rest) return undefined;
  const match = CARRIER_RE.exec(rest.trim());
  if (!match) return undefined;
  const carriers = match[1]!
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const name = match[2]?.trim();
  return { carriers, ...(name ? { name } : {}) };
}

export function parseSmartCommentLine(line: string): SmartComment | undefined {
  const match = TAG_RE.exec(line.trim());
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase();
  const rest = match[2]?.trim();

  if (tag === 'proc') {
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

  if (tag === 'in') return { kind: 'in', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'out') return { kind: 'out', carriers, ...(payload.name ? { name: payload.name } : {}) };
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
