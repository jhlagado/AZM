import type {
  Z80AluMnemonic,
  Z80BitMnemonic,
  Z80Instruction,
  Z80IndexRegister16,
  Z80RotateShiftMnemonic,
} from './instruction.js';
import { splitInstructionOperands } from './operand-split.js';
import {
  aluImm8RangeError,
  halfIndexFamilyFromRegister,
  indexedBracketError,
  parseAluOperand,
  parseBitIndex,
  parseCbOperand,
  parseIncDecOperand,
  parseIndexHalfRegister,
  parseIndexRegister16,
  parseRegister16Operand,
  parseRegister8Operand,
  parseStackRegister,
} from './parse-operands.js';
import {
  parseCallInstruction,
  parseJumpInstruction,
  parseRelativeBranchInstruction,
} from './parse-branch.js';
import {
  parseNoOperandCoreInstruction,
  parseNopInstruction,
  parseRetInstruction,
} from './parse-basic.js';
import { parseExchangeInstruction } from './parse-exchange.js';
import {
  parseInputInstruction,
  parseInterruptModeInstruction,
  parseOutputInstruction,
  parseRstInstruction,
} from './parse-io-control.js';
import { parseLdInstruction } from './parse-ld.js';

export interface ParseZ80InstructionResult {
  readonly instruction?: Z80Instruction;
  readonly error?: string;
  readonly diagnostics?: readonly string[];
}

type InstructionParser = (text: string) => ParseZ80InstructionResult | undefined;

const INSTRUCTION_PARSERS: readonly InstructionParser[] = [
  parseNopInstruction,
  parseRetInstruction,
  parseNoOperandCoreInstruction,
  parseInputInstruction,
  parseOutputInstruction,
  parseInterruptModeInstruction,
  parseRstInstruction,
  parseExchangeInstruction,
  parseIncDecInstruction,
  parseStackInstruction,
  parseLdInstruction,
  parseBitLikeInstruction,
  parseRotateShiftInstruction,
  parseAccumulatorAluInstruction,
  parseUnaryAluInstruction,
  parseJumpInstruction,
  parseCallInstruction,
  parseRelativeBranchInstruction,
];

export function parseZ80Instruction(text: string): ParseZ80InstructionResult | undefined {
  for (const parser of INSTRUCTION_PARSERS) {
    const result = parser(text);
    if (result) return result;
  }
  return undefined;
}

function parseIncDecInstruction(text: string): ParseZ80InstructionResult | undefined {
  const incDec = /^(INC|DEC)(?:\s+(.*))?$/i.exec(text);
  if (incDec) {
    const mnemonic = (incDec[1] ?? '').toLowerCase() as 'inc' | 'dec';
    return parseIncDecOperands(mnemonic, incDec[2] ?? '');
  }
  return undefined;
}

function parseIncDecOperands(
  mnemonic: 'inc' | 'dec',
  operandText: string,
): ParseZ80InstructionResult {
  const parts = splitInstructionOperands(operandText);
  if (operandText.trim().length === 0 || parts.length !== 1) {
    return { error: `${mnemonic} expects one operand` };
  }
  const indexedBracket = indexedBracketError(parts[0] ?? '');
  if (indexedBracket) {
    return { error: indexedBracket };
  }
  const operand = parseIncDecOperand(parts[0] ?? '');
  return operand
    ? { instruction: { mnemonic, operand } }
    : { error: `${mnemonic} expects r8/rr/(hl) operand` };
}

function parseStackInstruction(text: string): ParseZ80InstructionResult | undefined {
  const stack = /^(PUSH|POP)(?:\s+(.*))?$/i.exec(text);
  if (stack) {
    const mnemonic = (stack[1] ?? '').toLowerCase() as 'push' | 'pop';
    const operandText = stack[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: `${mnemonic} expects one operand` };
    }
    const register = parseStackRegister(parts[0] ?? '');
    return register
      ? { instruction: { mnemonic, register } }
      : { error: `${mnemonic} supports BC/DE/HL/AF/IX/IY only` };
  }
  return undefined;
}

