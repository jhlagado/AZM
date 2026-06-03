import type { Expression } from '../model/expression.js';
import type {
  Z80AluMnemonic,
  Z80Instruction,
  Z80Operand,
} from '../z80/instruction.js';
import {
  formatExpression,
  formatLoweredNumber,
  type LoweredEvalContext,
} from './asm80-expressions.js';
import {
  formatBitOp,
  formatIndexedMemory,
  formatLd,
  formatRotateShift,
} from './asm80-instruction-operands.js';

type IncDecInstruction = Extract<Z80Instruction, { readonly mnemonic: 'inc' | 'dec' }>;

const ZERO_OPERAND_MNEMONICS = new Set<string>([
  'nop',
  'ret',
  'di',
  'ei',
  'scf',
  'ccf',
  'cpl',
  'daa',
  'exx',
  'halt',
  'rlca',
  'rrca',
  'rla',
  'rra',
  'neg',
  'rrd',
  'rld',
  'ldi',
  'ldir',
  'ldd',
  'lddr',
  'cpi',
  'cpir',
  'cpd',
  'cpdr',
  'ini',
  'inir',
  'ind',
  'indr',
  'outi',
  'otir',
  'outd',
  'otdr',
  'reti',
  'retn',
]);
const BIT_MNEMONICS = new Set<Z80Instruction['mnemonic']>(['bit', 'res', 'set']);
const ROTATE_SHIFT_MNEMONICS = new Set<Z80Instruction['mnemonic']>([
  'rlc',
  'rrc',
  'rl',
  'rr',
  'sla',
  'sra',
  'sll',
  'sls',
  'srl',
]);
const TARGETED_ALU_MNEMONICS = new Set<Z80Instruction['mnemonic']>(['add', 'adc', 'sbc']);
const ACCUMULATOR_ALU_MNEMONICS = new Set<Z80Instruction['mnemonic']>([
  'add',
  'adc',
  'sbc',
  'sub',
  'and',
  'or',
  'xor',
  'cp',
]);

export function formatInstruction(
  instruction: Z80Instruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (ZERO_OPERAND_MNEMONICS.has(instruction.mnemonic)) {
    return { text: instruction.mnemonic };
  }
  return (
    formatLoadOrImmediateInstruction(instruction, evalContext) ??
    formatAluInstruction(instruction, evalContext) ??
    formatBitRotateInstruction(instruction, evalContext) ??
    formatIoInstruction(instruction, evalContext) ??
    formatSingleOperandInstruction(instruction, evalContext) ??
    formatBranchStackReturnInstruction(instruction, evalContext)
  );
}

function formatLoadOrImmediateInstruction(
  instruction: Z80Instruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  switch (instruction.mnemonic) {
    case 'ld-a-imm': {
      const expression = formatExpression(instruction.expression, evalContext, 'byte');
      if (expression === undefined) {
        return undefined;
      }
      return {
        text: `ld a, ${expression}`,
      };
    }
    case 'ld':
      return formatLd(instruction.target, instruction.source, evalContext);
    case 'im':
      return { text: `im ${formatLoweredNumber(instruction.mode, 'byte')}` };
    case 'rst':
      return { text: `rst ${formatLoweredNumber(instruction.vector, 'byte')}` };
    default:
      return undefined;
  }
}

function formatAluInstruction(
  instruction: Z80Instruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (isTargetedAluInstruction(instruction)) {
    return formatReg16Alu(instruction.mnemonic, instruction.target, instruction.source);
  }
  if (isAccumulatorAluInstruction(instruction)) {
    return formatAlu(instruction.mnemonic, instruction.source, evalContext);
  }
  return undefined;
}

function isTargetedAluInstruction(
  instruction: Z80Instruction,
): instruction is Extract<Z80Instruction, { readonly mnemonic: 'add' | 'adc' | 'sbc' }> & {
  readonly target: Extract<Z80Instruction, { readonly mnemonic: 'add' }>['target'];
} {
  return TARGETED_ALU_MNEMONICS.has(instruction.mnemonic) && 'target' in instruction;
}

function isAccumulatorAluInstruction(
  instruction: Z80Instruction,
): instruction is Extract<
  Z80Instruction,
  { readonly mnemonic: 'add' | 'adc' | 'sbc' | 'sub' | 'and' | 'or' | 'xor' | 'cp' }
> {
  return ACCUMULATOR_ALU_MNEMONICS.has(instruction.mnemonic) && 'source' in instruction;
}

function formatBitRotateInstruction(
  instruction: Z80Instruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (BIT_MNEMONICS.has(instruction.mnemonic)) {
    return formatBitOp(
      instruction as Extract<Z80Instruction, { readonly mnemonic: 'bit' | 'res' | 'set' }>,
      evalContext,
    );
  }
  if (ROTATE_SHIFT_MNEMONICS.has(instruction.mnemonic)) {
    return formatRotateShift(
      instruction as Extract<
        Z80Instruction,
        {
          readonly mnemonic:
            | 'rlc'
            | 'rrc'
            | 'rl'
            | 'rr'
            | 'sla'
            | 'sra'
            | 'sll'
            | 'sls'
            | 'srl';
        }
      >,
      evalContext,
    );
  }
  return undefined;
}

function formatIoInstruction(
  instruction: Z80Instruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  switch (instruction.mnemonic) {
    case 'in':
      return formatIn(instruction, evalContext);
    case 'out':
      return formatOut(instruction, evalContext);
    default:
      return undefined;
  }
}

function formatSingleOperandInstruction(
  instruction: Z80Instruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  switch (instruction.mnemonic) {
    case 'inc':
    case 'dec':
      return formatIncDec(instruction, evalContext);
    case 'ex':
      return formatEx(instruction.form);
    default:
      return undefined;
  }
}

