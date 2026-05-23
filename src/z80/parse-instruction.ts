import type {
  Z80CoreMnemonic,
  Z80AluMnemonic,
  Z80BitMnemonic,
  Z80Instruction,
  Z80IndexHalfRegister,
  Z80IndexRegister16,
  Z80JumpIndirectRegister,
  Z80Operand,
  Z80RelativeCondition,
  Z80Register16,
  Z80Register8,
  Z80RegisterIndirect,
  Z80RotateShiftMnemonic,
  Z80RstVector,
  Z80SpecialRegister8,
  Z80StackRegister16,
} from './instruction.js';
import type { Expression } from '../model/expression.js';
import { parseExpression } from '../syntax/parse-expression.js';

export interface ParseZ80InstructionResult {
  readonly instruction?: Z80Instruction;
  readonly error?: string;
  readonly diagnostics?: readonly string[];
}

export function parseZ80Instruction(text: string): ParseZ80InstructionResult | undefined {
  const nop = /^NOP(?:\s+(.*))?$/i.exec(text);
  if (nop) {
    return nop[1] === undefined
      ? { instruction: { mnemonic: 'nop' } }
      : { error: 'nop expects no operands' };
  }

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

  const input = /^IN(?:\s+(.*))?$/i.exec(text);
  if (input) {
    const operandText = input[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length > 2) {
      return { error: 'in expects one or two operands' };
    }
    if (parts.length === 1) {
      const port = parsePortOperand(parts[0] ?? '');
      return port?.kind === 'c'
        ? { instruction: { mnemonic: 'in', port } }
        : { error: 'in (c) is the only one-operand in form' };
    }
    const target = parseRegister8Operand(parts[0] ?? '');
    if (!target) {
      return parseIndexHalfRegister(parts[0] ?? '')
        ? { error: 'in destination must use plain reg8 B/C/D/E/H/L/A' }
        : { error: 'in expects a reg8 destination' };
    }
    const port = parsePortOperand(parts[1] ?? '');
    if (!port) {
      return { error: 'in expects a port operand (c) or (imm8)' };
    }
    if (port.kind === 'imm' && target.register !== 'a') {
      return { error: 'in a,(n) immediate port form requires destination A' };
    }
    return { instruction: { mnemonic: 'in', target, port } };
  }

  const output = /^OUT(?:\s+(.*))?$/i.exec(text);
  if (output) {
    const operandText = output[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 2) {
      return { error: 'out expects two operands' };
    }
    const port = parsePortOperand(parts[0] ?? '');
    if (!port) {
      return { error: 'out expects a port operand (c) or (imm8)' };
    }
    const source = parseRegister8Operand(parts[1] ?? '');
    if (source) {
      if (port.kind === 'imm' && source.register !== 'a') {
        return { error: 'out (n),a immediate port form requires source A' };
      }
      return { instruction: { mnemonic: 'out', port, source } };
    }
    if (parseIndexHalfRegister(parts[1] ?? '')) {
      return { error: 'out source must use plain reg8 B/C/D/E/H/L/A' };
    }
    const zero = parseConstantExpression(parts[1] ?? '');
    if (zero !== undefined && port.kind === 'c') {
      return zero === 0
        ? { instruction: { mnemonic: 'out', port, source: { kind: 'zero' } } }
        : { error: 'out (c), n immediate form supports n=0 only' };
    }
    return { error: 'out expects a reg8 source' };
  }

  const im = /^IM(?:\s+(.*))?$/i.exec(text);
  if (im) {
    const operandText = im[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: 'im expects one operand' };
    }
    const mode = parseConstantExpression(parts[0] ?? '');
    if (mode !== 0 && mode !== 1 && mode !== 2) {
      return { error: 'im expects 0, 1, or 2' };
    }
    return { instruction: { mnemonic: 'im', mode } };
  }

  const rst = /^RST(?:\s+(.*))?$/i.exec(text);
  if (rst) {
    const operandText = rst[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: 'rst expects one operand' };
    }
    const vector = parseConstantExpression(parts[0] ?? '');
    if (!isRstVector(vector)) {
      return { error: 'rst expects an imm8 multiple of 8 (0..56)' };
    }
    return { instruction: { mnemonic: 'rst', vector } };
  }

  const exchange = /^EX\s+(.+)$/i.exec(text);
  if (exchange) {
    const operandText = exchange[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 2) {
      return { error: 'ex expects two operands' };
    }
    const left = (parts[0] ?? '').toLowerCase();
    const right = (parts[1] ?? '').toLowerCase();
    if ((left === 'af' && right === "af'") || (left === "af'" && right === 'af')) {
      return { instruction: { mnemonic: 'ex', form: 'af-af' } };
    }
    if (left === 'de' && right === 'hl') {
      return { instruction: { mnemonic: 'ex', form: 'de-hl' } };
    }
    if (left === '(sp)' && right === 'hl') {
      return { instruction: { mnemonic: 'ex', form: 'sp-hl' } };
    }
    if ((left === '(sp)' && right === 'ix') || (left === 'ix' && right === '(sp)')) {
      return { instruction: { mnemonic: 'ex', form: 'sp-ix' } };
    }
    if ((left === '(sp)' && right === 'iy') || (left === 'iy' && right === '(sp)')) {
      return { instruction: { mnemonic: 'ex', form: 'sp-iy' } };
    }
    return {
      error: `ex supports "AF, AF'", "DE, HL", "(SP), HL", "(SP), IX", and "(SP), IY" only`,
    };
  }

  const incDec = /^(INC|DEC)(?:\s+(.*))?$/i.exec(text);
  if (incDec) {
    const mnemonic = (incDec[1] ?? '').toLowerCase() as 'inc' | 'dec';
    const operandText = incDec[2] ?? '';
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

  const ld = /^LD\s+(.+)$/i.exec(text);
  if (ld) {
    const operandText = ld[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 2) {
      return { error: 'ld expects two operands' };
    }
    const indexedBracket =
      indexedBracketError(parts[0] ?? '') ?? indexedBracketError(parts[1] ?? '');
    if (indexedBracket) {
      return { error: indexedBracket };
    }
    const target = parseLdOperand(parts[0] ?? '');
    const source = parseLdOperand(parts[1] ?? '');
    if (!target || !source) {
      const operandDiagnostics = [
        ...invalidLdOperandDiagnostics(parts[0] ?? ''),
        ...invalidLdOperandDiagnostics(parts[1] ?? ''),
      ];
      if (operandDiagnostics.length > 0) {
        const error = operandDiagnostics[operandDiagnostics.length - 1]!;
        return {
          error,
          diagnostics: operandDiagnostics,
        };
      }
      return { error: `invalid LD operands: ${operandText}` };
    }
    const unsupportedReason = unsupportedLdReason(target, source);
    if (unsupportedReason) {
      return { error: unsupportedReason };
    }
    if (!isSupportedLd(target, source)) {
      return { error: `unsupported LD operands: ${operandText}` };
    }
    return { instruction: { mnemonic: 'ld', target, source } };
  }

  const bitLike = /^(BIT|RES|SET)(?:\s+(.*))?$/i.exec(text);
  if (bitLike) {
    const mnemonic = (bitLike[1] ?? '').toLowerCase() as Z80BitMnemonic;
    const operandText = bitLike[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length < 2) {
      return { error: `${mnemonic} expects two operands` };
    }
    if (mnemonic === 'bit' && parts.length !== 2) {
      return { error: 'bit expects two operands' };
    }
    if (mnemonic !== 'bit' && parts.length > 3) {
      return { error: `${mnemonic} expects two operands` };
    }
    const bit = parseBitIndex(parts[0] ?? '');
    if (bit === undefined) {
      return { error: `${mnemonic} expects bit index 0..7` };
    }
    const operand = parseCbOperand(parts[1] ?? '');
    if (!operand) {
      return { error: `${mnemonic} expects reg8 or (hl)` };
    }
    if (parts.length === 2) {
      return { instruction: { mnemonic, bit, operand } };
    }
    if (operand.kind !== 'indexed') {
      return { error: `${mnemonic} b,(ix/iy+disp),r requires an indexed memory source` };
    }
    const destination = parseRegister8Operand(parts[2] ?? '');
    if (destination) {
      return { instruction: { mnemonic, bit, operand, destination } };
    }
    const halfDestination = parseIndexHalfRegister(parts[2] ?? '');
    if (halfDestination) {
      return halfIndexFamilyFromRegister(halfDestination) === operand.register
        ? {
            error: `${mnemonic} indexed destination must use plain reg8 B/C/D/E/H/L/A`,
          }
        : {
            error: `${mnemonic} indexed destination family must match source index base`,
          };
    }
    return { error: `${mnemonic} b,(ix/iy+disp),r expects reg8 destination` };
  }

  const rotateShift = /^(RLC|RRC|RL|RR|SLA|SRA|SLL|SLS|SRL)(?:\s+(.*))?$/i.exec(text);
  if (rotateShift) {
    const mnemonic = (rotateShift[1] ?? '').toLowerCase() as Z80RotateShiftMnemonic;
    const operandText = rotateShift[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0) {
      return { error: `${mnemonic} expects one operand` };
    }
    if (parts.length === 2) {
      const operand = parseCbOperand(parts[0] ?? '');
      if (operand?.kind !== 'indexed') {
        return { error: `${mnemonic} two-operand form requires (ix/iy+disp) source` };
      }
      const destination = parseRegister8Operand(parts[1] ?? '');
      if (destination) {
        return { instruction: { mnemonic, operand, destination } };
      }
      const halfDestination = parseIndexHalfRegister(parts[1] ?? '');
      if (halfDestination) {
        return halfIndexFamilyFromRegister(halfDestination) === operand.register
          ? {
              error: `${mnemonic} indexed destination must use plain reg8 B/C/D/E/H/L/A`,
            }
          : {
              error: `${mnemonic} indexed destination family must match source index base`,
            };
      }
      return { error: `${mnemonic} (ix/iy+disp),r expects reg8 destination` };
    }
    if (parts.length !== 1) {
      return { error: `${mnemonic} expects one operand` };
    }
    const operand = parseCbOperand(parts[0] ?? '');
    return operand
      ? { instruction: { mnemonic, operand } }
      : { error: `${mnemonic} expects reg8 or (hl)` };
  }

  const accumulatorAlu = /^(ADD|ADC|SBC)\s+(.+)$/i.exec(text);
  if (accumulatorAlu) {
    const mnemonic = (accumulatorAlu[1] ?? '').toLowerCase() as Z80AluMnemonic;
    const operandText = accumulatorAlu[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 2) {
      return { error: `${mnemonic} expects destination A and one source operand` };
    }
    const target = parseRegister8Operand(parts[0] ?? '');
    if (target?.register === 'a') {
      const source = parseAluOperand(parts[1] ?? '');
      return source
        ? { instruction: { mnemonic, source } }
        : { error: `invalid ${mnemonic.toUpperCase()} operand: ${parts[1] ?? ''}` };
    }

    const target16 = parseRegister16Operand(parts[0] ?? '');
    if (target16?.register === 'hl') {
      const source = parseRegister16Operand(parts[1] ?? '');
      return source
        ? { instruction: { mnemonic: mnemonic as 'add' | 'adc' | 'sbc', target: target16, source } }
        : { error: `${mnemonic} HL, rr expects BC/DE/HL/SP` };
    }

    const targetIndex16 = parseIndexRegister16(parts[0] ?? '');
    if (mnemonic === 'add' && targetIndex16) {
      const target = { kind: 'reg-index16' as const, register: targetIndex16 };
      const source16 = parseRegister16Operand(parts[1] ?? '');
      if (source16 && source16.register !== 'hl') {
        return { instruction: { mnemonic, target, source: source16 } };
      }
      const sourceIndex16 = parseIndexRegister16(parts[1] ?? '');
      if (sourceIndex16 === targetIndex16) {
        return {
          instruction: {
            mnemonic,
            target,
            source: { kind: 'reg-index16', register: sourceIndex16 },
          },
        };
      }
      return {
        error: `add ${targetIndex16.toUpperCase()}, rr supports BC/DE/SP and same-index pair only`,
      };
    }

    return mnemonic === 'add'
      ? { error: 'add expects destination A, HL, IX, or IY' }
      : { error: `${mnemonic} expects destination A or HL` };
  }

  const alu = /^(SUB|AND|OR|XOR|CP)\s+(.+)$/i.exec(text);
  if (alu) {
    const mnemonic = (alu[1] ?? '').toLowerCase() as Z80AluMnemonic;
    const operandText = alu[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length === 2) {
      const target = parseRegister8Operand(parts[0] ?? '');
      if (target?.register === 'a') {
        const source = parseAluOperand(parts[1] ?? '');
        return source
          ? { instruction: { mnemonic, source } }
          : { error: `invalid ${mnemonic.toUpperCase()} operand: ${parts[1] ?? ''}` };
      }
      return { error: `${mnemonic} two-operand form requires destination A` };
    }
    if (parts.length !== 1) {
      return { error: `${mnemonic} expects one operand` };
    }
    const source = parseAluOperand(parts[0] ?? '');
    return source
      ? { instruction: { mnemonic, source } }
      : { error: `invalid ${mnemonic.toUpperCase()} operand: ${operandText}` };
  }

  const jump = /^JP(?:\s+(.*))?$/i.exec(text);
  if (jump) {
    const operandText = jump[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0) {
      return {
        error: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
      };
    }
    if (parts.length === 2) {
      const condition = parseCondition(parts[0] ?? '');
      if (!condition) {
        return { error: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M' };
      }
      const targetText = parts[1] ?? '';
      if (/^\(.*\)$/.test(targetText.trim())) {
        return { error: 'jp cc, nn does not support indirect targets' };
      }
      const expression = parseAbsoluteBranchTarget(targetText);
      return expression
        ? { instruction: { mnemonic: 'jp-cc', condition, expression } }
        : { error: 'jp cc, nn expects imm16' };
    }
    if (parts.length !== 1) {
      return {
        error: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
      };
    }
    const single = parts[0] ?? '';
    const condition = parseCondition(single);
    if (condition) {
      return { error: 'jp cc, nn expects two operands (cc, nn)' };
    }
    const indirect = parseJumpIndirect(single);
    if (indirect) {
      return { instruction: { mnemonic: 'jp-indirect', register: indirect } };
    }
    if (/^\(.*\)$/.test(single.trim())) {
      return { error: 'jp indirect form supports (hl), (ix), or (iy) only' };
    }
    if (isRegisterName(single)) {
      if (/^(HL|IX|IY)$/i.test(single.trim())) {
        return { error: 'jp indirect form requires parentheses; use (hl), (ix), or (iy)' };
      }
      return { error: 'jp does not support register targets; use imm16' };
    }
    const expression = parseExpression(single);
    return expression
      ? { instruction: { mnemonic: 'jp', expression } }
      : { error: `invalid JP target: ${single}` };
  }

  const call = /^CALL(?:\s+(.*))?$/i.exec(text);
  if (call) {
    const operandText = call[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0) {
      return { error: 'call expects one operand (nn) or two operands (cc, nn)' };
    }
    if (parts.length === 2) {
      const condition = parseCondition(parts[0] ?? '');
      if (!condition) {
        return { error: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M' };
      }
      const targetText = parts[1] ?? '';
      if (/^\(.*\)$/.test(targetText.trim())) {
        return { error: 'call cc, nn does not support indirect targets' };
      }
      const expression = parseAbsoluteBranchTarget(targetText);
      return expression
        ? { instruction: { mnemonic: 'call-cc', condition, expression } }
        : { error: 'call cc, nn expects imm16' };
    }
    if (parts.length !== 1) {
      return { error: 'call expects one operand (nn) or two operands (cc, nn)' };
    }
    const single = parts[0] ?? '';
    const condition = parseCondition(single);
    if (condition) {
      return { error: 'call cc, nn expects two operands (cc, nn)' };
    }
    if (/^\(.*\)$/.test(single.trim())) {
      return { error: 'call does not support indirect targets; use imm16' };
    }
    if (isRegisterName(single)) {
      return { error: 'call does not support register targets; use imm16' };
    }
    const expression = parseExpression(single);
    return expression
      ? { instruction: { mnemonic: 'call', expression } }
      : { error: `invalid CALL target: ${single}` };
  }

  const jrConditional = /^JR\s+(NZ|Z|NC|C)\s*,\s*(.+)$/i.exec(text);
  if (jrConditional) {
    const condition = (jrConditional[1] ?? '').toLowerCase() as Z80RelativeCondition;
    const expressionText = jrConditional[2] ?? '';
    const expression = parseExpression(expressionText);
    return expression
      ? { instruction: { mnemonic: 'jr-cc', condition, expression } }
      : { error: `invalid JR ${condition.toUpperCase()} target: ${expressionText}` };
  }

  const relativeBranch = /^(JR|DJNZ)\s+(.+)$/i.exec(text);
  if (relativeBranch) {
    const mnemonic = (relativeBranch[1] ?? '').toLowerCase() as 'jr' | 'djnz';
    const expressionText = relativeBranch[2] ?? '';
    const expression = parseExpression(expressionText);
    return expression
      ? { instruction: { mnemonic, expression } }
      : { error: `invalid ${mnemonic.toUpperCase()} target: ${expressionText}` };
  }

  return undefined;
}

function parseLdOperand(text: string): Z80Operand | undefined {
  const trimmed = text.trim();
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
  const memory = /^\((BC|DE|HL)\)$/i.exec(trimmed);
  if (memory) {
    return {
      kind: 'reg-indirect',
      register: (memory[1] ?? '').toLowerCase() as Z80RegisterIndirect,
    };
  }

  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const expression = parseExpression(trimmed.slice(1, -1).trim());
    return expression ? { kind: 'mem-abs', expression } : undefined;
  }

  if (/^(A|B|C|D|E|H|L)$/i.test(trimmed)) {
    return { kind: 'reg8', register: trimmed.toLowerCase() as Z80Register8 };
  }

  const index16 = parseIndexRegister16(trimmed);
  if (index16) {
    return { kind: 'reg-index16', register: index16 };
  }

  const half = parseIndexHalfRegister(trimmed);
  if (half) {
    return { kind: 'reg-half-index', register: half };
  }

  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return parseRegister16Operand(trimmed);
  }

  const special8 = parseSpecialRegister8(trimmed);
  if (special8) {
    return { kind: 'special8', register: special8 };
  }

  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression } : undefined;
}

