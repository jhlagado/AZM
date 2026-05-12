import type { OpDeclNode } from '../frontend/ast.js';

export type OpStackSummary =
  | { kind: 'known'; delta: number; hasUntrackedSpMutation: boolean }
  | { kind: 'complex' };

type OpStackAnalysisContext = {
  /** Resolves op declarations by name in `file`; `undefined` means no candidates (not an error by itself). */
  resolveOpCandidates: (name: string, file: string) => OpDeclNode[] | undefined;
};

export function createOpStackAnalysisHelpers({ resolveOpCandidates }: OpStackAnalysisContext) {
  const opStackSummaryCache = new Map<OpDeclNode, OpStackSummary>();

  const opStackSummaryKey = (decl: OpDeclNode): string =>
    `${decl.name.toLowerCase()}@${decl.span.file}:${decl.span.start.line}`;

  const summarizeOpStackEffect = (
    decl: OpDeclNode,
    visiting: Set<string> = new Set(),
  ): OpStackSummary => {
    const cached = opStackSummaryCache.get(decl);
    if (cached) return cached;
    const key = opStackSummaryKey(decl);
    if (visiting.has(key)) return { kind: 'complex' };
    visiting.add(key);
    let delta = 0;
    let hasUntrackedSpMutation = false;
    let complex = false;
    for (const item of decl.body.items) {
      if (item.kind === 'AsmLabel') continue;
      if (item.kind !== 'AsmInstruction') {
        complex = true;
        break;
      }
      const head = item.head.toLowerCase();
      const operands = item.operands;
      if (head === 'push' && operands.length === 1) {
        delta -= 2;
        continue;
      }
      if (head === 'pop' && operands.length === 1) {
        delta += 2;
        continue;
      }
      if (
        head === 'inc' &&
        operands.length === 1 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        delta += 1;
        continue;
      }
      if (
        head === 'dec' &&
        operands.length === 1 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        delta -= 1;
        continue;
      }
      if (
        head === 'ld' &&
        operands.length === 2 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        hasUntrackedSpMutation = true;
        continue;
      }
      if (
        head === 'ret' ||
        head === 'retn' ||
        head === 'reti' ||
        head === 'jp' ||
        head === 'jr' ||
        head === 'djnz'
      ) {
        complex = true;
        break;
      }
      const nestedCandidates = resolveOpCandidates(head, decl.span.file);
      if (nestedCandidates && nestedCandidates.length > 0) {
        if (nestedCandidates.length !== 1) {
          complex = true;
          break;
        }
        const nested = summarizeOpStackEffect(nestedCandidates[0]!, visiting);
        if (nested.kind !== 'known') {
          complex = true;
          break;
        }
        delta += nested.delta;
        hasUntrackedSpMutation = hasUntrackedSpMutation || nested.hasUntrackedSpMutation;
      }
    }
    visiting.delete(key);
    const out: OpStackSummary = complex
      ? { kind: 'complex' }
      : { kind: 'known', delta, hasUntrackedSpMutation };
    opStackSummaryCache.set(decl, out);
    return out;
  };

  return {
    summarizeOpStackEffect,
  };
}
