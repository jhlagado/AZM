import type {
  ControlEffect,
  InstructionEffect,
  RegisterCareUnit,
} from '../register-care/types.js';
import type {
  Z80Condition,
  Z80Instruction,
  Z80Operand,
  Z80RelativeCondition,
  Z80StackRegister16,
} from './instruction.js';
import type { Expression } from '../model/expression.js';

const FLAG_WRITES: RegisterCareUnit[] = ['sign', 'zero', 'halfCarry', 'parity', 'carry'];
const INC_DEC_FLAG_WRITES: RegisterCareUnit[] = ['sign', 'zero', 'halfCarry', 'parity'];
const ROTATE_SHIFT_FLAG_WRITES: RegisterCareUnit[] = [
  'sign',
  'zero',
  'halfCarry',
  'parity',
  'carry',
];
const BIT_FLAG_WRITES: RegisterCareUnit[] = ['sign', 'zero', 'halfCarry', 'parity'];
const STACK_POINTER_UNITS: RegisterCareUnit[] = ['SPH', 'SPL'];
const UNKNOWN_UNITS: RegisterCareUnit[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
  'SPH',
  'SPL',
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
];

function baseEffect(): InstructionEffect {
  return {
    reads: [],
    writes: [],
    stack: { kind: 'none' },
    control: { kind: 'fallthrough' },
  };
}

function unknownEffect(): InstructionEffect {
  return {
    reads: UNKNOWN_UNITS,
    writes: UNKNOWN_UNITS,
    stack: { kind: 'unknown' },
    control: { kind: 'unknown' },
  };
}

function appendUnique(out: RegisterCareUnit[], units: RegisterCareUnit[]): void {
  for (const unit of units) {
    if (!out.includes(unit)) out.push(unit);
  }
}

function concatUnique(...groups: RegisterCareUnit[][]): RegisterCareUnit[] {
  const out: RegisterCareUnit[] = [];
  for (const group of groups) appendUnique(out, group);
  return out;
}

function reg8Units(raw: string): RegisterCareUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'a') return ['A'];
  if (reg === 'b') return ['B'];
  if (reg === 'c') return ['C'];
  if (reg === 'd') return ['D'];
  if (reg === 'e') return ['E'];
  if (reg === 'h') return ['H'];
  if (reg === 'l') return ['L'];
  return [];
}

function reg16Units(raw: string): RegisterCareUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'bc') return ['B', 'C'];
  if (reg === 'de') return ['D', 'E'];
  if (reg === 'hl') return ['H', 'L'];
  if (reg === 'sp') return ['SPH', 'SPL'];
  if (reg === 'ix') return ['IXH', 'IXL'];
  if (reg === 'iy') return ['IYH', 'IYL'];
  if (reg === 'af') return ['A', ...FLAG_WRITES];
  return [];
}

function regHalfUnits(raw: string): RegisterCareUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'ixh') return ['IXH'];
  if (reg === 'ixl') return ['IXL'];
  if (reg === 'iyh') return ['IYH'];
  if (reg === 'iyl') return ['IYL'];
  return [];
}

function expressionSymbol(expression: Expression): string | undefined {
  return expression.kind === 'symbol' ? expression.name : undefined;
}

function conditionFlagRead(condition: Z80Condition | Z80RelativeCondition): RegisterCareUnit[] {
  switch (condition) {
    case 'z':
    case 'nz':
      return ['zero'];
    case 'c':
    case 'nc':
      return ['carry'];
    case 'm':
    case 'p':
      return ['sign'];
    case 'pe':
    case 'po':
      return ['parity'];
    default:
      return [];
  }
}

function operandReads(op: Z80Operand): RegisterCareUnit[] | undefined {
  switch (op.kind) {
    case 'reg8':
      return reg8Units(op.register);
    case 'reg16':
    case 'reg-index16':
      return reg16Units(op.register);
    case 'reg-half-index':
      return regHalfUnits(op.register);
    case 'special8':
      return [];
    case 'reg-indirect':
      return reg16Units(op.register);
    case 'indexed':
      return reg16Units(op.register);
    case 'mem-abs':
    case 'imm':
      return [];
    default:
      return undefined;
  }
}

function operandWrites(op: Z80Operand): RegisterCareUnit[] | undefined {
  switch (op.kind) {
    case 'reg8':
      return reg8Units(op.register);
    case 'reg16':
      return reg16Units(op.register);
    case 'reg-index16':
      return reg16Units(op.register);
    case 'reg-half-index':
      return regHalfUnits(op.register);
    default:
      return undefined;
  }
}

function callControl(target: string | undefined, conditional: boolean): ControlEffect {
  return target === undefined
    ? { kind: 'call', conditional }
    : { kind: 'call', target, conditional };
}