function invalidLdOperandDiagnostics(text: string): readonly string[] {
  const trimmed = text.trim();
  return trimmed === '?' ? ['Invalid imm expression: ?', 'Unsupported operand: ?'] : [];
}

function parseAluOperand(text: string): Z80Operand | undefined {
  const trimmed = text.trim();
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
  const memory = /^\(HL\)$/i.exec(trimmed);
  if (memory) {
    return { kind: 'reg-indirect', register: 'hl' };
  }

  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return undefined;
  }

  const register = parseRegister8Operand(trimmed);
  if (register) {
    return register;
  }

  const half = parseIndexHalfRegister(trimmed);
  if (half) {
    return { kind: 'reg-half-index', register: half };
  }

  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression } : undefined;
}

function parseCbOperand(
  text: string,
):
  | Extract<Z80Operand, { readonly kind: 'reg8' }>
  | { readonly kind: 'reg-indirect'; readonly register: 'hl' }
  | Extract<Z80Operand, { readonly kind: 'indexed' }>
  | undefined {
  const trimmed = text.trim();
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
  if (/^\(HL\)$/i.test(trimmed)) {
    return { kind: 'reg-indirect', register: 'hl' };
  }
  return parseRegister8Operand(trimmed);
}

function parseRegister8Operand(
  text: string,
): Extract<Z80Operand, { readonly kind: 'reg8' }> | undefined {
  const trimmed = text.trim();
  if (/^(A|B|C|D|E|H|L)$/i.test(trimmed)) {
    return { kind: 'reg8', register: trimmed.toLowerCase() as Z80Register8 };
  }
  return undefined;
}