function parseBitLikeInstruction(text: string): ParseZ80InstructionResult | undefined {
  const bitLike = /^(BIT|RES|SET)(?:\s+(.*))?$/i.exec(text);
  if (bitLike) {
    const mnemonic = (bitLike[1] ?? '').toLowerCase() as Z80BitMnemonic;
    return parseBitLikeOperands(mnemonic, bitLike[2] ?? '');
  }
  return undefined;
}

function parseBitLikeOperands(
  mnemonic: Z80BitMnemonic,
  operandText: string,
): ParseZ80InstructionResult {
  const parts = splitInstructionOperands(operandText);
  const arityError = bitLikeArityError(mnemonic, operandText, parts.length);
  if (arityError) return { error: arityError };
  const bit = parseBitIndex(parts[0] ?? '');
  if (bit === undefined) {
    return { error: `${mnemonic} expects bit index 0..7` };
  }
  return parseBitLikeTarget(mnemonic, bit, parts);
}

function parseBitLikeTarget(
  mnemonic: Z80BitMnemonic,
  bit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
  parts: readonly string[],
): ParseZ80InstructionResult {
  const operand = parseCbOperand(parts[1] ?? '');
  if (!operand) {
    return { error: `${mnemonic} expects reg8 or (hl)` };
  }
  return parts.length === 2
    ? { instruction: { mnemonic, bit, operand } }
    : parseIndexedBitDestination(mnemonic, bit, operand, parts[2] ?? '');
}

function bitLikeArityError(
  mnemonic: Z80BitMnemonic,
  operandText: string,
  partCount: number,
): string | undefined {
  if (operandText.trim().length === 0 || partCount < 2) {
    return bitLikeOperandCountError(mnemonic);
  }
  if (mnemonic === 'bit' && partCount !== 2) {
    return 'bit expects two operands';
  }
  return mnemonic !== 'bit' && partCount > 3 ? bitLikeOperandCountError(mnemonic) : undefined;
}

function bitLikeOperandCountError(mnemonic: Z80BitMnemonic): string {
  return mnemonic === 'bit'
    ? 'bit expects two operands'
    : `${mnemonic} expects two operands, or three with indexed source + reg8 destination`;
}

function parseIndexedBitDestination(
  mnemonic: Z80BitMnemonic,
  bit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
  operand: NonNullable<ReturnType<typeof parseCbOperand>>,
  destinationText: string,
): ParseZ80InstructionResult {
  if (operand.kind !== 'indexed') {
    return { error: `${mnemonic} b,(ix/iy+disp),r requires an indexed memory source` };
  }
  const destination = parseRegister8Operand(destinationText);
  if (destination) {
    return { instruction: { mnemonic, bit, operand, destination } };
  }
  const destinationError = indexedDestinationError(mnemonic, destinationText, operand.register);
  return { error: destinationError ?? `${mnemonic} b,(ix/iy+disp),r expects reg8 destination` };
}

function parseRotateShiftInstruction(text: string): ParseZ80InstructionResult | undefined {
  const rotateShift = /^(RLC|RRC|RL|RR|SLA|SRA|SLL|SLS|SRL)(?:\s+(.*))?$/i.exec(text);
  if (rotateShift) {
    const mnemonic = (rotateShift[1] ?? '').toLowerCase() as Z80RotateShiftMnemonic;
    return parseRotateShiftOperands(mnemonic, rotateShift[2] ?? '');
  }
  return undefined;
}

function parseRotateShiftOperands(
  mnemonic: Z80RotateShiftMnemonic,
  operandText: string,
): ParseZ80InstructionResult {
  const parts = splitInstructionOperands(operandText);
  const arityError = rotateShiftArityError(mnemonic, operandText, parts.length);
  if (arityError) return { error: arityError };
  if (parts.length === 2) {
    return parseIndexedRotateShift(mnemonic, parts[0] ?? '', parts[1] ?? '');
  }
  const operand = parseCbOperand(parts[0] ?? '');
  return operand
    ? { instruction: { mnemonic, operand } }
    : { error: `${mnemonic} expects reg8 or (hl)` };
}

