import { createOperandSplitState, scanInstructionOperandSeparator } from './operand-split-state.js';

export function splitInstructionOperands(text: string): string[] {
  const values: string[] = [];
  const state = createOperandSplitState();
  for (let index = 0; index < text.length; index += 1) {
    if (scanInstructionOperandSeparator(text, index, state)) {
      values.push(text.slice(state.start, index));
      state.start = index + 1;
    }
  }
  values.push(text.slice(state.start));
  return values.map((value) => value.trim());
}
