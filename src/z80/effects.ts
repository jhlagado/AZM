import type { InstructionEffect } from '../register-contracts/types.js';
import type { Z80Instruction, Z80StackRegister16 } from './instruction.js';
import {
  accumulatorRotateEffect,
  aluEffect,
  bitEffect,
  blockTransferEffect,
  callControl,
  controlEffect,
  exEffect,
  inEffect,
  incDecEffect,
  jumpControl,
  ldEffect,
  outEffect,
  popEffect,
  pushEffect,
  rotateShiftEffect,
  rstControl,
  stackControlEffect,
} from './effect-groups.js';
import {
  FLAG_WRITES,
  baseEffect,
  conditionFlagRead,
  concatUnique,
  expressionSymbol,
  reg16Units,
  unknownEffect,
} from './effect-units.js';

type EffectHandler = (instruction: Z80Instruction) => InstructionEffect;

const BASE_EFFECT_MNEMONICS = ['nop', 'halt', 'di', 'ei', 'im'] as const;
const STACK_RETURN_MNEMONICS = ['reti', 'retn'] as const;
const ALU_MNEMONICS = ['add', 'adc', 'sbc', 'sub', 'and', 'or', 'xor', 'cp'] as const;
const ROTATE_SHIFT_MNEMONICS = [
  'rlc',
  'rrc',
  'rl',
  'rr',
  'sla',
  'sra',
  'sll',
  'sls',
  'srl',
] as const;
const ACCUMULATOR_ROTATE_MNEMONICS = ['rlca', 'rrca', 'rla', 'rra'] as const;
const BIT_MNEMONICS = ['bit', 'res', 'set'] as const;
const BLOCK_TRANSFER_MNEMONICS = [
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
] as const;

const EFFECT_HANDLERS: Partial<Record<Z80Instruction['mnemonic'], EffectHandler>> = {
  'ld-a-imm': () => ({ ...baseEffect(), writes: ['A'] }),
  ld: (instruction) => ldEffect(instruction as Extract<Z80Instruction, { mnemonic: 'ld' }>),
  inc: (instruction) =>
    incDecEffect(instruction as Extract<Z80Instruction, { mnemonic: 'inc' | 'dec' }>),
  dec: (instruction) =>
    incDecEffect(instruction as Extract<Z80Instruction, { mnemonic: 'inc' | 'dec' }>),
  push: (instruction) =>
    pushEffect((instruction as { readonly register: Z80StackRegister16 }).register),
  pop: (instruction) =>
    popEffect((instruction as { readonly register: Z80StackRegister16 }).register),
  call: (instruction) =>
    stackControlEffect(
      callControl(expressionSymbol((instruction as Extract<Z80Instruction, { mnemonic: 'call' }>).expression), false),
    ),
  'call-cc': (instruction) => {
    const call = instruction as Extract<Z80Instruction, { mnemonic: 'call-cc' }>;
    return stackControlEffect(
      callControl(expressionSymbol(call.expression), true),
      conditionFlagRead(call.condition),
    );
  },
  rst: (instruction) =>
    stackControlEffect(rstControl((instruction as Extract<Z80Instruction, { mnemonic: 'rst' }>).vector)),
  ret: () => stackControlEffect({ kind: 'return', conditional: false }),
  'ret-cc': (instruction) =>
    stackControlEffect(
      { kind: 'return', conditional: true },
      conditionFlagRead((instruction as Extract<Z80Instruction, { mnemonic: 'ret-cc' }>).condition),
    ),
  jp: (instruction) =>
    controlEffect(
      jumpControl(expressionSymbol((instruction as Extract<Z80Instruction, { mnemonic: 'jp' }>).expression), false),
    ),
  'jp-cc': (instruction) => {
    const jump = instruction as Extract<Z80Instruction, { mnemonic: 'jp-cc' }>;
    return controlEffect(
      jumpControl(expressionSymbol(jump.expression), true),
      conditionFlagRead(jump.condition),
    );
  },
  'jp-indirect': (instruction) =>
    controlEffect(
      jumpControl(undefined, false),
      reg16Units((instruction as Extract<Z80Instruction, { mnemonic: 'jp-indirect' }>).register),
    ),
  jr: (instruction) =>
    controlEffect(jumpControl(expressionSymbol((instruction as Extract<Z80Instruction, { mnemonic: 'jr' }>).expression), false)),
  'jr-cc': (instruction) => {
    const jump = instruction as Extract<Z80Instruction, { mnemonic: 'jr-cc' }>;
    return controlEffect(
      jumpControl(expressionSymbol(jump.expression), true),
      conditionFlagRead(jump.condition),
    );
  },
  djnz: (instruction) => ({
    ...baseEffect(),
    reads: ['B'],
    writes: ['B'],
    control: jumpControl(expressionSymbol((instruction as Extract<Z80Instruction, { mnemonic: 'djnz' }>).expression), true),
  }),
  scf: () => ({ ...baseEffect(), writes: ['carry', 'halfCarry'] }),
  ccf: () => ({ ...baseEffect(), reads: ['carry'], writes: ['carry', 'halfCarry'] }),
  cpl: () => ({ ...baseEffect(), reads: ['A'], writes: ['A', 'halfCarry'] }),
  neg: () => ({ ...baseEffect(), reads: ['A'], writes: concatUnique(['A'], FLAG_WRITES) }),
  out: (instruction) => outEffect(instruction as Extract<Z80Instruction, { mnemonic: 'out' }>),
  in: (instruction) => inEffect(instruction as Extract<Z80Instruction, { mnemonic: 'in' }>),
  ex: (instruction) => exEffect(instruction as Extract<Z80Instruction, { mnemonic: 'ex' }>),
};

for (const mnemonic of BASE_EFFECT_MNEMONICS) {
  EFFECT_HANDLERS[mnemonic] = () => baseEffect();
}

for (const mnemonic of STACK_RETURN_MNEMONICS) {
  EFFECT_HANDLERS[mnemonic] = () => stackControlEffect({ kind: 'return', conditional: false });
}

for (const mnemonic of ALU_MNEMONICS) {
  EFFECT_HANDLERS[mnemonic] = (instruction) =>
    aluEffect(
      instruction as Extract<
        Z80Instruction,
        { mnemonic: 'sub' | 'and' | 'or' | 'xor' | 'cp' | 'add' | 'adc' | 'sbc' }
      >,
    );
}

for (const mnemonic of ROTATE_SHIFT_MNEMONICS) {
  EFFECT_HANDLERS[mnemonic] = (instruction) =>
    rotateShiftEffect(instruction as Extract<Z80Instruction, { mnemonic: typeof mnemonic }>);
}

for (const mnemonic of ACCUMULATOR_ROTATE_MNEMONICS) {
  EFFECT_HANDLERS[mnemonic] = () => accumulatorRotateEffect(mnemonic);
}

for (const mnemonic of BIT_MNEMONICS) {
  EFFECT_HANDLERS[mnemonic] = (instruction) =>
    bitEffect(instruction as Extract<Z80Instruction, { mnemonic: typeof mnemonic }>);
}

for (const mnemonic of BLOCK_TRANSFER_MNEMONICS) {
  EFFECT_HANDLERS[mnemonic] = () => blockTransferEffect();
}

export function getZ80InstructionEffect(instruction: Z80Instruction): InstructionEffect {
  return EFFECT_HANDLERS[instruction.mnemonic]?.(instruction) ?? unknownEffect();
}