function rotateShiftArityError(
  mnemonic: Z80RotateShiftMnemonic,
  operandText: string,
  partCount: number,
): string | undefined {
  const message = `${mnemonic} expects one operand, or two with indexed source + reg8 destination`;
  return operandText.trim().length === 0 || partCount < 1 || partCount > 2 ? message : undefined;
}

function parseIndexedRotateShift(
  mnemonic: Z80RotateShiftMnemonic,
  operandText: string,
  destinationText: string,
): ParseZ80InstructionResult {
  const operand = parseCbOperand(operandText);
  if (operand?.kind !== 'indexed') {
    return { error: `${mnemonic} two-operand form requires (ix/iy+disp) source` };
  }
  const destination = parseRegister8Operand(destinationText);
  if (destination) {
    return { instruction: { mnemonic, operand, destination } };
  }
  const destinationError = indexedDestinationError(mnemonic, destinationText, operand.register);
  return { error: destinationError ?? `${mnemonic} (ix/iy+disp),r expects reg8 destination` };
}

function indexedDestinationError(
  mnemonic: Z80BitMnemonic | Z80RotateShiftMnemonic,
  destinationText: string,
  sourceIndex: Z80IndexRegister16,
): string | undefined {
  const halfDestination = parseIndexHalfRegister(destinationText);
  if (!halfDestination) {
    return undefined;
  }
  return halfIndexFamilyFromRegister(halfDestination) === sourceIndex
    ? `${mnemonic} indexed destination must use plain reg8 B/C/D/E/H/L/A`
    : `${mnemonic} indexed destination family must match source index base`;
}

function parseAccumulatorAluInstruction(text: string): ParseZ80InstructionResult | undefined {
  const accumulatorAlu = /^(ADD|ADC|SBC)(?:\s+(.*))?$/i.exec(text);
  if (accumulatorAlu) {
    const mnemonic = (accumulatorAlu[1] ?? '').toLowerCase() as Z80AluMnemonic;
    return parseAccumulatorAluOperands(mnemonic, accumulatorAlu[2] ?? '');
  }
  return undefined;
}

function parseAccumulatorAluOperands(
  mnemonic: Z80AluMnemonic,
  operandText: string,
): ParseZ80InstructionResult {
  const arityError = accumulatorAluArityError(mnemonic, operandText);
  if (arityError) return { error: arityError };
  const parts = splitInstructionOperands(operandText);
  if (parts.length !== 2) return { error: accumulatorAluOperandCountError(mnemonic) };
  return parseAccumulatorAluTarget(mnemonic, parts[0] ?? '', parts[1] ?? '');
}

function accumulatorAluArityError(
  mnemonic: Z80AluMnemonic,
  operandText: string,
): string | undefined {
  return operandText.trim().length === 0 ? accumulatorAluOperandCountError(mnemonic) : undefined;
}

function accumulatorAluOperandCountError(mnemonic: Z80AluMnemonic): string {
  return mnemonic === 'add'
    ? 'add expects two operands'
    : `${mnemonic} expects one operand, two with destination A, or HL,rr form`;
}

function parseAccumulatorAluTarget(
  mnemonic: Z80AluMnemonic,
  targetText: string,
  sourceText: string,
): ParseZ80InstructionResult {
  for (const parser of ACCUMULATOR_ALU_TARGET_PARSERS) {
    const result = parser(mnemonic, targetText, sourceText);
    if (result) return result;
  }
  return mnemonic === 'add'
    ? { error: 'add expects destination A, HL, IX, or IY' }
    : { error: `${mnemonic} expects destination A or HL` };
}

type AccumulatorAluTargetParser = (
  mnemonic: Z80AluMnemonic,
  targetText: string,
  sourceText: string,
) => ParseZ80InstructionResult | undefined;

const ACCUMULATOR_ALU_TARGET_PARSERS: readonly AccumulatorAluTargetParser[] = [
  parseAccumulatorRegisterAlu,
  parseHlRegisterAlu,
  parseIndexRegisterAdd,
];