function parseRegister16Operand(
  text: string,
): Extract<Z80Operand, { readonly kind: 'reg16' }> | undefined {
  const trimmed = text.trim();
  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return { kind: 'reg16', register: trimmed.toLowerCase() as Z80Register16 };
  }
  return undefined;
}

function parseIncDecOperand(
  text: string,
): Extract<Z80Instruction, { readonly mnemonic: 'inc' | 'dec' }>['operand'] | undefined {
  const trimmed = text.trim();
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
  if (/^\(HL\)$/i.test(trimmed)) {
    return { kind: 'reg-indirect', register: 'hl' };
  }
  const register8 = parseRegister8Operand(trimmed);
  if (register8) {
    return register8;
  }
  const register16 = parseRegister16Operand(trimmed);
  if (register16) {
    return register16;
  }
  const index16 = parseIndexRegister16(trimmed);
  if (index16) {
    return { kind: 'reg16', register: index16 };
  }
  const half = parseIndexHalfRegister(trimmed);
  return half ? { kind: 'reg-half-index', register: half } : undefined;
}

function parseIndexRegister16(text: string): Z80IndexRegister16 | undefined {
  const trimmed = text.trim();
  return /^(IX|IY)$/i.test(trimmed) ? (trimmed.toLowerCase() as Z80IndexRegister16) : undefined;
}

