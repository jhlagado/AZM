import type {
  ControlEffect,
  InstructionEffect,
  RegisterContractsUnit,
} from '../register-contracts/types.js';
import type { Z80Instruction, Z80Operand, Z80StackRegister16 } from './instruction.js';
import {
  BIT_FLAG_WRITES,
  FLAG_WRITES,
  INC_DEC_FLAG_WRITES,
  ROTATE_SHIFT_FLAG_WRITES,
  STACK_POINTER_UNITS,
  baseEffect,
  concatUnique,
  operandReads,
  operandWrites,
  reg16Units,
  reg8Units,
  regHalfUnits,
  unknownEffect,
} from './effect-units.js';

export function callControl(target: string | undefined, conditional: boolean): ControlEffect {
  return target === undefined
    ? { kind: 'call', conditional }
    : { kind: 'call', target, conditional };
}

export function rstControl(vector: number | undefined): ControlEffect {
  return vector === undefined ? { kind: 'rst' } : { kind: 'rst', vector };
}

export function jumpControl(target: string | undefined, conditional: boolean): ControlEffect {
  return target === undefined
    ? { kind: 'jump', conditional }
    : { kind: 'jump', target, conditional };
}

export function controlEffect(
  control: ControlEffect,
  reads: RegisterContractsUnit[] = [],
): InstructionEffect {
  return {
    ...baseEffect(),
    reads,
    control,
  };
}

export function stackControlEffect(
  control: ControlEffect,
  reads: RegisterContractsUnit[] = [],
): InstructionEffect {
  return {
    ...controlEffect(control, reads),
    writes: STACK_POINTER_UNITS,
    stack: { kind: 'unknown' },
  };
}

export function ldEffect(
  instruction: Extract<Z80Instruction, { mnemonic: 'ld' }>,
): InstructionEffect {
  const srcReads = operandReads(instruction.source);
  if (srcReads === undefined) return unknownEffect();

  const dstWrites = operandWrites(instruction.target);
  if (instruction.target.kind === 'reg8' || instruction.target.kind === 'reg16') {
    if (dstWrites === undefined) return unknownEffect();
    return {
      ...baseEffect(),
      reads: srcReads,
      writes: dstWrites,
    };
  }
  if (
    instruction.target.kind === 'reg-index16' ||
    instruction.target.kind === 'reg-half-index'
  ) {
    if (dstWrites === undefined) return unknownEffect();
    return {
      ...baseEffect(),
      reads: srcReads,
      writes: dstWrites,
    };
  }
  if (instruction.target.kind === 'reg-indirect' || instruction.target.kind === 'indexed') {
    const dstReads = operandReads(instruction.target);
    if (dstReads === undefined) return unknownEffect();
    return {
      ...baseEffect(),
      reads: concatUnique(dstReads, srcReads),
    };
  }
  if (instruction.target.kind === 'mem-abs') {
    return {
      ...baseEffect(),
      reads: srcReads,
    };
  }
  return unknownEffect();
}

export function incDecEffect(
  instruction: Extract<Z80Instruction, { mnemonic: 'inc' | 'dec' }>,
): InstructionEffect {
  const operand = instruction.operand;
  if (operand.kind === 'reg8') {
    const units = reg8Units(operand.register);
    return {
      ...baseEffect(),
      reads: units,
      writes: concatUnique(units, INC_DEC_FLAG_WRITES),
    };
  }
  if (operand.kind === 'reg16') {
    const units = reg16Units(operand.register);
    return {
      ...baseEffect(),
      reads: units,
      writes: units,
    };
  }
  if (operand.kind === 'reg-half-index') {
    const units = regHalfUnits(operand.register);
    return {
      ...baseEffect(),
      reads: units,
      writes: concatUnique(units, INC_DEC_FLAG_WRITES),
    };
  }
  const reads = operandReads(operand);
  if (reads === undefined) return unknownEffect();
  return {
    ...baseEffect(),
    reads,
    writes: INC_DEC_FLAG_WRITES,
  };
}

export function aluEffect(
  instruction: Extract<Z80Instruction, { mnemonic: 'add' | 'adc' | 'sbc' }>,
): InstructionEffect;
export function aluEffect(
  instruction: Extract<
    Z80Instruction,
    { mnemonic: 'sub' | 'and' | 'or' | 'xor' | 'cp' | 'add' | 'adc' | 'sbc' }
  >,
): InstructionEffect;
export function aluEffect(instruction: Z80Instruction): InstructionEffect {
  if (
    instruction.mnemonic === 'add' &&
    'target' in instruction &&
    (instruction.target.kind === 'reg16' || instruction.target.kind === 'reg-index16')
  ) {
    return wideAluEffect(instruction, []);
  }

  if (
    instruction.mnemonic === 'adc' &&
    'target' in instruction &&
    (instruction.target.kind === 'reg16' || instruction.target.kind === 'reg-index16')
  ) {
    return wideAluEffect(instruction, ['carry']);
  }

  if (
    instruction.mnemonic === 'sbc' &&
    'target' in instruction &&
    (instruction.target.kind === 'reg16' || instruction.target.kind === 'reg-index16')
  ) {
    return wideAluEffect(instruction, ['carry']);
  }

  if (!('source' in instruction)) return unknownEffect();
  const source = instruction.source;
  const sourceReads = aluSourceReads(source);
  const xorSelfZero =
    instruction.mnemonic === 'xor' &&
    source.kind === 'reg8' &&
    source.register === 'a';
  const reads = xorSelfZero ? [] : concatUnique(['A'], sourceReads);
  const carryReads: RegisterContractsUnit[] =
    instruction.mnemonic === 'adc' || instruction.mnemonic === 'sbc' ? ['carry'] : [];

  if (instruction.mnemonic === 'cp') {
    return {
      ...baseEffect(),
      reads: concatUnique(reads, carryReads),
      writes: FLAG_WRITES,
    };
  }

  return {
    ...baseEffect(),
    reads: concatUnique(reads, carryReads),
    writes: concatUnique(['A'], FLAG_WRITES),
  };
}

