import type { Z80Instruction } from '../../src/z80/instruction.js';

const validIndexedAdd: Z80Instruction = {
  mnemonic: 'add',
  target: { kind: 'reg-index16', register: 'ix' },
  source: { kind: 'reg16', register: 'bc' },
};

// ADC/SBC only support HL as the 16-bit target. Indexed targets must not be representable.
// @ts-expect-error ADC IX,BC is not a valid Z80Instruction shape.
const invalidIndexedAdc: Z80Instruction = {
  mnemonic: 'adc',
  target: { kind: 'reg-index16', register: 'ix' },
  source: { kind: 'reg16', register: 'bc' },
};

void validIndexedAdd;
void invalidIndexedAdc;
