import type { RegisterContractsInstruction } from './types.js';

export function instructionHead(item: RegisterContractsInstruction): string {
  return item.instruction.mnemonic.toLowerCase();
}