function formatBranchStackReturnInstruction(
  instruction: Z80Instruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  return (
    formatBranchInstruction(instruction, evalContext) ??
    formatStackOrReturnInstruction(instruction)
  );
}

function formatBranchInstruction(
  instruction: Z80Instruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  switch (instruction.mnemonic) {
    case 'jp':
      return formatBranch('jp', instruction.expression, evalContext);
    case 'jp-cc':
      return formatBranch(`jp ${instruction.condition},`, instruction.expression, evalContext);
    case 'jp-indirect':
      return { text: `jp (${instruction.register})` };
    case 'jr':
      return formatBranch('jr', instruction.expression, evalContext);
    case 'jr-cc':
      return formatBranch(`jr ${instruction.condition},`, instruction.expression, evalContext);
    case 'call':
      return formatBranch('call', instruction.expression, evalContext);
    case 'call-cc':
      return formatBranch(`call ${instruction.condition},`, instruction.expression, evalContext);
    case 'djnz':
      return formatBranch('djnz', instruction.expression, evalContext);
    default:
      return undefined;
  }
}

function formatStackOrReturnInstruction(
  instruction: Z80Instruction,
): { readonly text: string } | undefined {
  switch (instruction.mnemonic) {
    case 'push':
    case 'pop':
      return { text: `${instruction.mnemonic} ${instruction.register}` };
    case 'ret-cc':
      return { text: `ret ${instruction.condition}` };
    default:
      return undefined;
  }
}

function formatAlu(
  mnemonic: Z80AluMnemonic,
  source: Z80Operand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  const operand = formatAluOperand(source, evalContext);
  if (operand === undefined) {
    return undefined;
  }
  if (mnemonic === 'add' || mnemonic === 'adc' || mnemonic === 'sbc') {
    return { text: `${mnemonic} a, ${operand}` };
  }
  if (mnemonic === 'xor' && source.kind === 'reg8' && source.register === 'a') {
    return { text: 'xor a' };
  }
  return { text: `${mnemonic} ${operand}` };
}

function formatAluOperand(source: Z80Operand, evalContext: LoweredEvalContext): string | undefined {
  if (source.kind === 'reg8' || source.kind === 'reg-half-index') {
    return source.register;
  }
  if (source.kind === 'reg-indirect' && source.register === 'hl') {
    return '(HL)';
  }
  if (source.kind === 'imm') {
    return formatExpression(source.expression, evalContext, 'byte');
  }
  return undefined;
}

function formatReg16Alu(
  mnemonic: 'add' | 'adc' | 'sbc',
  target: Extract<Z80Instruction, { readonly mnemonic: 'add' }>['target'],
  source: Extract<Z80Instruction, { readonly mnemonic: 'add' }>['source'],
): { readonly text: string } | undefined {
  const targetText = formatReg16PairOperand(target);
  const sourceText = formatReg16PairOperand(source);
  return targetText === undefined || sourceText === undefined
    ? undefined
    : { text: `${mnemonic} ${targetText}, ${sourceText}` };
}

function formatReg16PairOperand(
  operand: Extract<Z80Instruction, { readonly mnemonic: 'add' }>['target'],
): string | undefined {
  if (operand.kind === 'reg16') {
    return operand.register;
  }
  if (operand.kind === 'reg-index16') {
    return operand.register;
  }
  return undefined;
}

function formatEx(
  form: Extract<Z80Instruction, { readonly mnemonic: 'ex' }>['form'],
): { readonly text: string } | undefined {
  switch (form) {
    case 'af-af':
      return { text: "ex af, af'" };
    case 'de-hl':
      return { text: 'ex de, hl' };
    case 'sp-hl':
      return { text: 'ex (sp), hl' };
    case 'sp-ix':
      return { text: 'ex (SP), ix' };
    case 'sp-iy':
      return { text: 'ex (SP), iy' };
  }
}

function formatBranch(
  mnemonic: string,
  expression: Expression,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  const target = formatExpression(expression, evalContext, 'word');
  return target === undefined ? undefined : { text: `${mnemonic} ${target}` };
}

function formatIn(
  instruction: Extract<Z80Instruction, { readonly mnemonic: 'in' }>,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  const port = formatPort(instruction.port, evalContext);
  if (port === undefined) {
    return undefined;
  }
  const target = instruction.target?.register ?? 'a';
  return { text: `in ${target}, ${port}` };
}

function formatOut(
  instruction: Extract<Z80Instruction, { readonly mnemonic: 'out' }>,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  const port = formatPort(instruction.port, evalContext);
  if (port === undefined) {
    return undefined;
  }
  const source =
    instruction.source.kind === 'zero' ? '0' : instruction.source.register;
  return { text: `out ${port}, ${source}` };
}

function formatPort(
  port: Extract<Z80Instruction, { readonly mnemonic: 'in' }>['port'],
  evalContext: LoweredEvalContext,
): string | undefined {
  if (port.kind === 'c') {
    return '(c)';
  }
  const expression = formatExpression(port.expression, evalContext, 'byte');
  return expression === undefined ? undefined : `(${expression})`;
}

function formatIncDec(
  instruction: IncDecInstruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  const operand = instruction.operand;
  if (operand.kind === 'reg8' || operand.kind === 'reg16') {
    return { text: `${instruction.mnemonic} ${operand.register}` };
  }
  if (operand.kind === 'reg-indirect' && operand.register === 'hl') {
    return { text: `${instruction.mnemonic} (HL)` };
  }
  if (operand.kind === 'indexed') {
    const memory = formatIndexedMemory(operand.register, operand.displacement, evalContext);
    return memory === undefined ? undefined : { text: `${instruction.mnemonic} ${memory}` };
  }
  return undefined;
}