function parseIndexHalfRegister(text: string): Z80IndexHalfRegister | undefined {
  const trimmed = text.trim();
  return /^(IXH|IXL|IYH|IYL)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80IndexHalfRegister)
    : undefined;
}

function halfIndexFamilyFromRegister(register: Z80IndexHalfRegister): Z80IndexRegister16 {
  return register.startsWith('ix') ? 'ix' : 'iy';
}

function parseSpecialRegister8(text: string): Z80SpecialRegister8 | undefined {
  const trimmed = text.trim();
  return /^(I|R)$/i.test(trimmed) ? (trimmed.toLowerCase() as Z80SpecialRegister8) : undefined;
}

function parseStackRegister(text: string): Z80StackRegister16 | undefined {
  const trimmed = text.trim();
  return /^(BC|DE|HL|AF|IX|IY)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80StackRegister16)
    : undefined;
}

function parseIndexedOperand(
  text: string,
): Extract<Z80Operand, { readonly kind: 'indexed' }> | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return undefined;
  }
  const inner = trimmed.slice(1, -1).trim();
  const match = /^(IX|IY)(?:\s*([+-])\s*(.+))?$/i.exec(inner);
  if (!match) {
    return undefined;
  }
  const register = (match[1] ?? '').toLowerCase() as Z80IndexRegister16;
  const sign = match[2];
  const displacementText = match[3] ?? '0';
  const parsed = parseExpression(sign === '-' ? `-${displacementText}` : displacementText);
  if (!parsed) {
    return undefined;
  }
  return { kind: 'indexed', register, displacement: parsed };
}

