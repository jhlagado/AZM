import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  EaIndexNode,
  ImmExprNode,
} from '../frontend/ast.js';
import { expandCarrier } from '../registerCare/carriers.js';
import type { ControlEffect, InstructionEffect, RegisterCareUnit } from '../registerCare/types.js';

const FLAG_WRITES: RegisterCareUnit[] = [
  'sign',
  'zero',
  'halfCarry',
  'parity',
  'negative',
  'carry',
];

const INC_DEC_FLAG_WRITES: RegisterCareUnit[] = ['sign', 'zero', 'halfCarry', 'parity', 'negative'];

const STACK_POINTER_UNITS: RegisterCareUnit[] = ['SPH', 'SPL'];
const UNKNOWN_WRITES: RegisterCareUnit[] = ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'F'];

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
    reads: [],
    writes: UNKNOWN_WRITES,
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

function registerUnits(op: AsmOperandNode | undefined): RegisterCareUnit[] | undefined {
  if (!op || op.kind !== 'Reg') return undefined;
  return expandCarrier(op.name);
}

function immName(op: AsmOperandNode | undefined): string | undefined {
  return op?.kind === 'Imm' && op.expr.kind === 'ImmName' ? op.expr.name : undefined;
}

function immLiteral(op: AsmOperandNode | undefined): number | undefined {
  return op?.kind === 'Imm' && op.expr.kind === 'ImmLiteral' ? op.expr.value : undefined;
}

function eaReads(ea: EaExprNode): RegisterCareUnit[] | undefined {
  switch (ea.kind) {
    case 'EaName':
      return expandCarrier(ea.name) ?? [];
    case 'EaImm':
      return [];
    case 'EaReinterpret':
    case 'EaField':
      return eaReads(ea.base);
    case 'EaAdd':
    case 'EaSub':
      return eaReads(ea.base);
    case 'EaIndex': {
      const base = eaReads(ea.base);
      const index = indexReads(ea.index);
      if (!base || !index) return undefined;
      return concatUnique(base, index);
    }
    default:
      return undefined;
  }
}

function indexReads(index: EaIndexNode): RegisterCareUnit[] | undefined {
  switch (index.kind) {
    case 'IndexImm':
      return [];
    case 'IndexReg8':
    case 'IndexReg16':
      return expandCarrier(index.reg);
    case 'IndexMemHL':
      return expandCarrier('HL');
    case 'IndexMemIxIy':
      return expandCarrier(index.base);
    case 'IndexEa':
      return eaReads(index.expr);
    default:
      return undefined;
  }
}

function operandReads(op: AsmOperandNode | undefined): RegisterCareUnit[] | undefined {
  if (!op) return undefined;
  switch (op.kind) {
    case 'Reg':
      return expandCarrier(op.name);
    case 'Imm':
      return immReads(op.expr);
    case 'Ea':
    case 'Mem':
      return eaReads(op.expr);
    case 'PortC':
      return expandCarrier('C');
    case 'PortImm8':
      return immReads(op.expr);
    default:
      return undefined;
  }
}

function immReads(expr: ImmExprNode): RegisterCareUnit[] {
  switch (expr.kind) {
    case 'ImmBinary':
      return concatUnique(immReads(expr.left), immReads(expr.right));
    case 'ImmUnary':
      return immReads(expr.expr);
    default:
      return [];
  }
}

function targetName(operands: AsmOperandNode[]): string | undefined {
  if (operands.length === 0) return undefined;
  return immName(operands[operands.length - 1]);
}

function callControl(target: string | undefined): ControlEffect {
  return target === undefined ? { kind: 'call' } : { kind: 'call', target };
}

function rstControl(vector: number | undefined): ControlEffect {
  return vector === undefined ? { kind: 'rst' } : { kind: 'rst', vector };
}

function jumpControl(target: string | undefined, conditional: boolean): ControlEffect {
  return target === undefined
    ? { kind: 'jump', conditional }
    : { kind: 'jump', target, conditional };
}

function isConditionalControl(operands: AsmOperandNode[]): boolean {
  return operands.length > 1;
}

function ldEffect(inst: AsmInstructionNode): InstructionEffect {
  if (inst.operands.length !== 2) return unknownEffect();
  const dst = inst.operands[0];
  const src = inst.operands[1];
  if (!dst || !src) return unknownEffect();

  const effect = baseEffect();
  const srcReads = operandReads(src);
  if (!srcReads) return unknownEffect();

  if (dst.kind === 'Reg') {
    const dstWrites = expandCarrier(dst.name);
    if (!dstWrites) return unknownEffect();
    effect.reads = srcReads;
    effect.writes = dstWrites;
    return effect;
  }

  if (dst.kind === 'Mem') {
    const dstReads = operandReads(dst);
    if (!dstReads) return unknownEffect();
    effect.reads = concatUnique(dstReads, srcReads);
    return effect;
  }

  return unknownEffect();
}

