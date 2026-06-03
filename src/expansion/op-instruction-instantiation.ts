import type { Expression } from '../model/expression.js';
import type {
  Z80AluMnemonic,
  Z80Instruction,
  Z80Operand,
  Z80Register16,
  Z80Register8,
} from '../z80/instruction.js';
import { parseLogicalLine } from '../syntax/parse-line.js';
import type { OpOperand } from './op-expansion.js';

export function instantiateTemplateInstruction(
  mnemonic: string,
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  return (
    instantiateLoadInstruction(mnemonic, concrete) ??
    instantiatePortInstruction(mnemonic, concrete) ??
    instantiateIncDecInstruction(mnemonic, concrete) ??
    instantiateBranchInstruction(mnemonic, concrete) ??
    instantiateAluInstruction(mnemonic, concrete) ??
    parseExpandedInstruction(mnemonic, concrete)
  );
}

function instantiateLoadInstruction(
  mnemonic: string,
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  if (mnemonic !== 'ld' || concrete.length !== 2) return undefined;
  const target = toZ80Operand(concrete[0]!);
  const source = toZ80Operand(concrete[1]!);
  return target && source ? { mnemonic: 'ld', target, source } : undefined;
}

function instantiatePortInstruction(
  mnemonic: string,
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  if (mnemonic === 'in') return instantiateInInstruction(concrete);
  if (mnemonic === 'out') return instantiateOutInstruction(concrete);
  return undefined;
}

function instantiateInInstruction(concrete: readonly OpOperand[]): Z80Instruction | undefined {
  if (concrete.length !== 2 || concrete[0]?.kind !== 'reg8') return undefined;
  const port = toPortOperand(concrete[1]!);
  return port
    ? {
        mnemonic: 'in',
        target: { kind: 'reg8', register: concrete[0].register as Z80Register8 },
        port,
      }
    : undefined;
}

function instantiateOutInstruction(concrete: readonly OpOperand[]): Z80Instruction | undefined {
  if (concrete.length !== 2) return undefined;
  const port = toPortOperand(concrete[0]!);
  const source = concrete[1]?.kind === 'reg8' ? concrete[1] : undefined;
  return port && source
    ? {
        mnemonic: 'out',
        port,
        source: { kind: 'reg8', register: source.register as Z80Register8 },
      }
    : undefined;
}

function instantiateIncDecInstruction(
  mnemonic: string,
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  if ((mnemonic !== 'inc' && mnemonic !== 'dec') || concrete.length !== 1) return undefined;
  const operand = toIncDecOperand(concrete[0]!);
  return operand ? { mnemonic, operand } : undefined;
}

function instantiateBranchInstruction(
  mnemonic: string,
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  if (mnemonic === 'jp') return instantiateJpInstruction(concrete);
  if (mnemonic === 'jr') return instantiateJrInstruction(concrete);
  return undefined;
}

function instantiateJpInstruction(concrete: readonly OpOperand[]): Z80Instruction | undefined {
  if (isSingleImmediate(concrete)) {
    return { mnemonic: 'jp', expression: concrete[0].expression };
  }
  if (isConditionalImmediate(concrete, isConditionToken)) {
    return {
      mnemonic: 'jp-cc',
      condition: concrete[0]!.text.toLowerCase() as Extract<
        Z80Instruction,
        { readonly mnemonic: 'jp-cc' }
      >['condition'],
      expression: concrete[1].expression,
    };
  }
  return undefined;
}

function instantiateJrInstruction(concrete: readonly OpOperand[]): Z80Instruction | undefined {
  if (isSingleImmediate(concrete)) {
    return { mnemonic: 'jr', expression: concrete[0].expression };
  }
  if (isConditionalImmediate(concrete, isRelativeConditionToken)) {
    return {
      mnemonic: 'jr-cc',
      condition: concrete[0]!.text.toLowerCase() as Extract<
        Z80Instruction,
        { readonly mnemonic: 'jr-cc' }
      >['condition'],
      expression: concrete[1].expression,
    };
  }
  return undefined;
}

function isSingleImmediate(
  concrete: readonly OpOperand[],
): concrete is readonly [Extract<OpOperand, { readonly kind: 'imm' }>] {
  return concrete.length === 1 && concrete[0]?.kind === 'imm';
}

function isConditionalImmediate(
  concrete: readonly OpOperand[],
  isCondition: (text: string) => boolean,
): concrete is readonly [OpOperand, Extract<OpOperand, { readonly kind: 'imm' }>] {
  return (
    concrete.length === 2 &&
    isCondition(concrete[0]?.text ?? '') &&
    concrete[1]?.kind === 'imm'
  );
}

