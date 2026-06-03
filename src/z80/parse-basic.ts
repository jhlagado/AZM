import type { Z80CoreMnemonic } from './instruction.js';
import { splitInstructionOperands } from './operand-split.js';
import { parseCondition } from './parse-conditions.js';
import type { ParseZ80InstructionResult } from './parse-instruction.js';

export function parseNopInstruction(text: string): ParseZ80InstructionResult | undefined {
  const nop = /^NOP(?:\s+(.*))?$/i.exec(text);
  if (nop) {
    return nop[1] === undefined
      ? { instruction: { mnemonic: 'nop' } }
      : { error: 'nop expects no operands' };
  }
  return undefined;
}

export function parseRetInstruction(text: string): ParseZ80InstructionResult | undefined {
  const ret = /^RET(?:\s+(.*))?$/i.exec(text);
  if (ret) {
    const operandText = ret[1] ?? '';
    if (operandText.trim().length === 0) {
      return { instruction: { mnemonic: 'ret' } };
    }
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 1) {
      return { error: 'ret expects no operands or one condition code' };
    }
    const condition = parseCondition(parts[0] ?? '');
    return condition
      ? { instruction: { mnemonic: 'ret-cc', condition } }
      : { error: 'ret cc expects a valid condition code' };
  }
  return undefined;
}

export function parseNoOperandCoreInstruction(text: string): ParseZ80InstructionResult | undefined {
  const noOperandCore =
    /^(DI|EI|SCF|CCF|CPL|DAA|EXX|HALT|RLCA|RRCA|RLA|RRA|NEG|RRD|RLD|LDI|LDIR|LDD|LDDR|CPI|CPIR|CPD|CPDR|INI|INIR|IND|INDR|OUTI|OTIR|OUTD|OTDR|RETI|RETN)(?:\s+(.*))?$/i.exec(
      text,
    );
  if (noOperandCore) {
    const mnemonic = (noOperandCore[1] ?? '').toLowerCase() as Z80CoreMnemonic;
    return noOperandCore[2] === undefined
      ? { instruction: { mnemonic } }
      : { error: `${mnemonic} expects no operands` };
  }
  return undefined;
}