function parsePortOperand(
  text: string,
): { readonly kind: 'c' } | { readonly kind: 'imm'; readonly expression: Expression } | undefined {
  const trimmed = text.trim();
  if (/^\(C\)$/i.test(trimmed)) {
    return { kind: 'c' };
  }
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return undefined;
  }
  const expression = parseExpression(trimmed.slice(1, -1).trim());
  return expression ? { kind: 'imm', expression } : undefined;
}

function indexedBracketError(text: string): string | undefined {
  const match = /^\(?\s*((IX|IY)\s*\[\s*.+?\s*\])\s*\)?$/i.exec(text.trim());
  return match
    ? `Indexed memory operands use (ix+disp)/(iy+disp), not ${match[1]?.toLowerCase().replace(/\s+/g, '')}.`
    : undefined;
}

function parseAbsoluteBranchTarget(text: string): Expression | undefined {
  const trimmed = text.trim();
  if (/^\(.*\)$/.test(trimmed) || isRegisterName(trimmed)) {
    return undefined;
  }
  return parseExpression(trimmed);
}

function parseCondition(text: string): Z80InstructionCondition | undefined {
  const trimmed = text.trim();
  return /^(NZ|Z|NC|C|PO|PE|P|M)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80InstructionCondition)
    : undefined;
}

