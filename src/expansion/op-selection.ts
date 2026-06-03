import type { OpDecl } from './op-expansion.js';
import {
  expressionFitsKnownImm16,
  expressionFitsKnownImm8,
} from './op-constant-expression.js';
import {
  formatOpOperand,
  isConditionToken,
  type OpMatcher,
  type OpOperand,
} from './op-operands.js';

type Specificity = 'x' | 'y' | 'equal' | 'incomparable';
type MatcherPredicate = (operand: OpOperand) => boolean;
type MatcherExpectation = Exclude<OpMatcher['kind'], 'fixed'>;
type SpecificityVotes = {
  readonly x: number;
  readonly y: number;
};

const MATCHER_OPERAND_PREDICATES: Partial<Record<OpMatcher['kind'], MatcherPredicate>> = {
  reg8: (operand) => operand.kind === 'reg8',
  reg16: (operand) => operand.kind === 'reg16',
  imm8: (operand) => operand.kind === 'imm' && expressionFitsKnownImm8(operand.expression),
  imm16: (operand) => operand.kind === 'imm' && expressionFitsKnownImm16(operand.expression),
  cc: (operand) => isConditionToken(operand.text),
  idx16: (operand) => operand.kind === 'indexed',
  ea: (operand) => operand.kind === 'imm',
  mem8: (operand) => isMemoryOperand(operand),
  mem16: (operand) => isMemoryOperand(operand),
};
const MATCHER_EXPECTATIONS: Record<MatcherExpectation, string> = {
  reg8: 'reg8',
  reg16: 'reg16',
  imm8: 'imm8',
  imm16: 'imm16',
  cc: 'condition token NZ/Z/NC/C/PO/PE/P/M',
  idx16: 'IX/IY indexed memory operand',
  ea: 'ea',
  mem8: 'mem8 dereference',
  mem16: 'mem16 dereference',
};

export type OpSelection =
  | { readonly kind: 'selected'; readonly overload: OpDecl }
  | { readonly kind: 'arity_mismatch' }
  | { readonly kind: 'no_match'; readonly candidates: readonly OpDecl[] }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly OpDecl[] };

export function selectOpOverload(
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): OpSelection {
  const arityMatches = overloads.filter((overload) => overload.params.length === operands.length);
  if (arityMatches.length === 0) {
    return { kind: 'arity_mismatch' };
  }
  const matches = arityMatches.filter((overload) =>
    overload.params.every((param, index) => matcherMatchesOperand(param.matcher, operands[index]!)),
  );
  if (matches.length === 0) {
    return { kind: 'no_match', candidates: arityMatches };
  }
  if (matches.length === 1) {
    return { kind: 'selected', overload: matches[0]! };
  }
  const selected = mostSpecificOverload(matches, operands);
  return selected
    ? { kind: 'selected', overload: selected }
    : { kind: 'ambiguous', candidates: matches };
}

function mostSpecificOverload(
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): OpDecl | undefined {
  for (const candidate of overloads) {
    let beatsAll = true;
    for (const other of overloads) {
      if (candidate === other) continue;
      if (compareOverloadSpecificity(candidate, other, operands) !== 'x') {
        beatsAll = false;
        break;
      }
    }
    if (beatsAll) return candidate;
  }
  return undefined;
}

function compareOverloadSpecificity(
  x: OpDecl,
  y: OpDecl,
  operands: readonly OpOperand[],
): Specificity {
  const votes = operands.reduce<SpecificityVotes>((current, operand, index) => {
    return addSpecificityVote(
      current,
      compareMatcherSpecificity(x.params[index]!.matcher, y.params[index]!.matcher, operand),
    );
  }, { x: 0, y: 0 });
  return specificityFromVotes(votes);
}

function addSpecificityVote(
  votes: SpecificityVotes,
  comparison: 'x' | 'y' | 'equal',
): SpecificityVotes {
  if (comparison === 'x') return { ...votes, x: votes.x + 1 };
  if (comparison === 'y') return { ...votes, y: votes.y + 1 };
  return votes;
}

function specificityFromVotes(votes: SpecificityVotes): Specificity {
  if (votes.x > 0 && votes.y === 0) return 'x';
  if (votes.y > 0 && votes.x === 0) return 'y';
  if (votes.x === 0 && votes.y === 0) return 'equal';
  return 'incomparable';
}

function compareMatcherSpecificity(
  x: OpMatcher,
  y: OpMatcher,
  operand: OpOperand,
): 'x' | 'y' | 'equal' {
  if (x.kind === y.kind) return 'equal';
  return (
    compareFixedMatcherSpecificity(x, y, operand) ??
    compareImmediateMatcherSpecificity(x, y, operand) ??
    'equal'
  );
}