function parseAccumulatorRegisterAlu(
  mnemonic: Z80AluMnemonic,
  targetText: string,
  sourceText: string,
): ParseZ80InstructionResult | undefined {
  const target = parseRegister8Operand(targetText);
  return target?.register === 'a' ? parseAccumulatorAluSource(mnemonic, sourceText) : undefined;
}

function parseHlRegisterAlu(
  mnemonic: Z80AluMnemonic,
  targetText: string,
  sourceText: string,
): ParseZ80InstructionResult | undefined {
  const target16 = parseRegister16Operand(targetText);
  if (target16?.register !== 'hl') return undefined;
  const source = parseRegister16Operand(sourceText);
  return source
    ? { instruction: { mnemonic: mnemonic as 'add' | 'adc' | 'sbc', target: target16, source } }
    : { error: `${mnemonic} HL, rr expects BC/DE/HL/SP` };
}

function parseIndexRegisterAdd(
  mnemonic: Z80AluMnemonic,
  targetText: string,
  sourceText: string,
): ParseZ80InstructionResult | undefined {
  const targetIndex16 = parseIndexRegister16(targetText);
  return mnemonic === 'add' && targetIndex16
    ? parseIndexedAdd(targetIndex16, sourceText)
    : undefined;
}

function parseAccumulatorAluSource(
  mnemonic: Z80AluMnemonic,
  sourceText: string,
): ParseZ80InstructionResult {
  const source = parseAluOperand(sourceText);
  if (!source) {
    return { error: `invalid ${mnemonic.toUpperCase()} operand: ${sourceText}` };
  }
  const imm8Error =
    source.kind === 'imm' ? aluImm8RangeError(source.expression, mnemonic) : undefined;
  return imm8Error ? { error: imm8Error } : { instruction: { mnemonic, source } };
}

function parseIndexedAdd(
  targetIndex16: Z80IndexRegister16,
  sourceText: string,
): ParseZ80InstructionResult {
  const target = { kind: 'reg-index16' as const, register: targetIndex16 };
  const source16 = parseRegister16Operand(sourceText);
  if (source16 && source16.register !== 'hl') {
    return { instruction: { mnemonic: 'add', target, source: source16 } };
  }
  const sourceIndex16 = parseIndexRegister16(sourceText);
  if (sourceIndex16 === targetIndex16) {
    return {
      instruction: {
        mnemonic: 'add',
        target,
        source: { kind: 'reg-index16', register: sourceIndex16 },
      },
    };
  }
  return {
    error: `add ${targetIndex16.toUpperCase()}, rr supports BC/DE/SP and same-index pair only`,
  };
}

function parseUnaryAluInstruction(text: string): ParseZ80InstructionResult | undefined {
  const alu = /^(SUB|AND|OR|XOR|CP)(?:\s+(.*))?$/i.exec(text);
  if (alu) {
    const mnemonic = (alu[1] ?? '').toLowerCase() as Z80AluMnemonic;
    return parseUnaryAluOperands(mnemonic, alu[2] ?? '');
  }
  return undefined;
}

function parseUnaryAluOperands(
  mnemonic: Z80AluMnemonic,
  operandText: string,
): ParseZ80InstructionResult {
  const parts = splitInstructionOperands(operandText);
  if (operandText.trim().length === 0 || (parts.length !== 1 && parts.length !== 2)) {
    return { error: `${mnemonic} expects one operand, or two with destination A` };
  }
  return parts.length === 2
    ? parseTwoOperandUnaryAlu(mnemonic, parts[0] ?? '', parts[1] ?? '')
    : parseAccumulatorAluSource(mnemonic, parts[0] ?? '');
}

function parseTwoOperandUnaryAlu(
  mnemonic: Z80AluMnemonic,
  targetText: string,
  sourceText: string,
): ParseZ80InstructionResult {
  const target = parseRegister8Operand(targetText);
  return target?.register === 'a'
    ? parseAccumulatorAluSource(mnemonic, sourceText)
    : { error: `${mnemonic} two-operand form requires destination A` };
}