function parseJumpIndirect(text: string): Z80JumpIndirectRegister | undefined {
  const indirect = /^\((HL|IX|IY)\)$/i.exec(text.trim());
  return indirect ? ((indirect[1] ?? '').toLowerCase() as Z80JumpIndirectRegister) : undefined;
}

function isRegisterName(text: string): boolean {
  return /^(A|B|C|D|E|H|L|I|R|AF|BC|DE|HL|SP|IX|IY|IXH|IXL|IYH|IYL)$/i.test(text.trim());
}

type Z80InstructionCondition = Extract<
  Z80Instruction,
  { readonly condition: unknown }
>['condition'];

function parseConstantExpression(text: string): number | undefined {
  const expression = parseExpression(text);
  return expression ? constantExpressionValue(expression) : undefined;
}

function isRstVector(value: number | undefined): value is Z80RstVector {
  return (
    value === 0 ||
    value === 8 ||
    value === 16 ||
    value === 24 ||
    value === 32 ||
    value === 40 ||
    value === 48 ||
    value === 56
  );
}

function parseBitIndex(text: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined {
  const value = parseConstantExpression(text);
  return isBitIndex(value) ? value : undefined;
}

function isBitIndex(value: number | undefined): value is 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7
  );
}

function constantExpressionValue(expression: Expression): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'unary':
      return constantUnaryExpressionValue(expression);
    case 'binary':
      return constantBinaryExpressionValue(expression);
    case 'symbol':
    case 'current-location':
      return undefined;
  }
}