function compareFixedMatcherSpecificity(
  x: OpMatcher,
  y: OpMatcher,
  operand: OpOperand,
): 'x' | 'y' | undefined {
  if (x.kind === 'fixed' && fixedTokenBeatsMatcher(x, y, operand)) return 'x';
  if (y.kind === 'fixed' && fixedTokenBeatsMatcher(y, x, operand)) return 'y';
  return undefined;
}

function compareImmediateMatcherSpecificity(
  x: OpMatcher,
  y: OpMatcher,
  operand: OpOperand,
): 'x' | 'y' | undefined {
  if (operand.kind !== 'imm' || !expressionFitsKnownImm8(operand.expression)) return undefined;
  if (x.kind === 'imm8' && y.kind === 'imm16') return 'x';
  if (x.kind === 'imm16' && y.kind === 'imm8') return 'y';
  return undefined;
}

function fixedTokenBeatsMatcher(
  fixed: Extract<OpMatcher, { readonly kind: 'fixed' }>,
  other: OpMatcher,
  operand: OpOperand,
): boolean {
  return (
    (other.kind === 'reg8' && operand.kind === 'reg8' && operand.text === fixed.token) ||
    (other.kind === 'reg16' && operand.kind === 'reg16' && operand.text === fixed.token) ||
    (other.kind === 'cc' &&
      isConditionToken(fixed.token) &&
      operand.text.toUpperCase() === fixed.token)
  );
}

function matcherMatchesOperand(matcher: OpMatcher, operand: OpOperand): boolean {
  if (matcher.kind === 'fixed') return operand.text.toUpperCase() === matcher.token;
  return MATCHER_OPERAND_PREDICATES[matcher.kind]?.(operand) ?? false;
}

function isMemoryOperand(operand: OpOperand): boolean {
  return operand.kind === 'reg-indirect' || operand.kind === 'mem-abs' || operand.kind === 'indexed';
}

export function formatOpSelectionDiagnostic(
  selection: Exclude<OpSelection, { readonly kind: 'selected' }>,
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): string {
  const name = overloads[0]?.name ?? '<unknown>';
  const operandSummary = `call-site operands: (${operands.map(formatOpOperand).join(', ')})`;
  switch (selection.kind) {
    case 'arity_mismatch':
      return [
        `No op overload of "${name}" accepts ${operands.length} operand(s).`,
        'available overloads:',
        ...overloads.map((overload) => `  - ${formatOpSignature(overload)}`),
      ].join('\n');
    case 'no_match':
      return noMatchDiagnostic(selection.candidates, operands, name, operandSummary);
    case 'ambiguous':
      return [
        `Ambiguous op overload for "${name}" (${selection.candidates.length} matches).`,
        operandSummary,
        'equally specific candidates:',
        ...selection.candidates.map(
          (candidate) => `  - ${formatOpSignatureWithLocation(candidate)}`,
        ),
      ].join('\n');
  }
}

function noMatchDiagnostic(
  candidates: readonly OpDecl[],
  operands: readonly OpOperand[],
  name: string,
  operandSummary: string,
): string {
  return [
    `No matching op overload for "${name}" with provided operands.`,
    operandSummary,
    'available overloads:',
    ...candidates.map((candidate) => {
      const mismatch = firstMismatchReason(candidate, operands);
      return `  - ${formatOpSignatureWithLocation(candidate)}${mismatch ? ` ; ${mismatch}` : ''}`;
    }),
  ].join('\n');
}

function firstMismatchReason(overload: OpDecl, operands: readonly OpOperand[]): string | undefined {
  for (let index = 0; index < overload.params.length; index += 1) {
    const param = overload.params[index]!;
    const operand = operands[index]!;
    if (!matcherMatchesOperand(param.matcher, operand)) {
      return `${param.name}: ${matcherMismatchReason(param.matcher, operand)}`;
    }
  }
  return undefined;
}

function matcherMismatchReason(matcher: OpMatcher, operand: OpOperand): string {
  const expected =
    matcher.kind === 'fixed' ? matcher.token : MATCHER_EXPECTATIONS[matcher.kind];
  return `expects ${expected}, got ${formatOpOperand(operand)}`;
}

function formatOpSignature(op: OpDecl): string {
  return `${op.name}(${op.params.map((param) => `${param.name} ${formatMatcher(param.matcher)}`).join(', ')})`;
}

function formatOpSignatureWithLocation(op: OpDecl): string {
  return `${formatOpSignature(op)} (${op.sourceName}:${op.line})`;
}

function formatMatcher(matcher: OpMatcher): string {
  return matcher.kind === 'fixed' ? matcher.token : matcher.kind;
}
