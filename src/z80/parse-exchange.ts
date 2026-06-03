import type { Z80Instruction } from './instruction.js';
import type { ParseZ80InstructionResult } from './parse-instruction.js';
import { splitInstructionOperands } from './operand-split.js';

type ExchangeForm = Extract<Z80Instruction, { readonly mnemonic: 'ex' }>['form'];

const EXCHANGE_FORMS: Readonly<Record<string, ExchangeForm>> = {
  "af|af'": 'af-af',
  "af'|af": 'af-af',
  'de|hl': 'de-hl',
  '(sp)|hl': 'sp-hl',
  '(sp)|ix': 'sp-ix',
  'ix|(sp)': 'sp-ix',
  '(sp)|iy': 'sp-iy',
  'iy|(sp)': 'sp-iy',
};

export function parseExchangeInstruction(text: string): ParseZ80InstructionResult | undefined {
  const exchange = /^EX\s+(.+)$/i.exec(text);
  if (!exchange) return undefined;

  const operandText = exchange[1] ?? '';
  const parts = splitInstructionOperands(operandText);
  if (parts.length !== 2) {
    return { error: 'ex expects two operands' };
  }
  const left = (parts[0] ?? '').toLowerCase();
  const right = (parts[1] ?? '').toLowerCase();
  const form = EXCHANGE_FORMS[`${left}|${right}`];
  if (form) {
    return { instruction: { mnemonic: 'ex', form } };
  }
  return {
    error: `ex supports "AF, AF'", "DE, HL", "(SP), HL", "(SP), IX", and "(SP), IY" only`,
  };
}