function constantUnaryExpressionValue(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
): number | undefined {
  const value = constantExpressionValue(expression.expression);
  if (value === undefined) {
    return undefined;
  }
  switch (expression.operator) {
    case '+':
      return value;
    case '-':
      return -value;
    case '~':
      return ~value;
  }
}

function constantBinaryExpressionValue(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
): number | undefined {
  const left = constantExpressionValue(expression.left);
  const right = constantExpressionValue(expression.right);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  switch (expression.operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return Math.trunc(left / right);
    case '%':
      return left % right;
    case '&':
      return left & right;
    case '^':
      return left ^ right;
    case '|':
      return left | right;
    case '<<':
      return left << right;
    case '>>':
      return left >> right;
  }
}

function splitInstructionOperands(text: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (
      (char === '"' || char === "'") &&
      !(char === "'" && quote === undefined && /[A-Za-z0-9_]/.test(text[index - 1] ?? ''))
    ) {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (quote) {
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      values.push(text.slice(start, index));
      start = index + 1;
    }
  }
  values.push(text.slice(start));
  return values.map((value) => value.trim());
}

function isSupportedLd(target: Z80Operand, source: Z80Operand): boolean {
  if (isSupportedSpecialRegisterLd(target, source)) {
    return true;
  }

  if (isSupportedHalfIndexLd(target, source)) {
    return true;
  }

  if (target.kind === 'reg8' && (source.kind === 'reg8' || source.kind === 'imm')) {
    return true;
  }

  if (target.kind === 'reg8' && source.kind === 'indexed') {
    return true;
  }

  if (target.kind === 'indexed' && (source.kind === 'reg8' || source.kind === 'imm')) {
    return true;
  }

  if (target.kind === 'reg16' && source.kind === 'imm') {
    return true;
  }

  if (target.kind === 'reg-index16' && source.kind === 'imm') {
    return true;
  }

  if (
    target.kind === 'reg16' &&
    target.register === 'sp' &&
    (source.kind === 'reg16' || source.kind === 'reg-index16') &&
    (source.register === 'hl' || source.register === 'ix' || source.register === 'iy')
  ) {
    return true;
  }

  if (
    (target.kind === 'reg8' || target.kind === 'reg16' || target.kind === 'reg-index16') &&
    source.kind === 'mem-abs' &&
    (target.kind !== 'reg8' || target.register === 'a')
  ) {
    return true;
  }

  if (
    target.kind === 'mem-abs' &&
    (source.kind === 'reg16' ||
      source.kind === 'reg-index16' ||
      (source.kind === 'reg8' && source.register === 'a'))
  ) {
    return true;
  }

  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'reg-indirect') {
    return true;
  }

  if (target.kind === 'reg-indirect' && source.kind === 'reg8' && source.register === 'a') {
    return true;
  }

  if (target.kind === 'reg-indirect' && target.register === 'hl' && source.kind === 'reg8') {
    return true;
  }

  return target.kind === 'reg8' && source.kind === 'reg-indirect' && source.register === 'hl';
}