function rstControl(vector: number | undefined): ControlEffect {
  return vector === undefined ? { kind: 'rst' } : { kind: 'rst', vector };
}

function jumpControl(target: string | undefined, conditional: boolean): ControlEffect {
  return target === undefined
    ? { kind: 'jump', conditional }
    : { kind: 'jump', target, conditional };
}

function controlEffect(control: ControlEffect, reads: RegisterCareUnit[] = []): InstructionEffect {
  return {
    ...baseEffect(),
    reads,
    control,
  };
}

function stackControlEffect(
  control: ControlEffect,
  reads: RegisterCareUnit[] = [],
): InstructionEffect {
  return {
    ...controlEffect(control, reads),
    writes: STACK_POINTER_UNITS,
    stack: { kind: 'unknown' },
  };
}

function ldEffect(instruction: Extract<Z80Instruction, { mnemonic: 'ld' }>): InstructionEffect {
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

function incDecEffect(
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
      writes: concatUnique(units, INC_DEC_FLAG_WRITES),
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

function aluEffect(instruction: Extract<Z80Instruction, { mnemonic: 'add' | 'adc' | 'sbc' }>): InstructionEffect;
function aluEffect(
  instruction: Extract<
    Z80Instruction,
    { mnemonic: 'sub' | 'and' | 'or' | 'xor' | 'cp' | 'add' | 'adc' | 'sbc' }
  >,
): InstructionEffect;
function aluEffect(instruction: Z80Instruction): InstructionEffect {
  if (
    instruction.mnemonic === 'add' &&
    'target' in instruction &&
    (instruction.target.kind === 'reg16' || instruction.target.kind === 'reg-index16')
  ) {
    const targetReads = operandReads(instruction.target);
    const sourceReads = operandReads(instruction.source);
    if (targetReads === undefined || sourceReads === undefined) return unknownEffect();
    return {
      ...baseEffect(),
      reads: concatUnique(targetReads, sourceReads),
      writes: concatUnique(operandWrites(instruction.target) ?? [], FLAG_WRITES),
    };
  }

  if (
    instruction.mnemonic === 'adc' &&
    'target' in instruction &&
    (instruction.target.kind === 'reg16' || instruction.target.kind === 'reg-index16')
  ) {
    const targetReads = operandReads(instruction.target);
    const sourceReads = operandReads(instruction.source);
    if (targetReads === undefined || sourceReads === undefined) return unknownEffect();
    return {
      ...baseEffect(),
      reads: concatUnique(targetReads, sourceReads, ['carry']),
      writes: concatUnique(operandWrites(instruction.target) ?? [], FLAG_WRITES),
    };
  }

  if (
    instruction.mnemonic === 'sbc' &&
    'target' in instruction &&
    (instruction.target.kind === 'reg16' || instruction.target.kind === 'reg-index16')
  ) {
    const targetReads = operandReads(instruction.target);
    const sourceReads = operandReads(instruction.source);
    if (targetReads === undefined || sourceReads === undefined) return unknownEffect();
    return {
      ...baseEffect(),
      reads: concatUnique(targetReads, sourceReads, ['carry']),
      writes: concatUnique(operandWrites(instruction.target) ?? [], FLAG_WRITES),
    };
  }

  if (!('source' in instruction)) return unknownEffect();
  const source = instruction.source;
  let sourceReads: RegisterCareUnit[];
  if (source.kind === 'reg8') {
    sourceReads = reg8Units(source.register);
  } else if (source.kind === 'reg-indirect' || source.kind === 'indexed') {
    sourceReads = operandReads(source) ?? [];
  } else if (source.kind === 'mem-abs' || source.kind === 'imm') {
    sourceReads = [];
  } else if (source.kind === 'reg16' || source.kind === 'reg-index16') {
    sourceReads = reg16Units(source.register);
  } else if (source.kind === 'reg-half-index') {
    sourceReads = regHalfUnits(source.register);
  } else {
    sourceReads = [];
  }

  const xorSelfZero =
    instruction.mnemonic === 'xor' &&
    source.kind === 'reg8' &&
    source.register === 'a';
  const reads = xorSelfZero ? [] : concatUnique(['A'], sourceReads);
  const carryReads: RegisterCareUnit[] =
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

function stackRegisterUnits(register: Z80StackRegister16): RegisterCareUnit[] {
  return reg16Units(register);
}

function pushEffect(register: Z80StackRegister16): InstructionEffect {
  const units = stackRegisterUnits(register);
  return {
    ...baseEffect(),
    reads: units,
    writes: STACK_POINTER_UNITS,
    stack: { kind: 'push', units },
  };
}

function popEffect(register: Z80StackRegister16): InstructionEffect {
  const units = stackRegisterUnits(register);
  return {
    ...baseEffect(),
    writes: concatUnique(units, STACK_POINTER_UNITS),
    stack: { kind: 'pop', units },
  };
}

function rotateShiftEffect(
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

function bitEffect(
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

function inEffect(instruction: Extract<Z80Instruction, { mnemonic: 'in' }>): InstructionEffect {
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

function outEffect(instruction: Extract<Z80Instruction, { mnemonic: 'out' }>): InstructionEffect {
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

function blockTransferEffect(): InstructionEffect {
  return {
    ...baseEffect(),
    reads: ['H', 'L', 'D', 'E', 'B', 'C'],
    writes: ['H', 'L', 'D', 'E', 'B', 'C', 'halfCarry', 'parity'],
  };
}

function exEffect(instruction: Extract<Z80Instruction, { mnemonic: 'ex' }>): InstructionEffect {
  if (instruction.form === 'de-hl') {
    return {
      ...baseEffect(),
      reads: ['D', 'E', 'H', 'L'],
      writes: ['D', 'E', 'H', 'L'],
    };
  }
  return unknownEffect();
}

function accumulatorRotateEffect(
  mnemonic: 'rlca' | 'rrca' | 'rla' | 'rra',
): InstructionEffect {
  const reads: RegisterCareUnit[] = mnemonic === 'rla' || mnemonic === 'rra' ? ['A', 'carry'] : ['A'];
  return {
    ...baseEffect(),
    reads,
    writes: ['A', 'carry', 'halfCarry'],
  };
}

export function getZ80InstructionEffect(instruction: Z80Instruction): InstructionEffect {
  switch (instruction.mnemonic) {
    case 'nop':
    case 'halt':
    case 'di':
    case 'ei':
    case 'im':
    case 'reti':
    case 'retn':
      return baseEffect();
    case 'ld-a-imm':
      return { ...baseEffect(), writes: ['A'] };
    case 'ld':
      return ldEffect(instruction);
    case 'inc':
    case 'dec':
      return incDecEffect(instruction);
    case 'add':
    case 'adc':
    case 'sbc':
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return aluEffect(instruction);
    case 'push':
      return pushEffect(instruction.register);
    case 'pop':
      return popEffect(instruction.register);
    case 'call':
      return stackControlEffect(
        callControl(expressionSymbol(instruction.expression), false),
      );
    case 'call-cc':
      return stackControlEffect(
        callControl(expressionSymbol(instruction.expression), true),
        conditionFlagRead(instruction.condition),
      );
    case 'rst':
      return stackControlEffect(rstControl(instruction.vector));
    case 'ret':
      return stackControlEffect({ kind: 'return' });
    case 'ret-cc':
      return stackControlEffect({ kind: 'return' }, conditionFlagRead(instruction.condition));
    case 'jp':
      return controlEffect(
        jumpControl(expressionSymbol(instruction.expression), false),
      );
    case 'jp-cc':
      return controlEffect(
        jumpControl(expressionSymbol(instruction.expression), true),
        conditionFlagRead(instruction.condition),
      );
    case 'jp-indirect':
      return controlEffect(
        jumpControl(undefined, false),
        reg16Units(instruction.register),
      );
    case 'jr':
      return controlEffect(jumpControl(expressionSymbol(instruction.expression), false));
    case 'jr-cc':
      return controlEffect(
        jumpControl(expressionSymbol(instruction.expression), true),
        conditionFlagRead(instruction.condition),
      );
    case 'djnz':
      return {
        ...baseEffect(),
        reads: ['B'],
        writes: ['B'],
        control: jumpControl(expressionSymbol(instruction.expression), true),
      };
    case 'rlc':
    case 'rrc':
    case 'rl':
    case 'rr':
    case 'sla':
    case 'sra':
    case 'sll':
    case 'sls':
    case 'srl':
      return rotateShiftEffect(instruction);
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
      return accumulatorRotateEffect(instruction.mnemonic);
    case 'bit':
    case 'res':
    case 'set':
      return bitEffect(instruction);
    case 'scf':
      return { ...baseEffect(), writes: ['carry', 'halfCarry'] };
    case 'ccf':
      return { ...baseEffect(), reads: ['carry'], writes: ['carry', 'halfCarry'] };
    case 'cpl':
      return { ...baseEffect(), reads: ['A'], writes: ['A', 'halfCarry'] };
    case 'neg':
      return { ...baseEffect(), reads: ['A'], writes: concatUnique(['A'], FLAG_WRITES) };
    case 'out':
      return outEffect(instruction);
    case 'in':
      return inEffect(instruction);
    case 'ldi':
    case 'ldir':
    case 'ldd':
    case 'lddr':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
    case 'ini':
    case 'inir':
    case 'ind':
    case 'indr':
    case 'outi':
    case 'otir':
    case 'outd':
    case 'otdr':
      return blockTransferEffect();
    case 'ex':
      return exEffect(instruction);
    default:
      return unknownEffect();
  }
}