function instantiateAluInstruction(
  mnemonic: string,
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  if (!isAluMnemonic(mnemonic)) return undefined;
  if (isRegisterPairAluShape(mnemonic, concrete)) {
    return instantiateRegisterPairAluInstruction(mnemonic, concrete);
  }
  return instantiateAccumulatorAluInstruction(mnemonic, concrete);
}

function isRegisterPairAluShape(
  mnemonic: Z80AluMnemonic,
  concrete: readonly OpOperand[],
): mnemonic is 'add' | 'adc' | 'sbc' {
  return (
    (mnemonic === 'add' || mnemonic === 'adc' || mnemonic === 'sbc') &&
    concrete.length === 2 &&
    concrete[0]?.kind === 'reg16' &&
    concrete[1]?.kind === 'reg16'
  );
}

function instantiateRegisterPairAluInstruction(
  mnemonic: 'add' | 'adc' | 'sbc',
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  const target = toZ80Operand(concrete[0]!);
  const source = toZ80Operand(concrete[1]!);
  return target?.kind === 'reg16' && source?.kind === 'reg16'
    ? { mnemonic, target, source }
    : undefined;
}

function instantiateAccumulatorAluInstruction(
  mnemonic: Z80AluMnemonic,
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  if (concrete.length === 1) {
    const source = toZ80Operand(concrete[0]!);
    return source ? { mnemonic, source } : undefined;
  }
  if (!isExplicitAccumulatorAluShape(concrete)) return undefined;
  const source = toZ80Operand(concrete[1]!);
  return source ? { mnemonic, source } : undefined;
}

function isExplicitAccumulatorAluShape(concrete: readonly OpOperand[]): boolean {
  return concrete.length === 2 && concrete[0]?.kind === 'reg8' && concrete[0].register === 'a';
}

function toZ80Operand(operand: OpOperand): Z80Operand | undefined {
  switch (operand.kind) {
    case 'reg8':
      return { kind: 'reg8', register: operand.register as Z80Register8 };
    case 'reg16':
      return { kind: 'reg16', register: operand.register as Z80Register16 };
    case 'reg-indirect':
      return { kind: 'reg-indirect', register: operand.register };
    case 'mem-abs':
      return { kind: 'mem-abs', expression: operand.expression };
    case 'indexed':
      return {
        kind: 'indexed',
        register: operand.register,
        displacement: operand.displacement,
      };
    case 'imm':
      return { kind: 'imm', expression: operand.expression };
  }
}

function toPortOperand(
  operand: OpOperand,
): { readonly kind: 'c' } | { readonly kind: 'imm'; readonly expression: Expression } | undefined {
  if (operand.kind === 'reg8' && operand.register === 'c') {
    return { kind: 'c' };
  }
  return operand.kind === 'imm' ? { kind: 'imm', expression: operand.expression } : undefined;
}

function toIncDecOperand(
  operand: OpOperand,
): Extract<Z80Instruction, { readonly mnemonic: 'inc' | 'dec' }>['operand'] | undefined {
  switch (operand.kind) {
    case 'reg8':
      return { kind: 'reg8', register: operand.register as Z80Register8 };
    case 'reg16':
      return { kind: 'reg16', register: operand.register as Z80Register16 };
    case 'reg-indirect':
      return { kind: 'reg-indirect', register: operand.register };
    case 'indexed':
      return {
        kind: 'indexed',
        register: operand.register,
        displacement: operand.displacement,
      };
    case 'imm':
      return undefined;
  }
}

function isAluMnemonic(mnemonic: string): mnemonic is Z80AluMnemonic {
  return /^(add|adc|sub|sbc|and|or|xor|cp)$/.test(mnemonic);
}

function isConditionToken(text: string): boolean {
  return /^(NZ|Z|NC|C|PO|PE|P|M)$/i.test(text);
}

function isRelativeConditionToken(text: string): boolean {
  return /^(NZ|Z|NC|C)$/i.test(text);
}

function parseExpandedInstruction(
  mnemonic: string,
  operands: readonly OpOperand[],
): Z80Instruction | undefined {
  const text = `${mnemonic} ${operands.map(formatOpOperand).join(', ')}`.trim();
  const result = parseLogicalLine({ sourceName: '<op-expansion>', line: 1, text });
  if (result.diagnostics.length > 0 || result.items.length !== 1) {
    return undefined;
  }
  const item = result.items[0];
  return item?.kind === 'instruction' ? item.instruction : undefined;
}

function formatOpOperand(operand: OpOperand): string {
  return operand.kind === 'imm' ? operand.text : operand.text.toUpperCase();
}