export function pushEffect(register: Z80StackRegister16): InstructionEffect {
  const units = reg16Units(register);
  return {
    ...baseEffect(),
    reads: units,
    writes: STACK_POINTER_UNITS,
    stack: { kind: 'push', units },
  };
}

export function popEffect(register: Z80StackRegister16): InstructionEffect {
  const units = reg16Units(register);
  return {
    ...baseEffect(),
    writes: concatUnique(units, STACK_POINTER_UNITS),
    stack: { kind: 'pop', units },
  };
}

export function rotateShiftEffect(
  instruction: Extract<
    Z80Instruction,
    { mnemonic: 'rlc' | 'rrc' | 'rl' | 'rr' | 'sla' | 'sra' | 'sll' | 'sls' | 'srl' }
  >,
): InstructionEffect {
  const reads = operandReads(instruction.operand);
  const writes = operandWrites(instruction.operand);
  if (reads === undefined || writes === undefined) return unknownEffect();
  return {
    ...baseEffect(),
    reads,
    writes: concatUnique(writes, ROTATE_SHIFT_FLAG_WRITES),
  };
}

export function bitEffect(
  instruction: Extract<Z80Instruction, { mnemonic: 'bit' | 'res' | 'set' }>,
): InstructionEffect {
  const reads = operandReads(instruction.operand);
  if (reads === undefined) return unknownEffect();
  if (instruction.mnemonic === 'bit') {
    return {
      ...baseEffect(),
      reads,
      writes: BIT_FLAG_WRITES,
    };
  }
  const writes = operandWrites(instruction.operand);
  if (writes === undefined) return unknownEffect();
  return {
    ...baseEffect(),
    reads,
    writes,
  };
}

export function inEffect(instruction: Extract<Z80Instruction, { mnemonic: 'in' }>): InstructionEffect {
  const targetWrites =
    instruction.target?.kind === 'reg8' ? reg8Units(instruction.target.register) : undefined;
  if (instruction.port.kind === 'imm') {
    return {
      ...baseEffect(),
      reads: ['A'],
      writes: targetWrites ?? [],
    };
  }
  return {
    ...baseEffect(),
    reads: ['C'],
    writes: concatUnique(targetWrites ?? [], BIT_FLAG_WRITES),
  };
}

export function outEffect(
  instruction: Extract<Z80Instruction, { mnemonic: 'out' }>,
): InstructionEffect {
  const valueReads =
    instruction.source.kind === 'reg8' ? reg8Units(instruction.source.register) : [];
  if (instruction.port.kind === 'c') {
    return {
      ...baseEffect(),
      reads: concatUnique(['C'], valueReads),
    };
  }
  return {
    ...baseEffect(),
    reads: valueReads,
  };
}

export function blockTransferEffect(): InstructionEffect {
  return {
    ...baseEffect(),
    reads: ['H', 'L', 'D', 'E', 'B', 'C'],
    writes: ['H', 'L', 'D', 'E', 'B', 'C', 'halfCarry', 'parity'],
  };
}

export function exEffect(instruction: Extract<Z80Instruction, { mnemonic: 'ex' }>): InstructionEffect {
  if (instruction.form === 'de-hl') {
    return {
      ...baseEffect(),
      reads: ['D', 'E', 'H', 'L'],
      writes: ['D', 'E', 'H', 'L'],
    };
  }
  return unknownEffect();
}

export function accumulatorRotateEffect(
  mnemonic: 'rlca' | 'rrca' | 'rla' | 'rra',
): InstructionEffect {
  const reads: RegisterContractsUnit[] = mnemonic === 'rla' || mnemonic === 'rra' ? ['A', 'carry'] : ['A'];
  return {
    ...baseEffect(),
    reads,
    writes: ['A', 'carry', 'halfCarry'],
  };
}

function wideAluEffect(
  instruction: Extract<Z80Instruction, { mnemonic: 'add' | 'adc' | 'sbc' }>,
  extraReads: RegisterContractsUnit[],
): InstructionEffect {
  const targetReads = operandReads(instruction.target);
  const sourceReads = operandReads(instruction.source);
  if (targetReads === undefined || sourceReads === undefined) return unknownEffect();
  return {
    ...baseEffect(),
    reads: concatUnique(targetReads, sourceReads, extraReads),
    writes: concatUnique(operandWrites(instruction.target) ?? [], FLAG_WRITES),
  };
}

type AluSource = Z80Operand | { readonly kind: 'zero' };

function aluSourceReads(source: AluSource): RegisterContractsUnit[] {
  if (source.kind === 'reg8') return reg8Units(source.register);
  if (source.kind === 'reg16' || source.kind === 'reg-index16') return reg16Units(source.register);
  if (source.kind === 'reg-half-index') return regHalfUnits(source.register);
  if (source.kind === 'reg-indirect' || source.kind === 'indexed') return operandReads(source) ?? [];
  return [];
}