function unsupportedLdReason(target: Z80Operand, source: Z80Operand): string | undefined {
  if (isMemoryOperand(target) && isMemoryOperand(source)) {
    return 'ld does not support memory-to-memory transfers';
  }

  if (hasHalfIndexRegister(target, source)) {
    if (!isSameIndexHalfFamily(target, source)) {
      return 'ld between IX* and IY* byte registers is not supported';
    }
    if (usesPlainHlCounterpart(target, source)) {
      return 'ld with IX*/IY* does not support plain H/L counterpart operands';
    }
  }

  if (
    target.kind === 'reg16' &&
    source.kind !== 'imm' &&
    (source.kind === 'reg16' || source.kind === 'reg-index16')
  ) {
    if (
      target.register === 'sp' &&
      (source.register === 'hl' || source.register === 'ix' || source.register === 'iy')
    ) {
      return undefined;
    }
    return 'ld rr, rr supports SP <- HL/IX/IY only';
  }

  return undefined;
}

function isSupportedSpecialRegisterLd(target: Z80Operand, source: Z80Operand): boolean {
  return (
    (target.kind === 'special8' && source.kind === 'reg8' && source.register === 'a') ||
    (target.kind === 'reg8' && target.register === 'a' && source.kind === 'special8')
  );
}

function isMemoryOperand(operand: Z80Operand): boolean {
  return (
    operand.kind === 'reg-indirect' || operand.kind === 'indexed' || operand.kind === 'mem-abs'
  );
}

function isSupportedHalfIndexLd(target: Z80Operand, source: Z80Operand): boolean {
  if (!hasHalfIndexRegister(target, source)) {
    return false;
  }

  if (!isSameIndexHalfFamily(target, source) || usesPlainHlCounterpart(target, source)) {
    return false;
  }

  return isHalfIndexCompatibleByteOperand(target) && isHalfIndexCompatibleByteOperand(source);
}

function hasHalfIndexRegister(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg-half-index' || source.kind === 'reg-half-index';
}

function isSameIndexHalfFamily(target: Z80Operand, source: Z80Operand): boolean {
  const targetFamily = indexHalfFamily(target);
  const sourceFamily = indexHalfFamily(source);
  return !targetFamily || !sourceFamily || targetFamily === sourceFamily;
}

function indexHalfFamily(operand: Z80Operand): 'ix' | 'iy' | undefined {
  if (operand.kind !== 'reg-half-index') {
    return undefined;
  }
  return operand.register.startsWith('ix') ? 'ix' : 'iy';
}

function usesPlainHlCounterpart(target: Z80Operand, source: Z80Operand): boolean {
  return (
    (target.kind === 'reg-half-index' && isPlainHlReg8(source)) ||
    (source.kind === 'reg-half-index' && isPlainHlReg8(target))
  );
}

function isPlainHlReg8(operand: Z80Operand): boolean {
  return operand.kind === 'reg8' && (operand.register === 'h' || operand.register === 'l');
}

function isHalfIndexCompatibleByteOperand(operand: Z80Operand): boolean {
  return (
    operand.kind === 'reg-half-index' ||
    (operand.kind === 'reg8' && operand.register !== 'h' && operand.register !== 'l')
  );
}