function incDecEffect(inst: AsmInstructionNode): InstructionEffect {
  if (inst.operands.length !== 1) return unknownEffect();
  const op = inst.operands[0];
  if (!op) return unknownEffect();

  const reads = operandReads(op);
  if (!reads) return unknownEffect();

  const writes = op.kind === 'Reg' ? registerUnits(op) : [];
  if (!writes) return unknownEffect();

  return {
    ...baseEffect(),
    reads,
    writes: concatUnique(writes, INC_DEC_FLAG_WRITES),
  };
}

function aluEffect(inst: AsmInstructionNode): InstructionEffect {
  if (inst.operands.length < 1 || inst.operands.length > 2) return unknownEffect();

  const first = inst.operands[0];
  const second = inst.operands[1];
  const firstReads = operandReads(first);
  if (!firstReads) return unknownEffect();

  let reads: RegisterCareUnit[];
  let writes: RegisterCareUnit[] = [];
  if (second) {
    const secondReads = operandReads(second);
    if (!secondReads) return unknownEffect();
    reads = concatUnique(firstReads, secondReads);
    if (inst.head !== 'cp' && first?.kind === 'Reg') {
      const firstWrites = registerUnits(first);
      if (!firstWrites) return unknownEffect();
      writes = firstWrites;
    }
  } else {
    const aReads = expandCarrier('A');
    if (!aReads) return unknownEffect();
    reads = concatUnique(aReads, firstReads);
    if (inst.head !== 'cp') writes = aReads;
  }

  return {
    ...baseEffect(),
    reads,
    writes: concatUnique(writes, FLAG_WRITES),
  };
}

function pushEffect(inst: AsmInstructionNode): InstructionEffect {
  if (inst.operands.length !== 1) return unknownEffect();
  const units = registerUnits(inst.operands[0]);
  if (!units) return unknownEffect();
  return {
    ...baseEffect(),
    reads: units,
    writes: STACK_POINTER_UNITS,
    stack: { kind: 'push', units },
  };
}

function popEffect(inst: AsmInstructionNode): InstructionEffect {
  if (inst.operands.length !== 1) return unknownEffect();
  const units = registerUnits(inst.operands[0]);
  if (!units) return unknownEffect();
  return {
    ...baseEffect(),
    writes: concatUnique(units, STACK_POINTER_UNITS),
    stack: { kind: 'pop', units },
  };
}

function controlEffect(control: ControlEffect): InstructionEffect {
  return {
    ...baseEffect(),
    control,
  };
}

function jumpEffect(inst: AsmInstructionNode): InstructionEffect {
  const effect = controlEffect(
    jumpControl(targetName(inst.operands), isConditionalControl(inst.operands)),
  );
  const reads = operandReads(inst.operands[inst.operands.length - 1]);
  if (!reads) return unknownEffect();
  effect.reads = reads;
  return effect;
}

function djnzEffect(inst: AsmInstructionNode): InstructionEffect {
  return {
    ...baseEffect(),
    reads: ['B'],
    writes: ['B'],
    control: jumpControl(targetName(inst.operands), true),
  };
}

export function getZ80InstructionEffect(inst: AsmInstructionNode): InstructionEffect {
  switch (inst.head.toLowerCase()) {
    case 'nop':
    case 'halt':
    case 'di':
    case 'ei':
      return baseEffect();
    case 'ld':
      return ldEffect(inst);
    case 'inc':
    case 'dec':
      return incDecEffect(inst);
    case 'add':
    case 'adc':
    case 'sbc':
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return aluEffect(inst);
    case 'push':
      return pushEffect(inst);
    case 'pop':
      return popEffect(inst);
    case 'call':
      return controlEffect(callControl(targetName(inst.operands)));
    case 'rst':
      return controlEffect(rstControl(immLiteral(inst.operands[0])));
    case 'ret':
    case 'retn':
    case 'reti':
      return controlEffect({ kind: 'return' });
    case 'jp':
    case 'jr':
      return jumpEffect(inst);
    case 'djnz':
      return djnzEffect(inst);
    default:
      return unknownEffect();
  }
}
