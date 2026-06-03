import type { Z80Instruction, Z80RelativeCondition } from './instruction.js';

export type Z80InstructionCondition = Extract<
  Z80Instruction,
  { readonly condition: unknown }
>['condition'];

export function parseCondition(text: string): Z80InstructionCondition | undefined {
  const trimmed = text.trim();
  return /^(NZ|Z|NC|C|PO|PE|P|M)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80InstructionCondition)
    : undefined;
}

export function parseRelativeCondition(text: string): Z80RelativeCondition | undefined {
  const trimmed = text.trim().toLowerCase();
  return /^(nz|z|nc|c)$/.test(trimmed) ? (trimmed as Z80RelativeCondition) : undefined;
}
