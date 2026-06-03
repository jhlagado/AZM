import type { Expression } from '../model/expression.js';
import { parseExpression } from '../syntax/parse-expression.js';

export type OpMatcher =
  | { readonly kind: 'reg8' }
  | { readonly kind: 'reg16' }
  | { readonly kind: 'imm8' }
  | { readonly kind: 'imm16' }
  | { readonly kind: 'cc' }
  | { readonly kind: 'idx16' }
  | { readonly kind: 'ea' }
  | { readonly kind: 'mem8' }
  | { readonly kind: 'mem16' }
  | { readonly kind: 'fixed'; readonly token: string };

export type OpOperand =
  | { readonly kind: 'reg8'; readonly register: string; readonly text: string }
  | { readonly kind: 'reg16'; readonly register: string; readonly text: string }
  | { readonly kind: 'reg-indirect'; readonly register: 'hl'; readonly text: string }
  | { readonly kind: 'mem-abs'; readonly expression: Expression; readonly text: string }
  | {
      readonly kind: 'indexed';
      readonly register: 'ix' | 'iy';
      readonly displacement: Expression;
      readonly text: string;
    }
  | { readonly kind: 'imm'; readonly expression: Expression; readonly text: string };

const MATCHERS: ReadonlyMap<string, OpMatcher> = new Map([
  ['reg8', { kind: 'reg8' }],
  ['reg16', { kind: 'reg16' }],
  ['imm8', { kind: 'imm8' }],
  ['imm16', { kind: 'imm16' }],
  ['cc', { kind: 'cc' }],
  ['idx16', { kind: 'idx16' }],
  ['ea', { kind: 'ea' }],
  ['mem8', { kind: 'mem8' }],
  ['mem16', { kind: 'mem16' }],
]);

export function parseOpMatcher(text: string): OpMatcher | undefined {
  const matcher = MATCHERS.get(text.toLowerCase());
  if (matcher) return matcher;
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(text)
    ? { kind: 'fixed', token: text.toUpperCase() }
    : undefined;
}

export function parseOpOperand(text: string): OpOperand | undefined {
  const trimmed = text.trim();
  if (/^(A|B|C|D|E|H|L)$/i.test(trimmed)) {
    return { kind: 'reg8', register: trimmed.toLowerCase(), text: trimmed.toUpperCase() };
  }
  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return { kind: 'reg16', register: trimmed.toLowerCase(), text: trimmed.toUpperCase() };
  }
  if (/^\(HL\)$/i.test(trimmed)) {
    return { kind: 'reg-indirect', register: 'hl', text: '(HL)' };
  }
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) return indexed;
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const expression = parseExpression(trimmed.slice(1, -1).trim());
    return expression ? { kind: 'mem-abs', expression, text: trimmed } : undefined;
  }
  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression, text: trimmed } : undefined;
}

function parseIndexedOperand(text: string): OpOperand | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return undefined;
  const inner = trimmed.slice(1, -1).trim();
  const match = /^(IX|IY)(?:\s*([+-])\s*(.+))?$/i.exec(inner);
  if (!match) return undefined;
  const displacementText = match[3] ?? '0';
  const displacement = parseExpression(
    match[2] === '-' ? `-${displacementText}` : displacementText,
  );
  return displacement
    ? {
        kind: 'indexed',
        register: (match[1] ?? '').toLowerCase() as 'ix' | 'iy',
        displacement,
        text: trimmed,
      }
    : undefined;
}

export function isConditionToken(text: string): boolean {
  return /^(NZ|Z|NC|C|PO|PE|P|M)$/i.test(text);
}

export function formatOpOperand(operand: OpOperand): string {
  return operand.kind === 'imm' ? operand.text : operand.text.toUpperCase();
}
