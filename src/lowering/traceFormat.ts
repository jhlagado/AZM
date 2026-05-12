import type { AsmOperandNode, EaExprNode, ImmExprNode } from '../frontend/ast.js';

export const toHexByte = (n: number): string =>
  `$${(n & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;

export const toHexWord = (n: number): string =>
  `$${(n & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;

export const formatImmExprForAsm = (expr: ImmExprNode): string => {
  switch (expr.kind) {
    case 'ImmLiteral':
      return toHexWord(expr.value);
    case 'ImmName':
      return expr.name;
    case 'ImmSizeof':
      return 'sizeof(...)';
    case 'ImmOffsetof':
      return 'offsetof(...)';
    case 'ImmUnary':
      return `${expr.op}${formatImmExprForAsm(expr.expr)}`;
    case 'ImmBinary':
      return `${formatImmExprForAsm(expr.left)} ${expr.op} ${formatImmExprForAsm(expr.right)}`;
    default:
      return 'imm';
  }
};

export const formatEaExprForAsm = (ea: EaExprNode): string => {
  switch (ea.kind) {
    case 'EaName':
      return ea.name;
    case 'EaImm':
      return formatImmExprForAsm(ea.expr);
    case 'EaField':
      return `${formatEaExprForAsm(ea.base)}.${ea.field}`;
    case 'EaAdd':
      return `${formatEaExprForAsm(ea.base)} + ${formatImmExprForAsm(ea.offset)}`;
    case 'EaSub':
      return `${formatEaExprForAsm(ea.base)} - ${formatImmExprForAsm(ea.offset)}`;
    case 'EaIndex': {
      let idx = '';
      switch (ea.index.kind) {
        case 'IndexImm':
          idx = formatImmExprForAsm(ea.index.value);
          break;
        case 'IndexReg8':
        case 'IndexReg16':
          idx = ea.index.reg;
          break;
        case 'IndexMemHL':
          idx = '(HL)';
          break;
        case 'IndexMemIxIy':
          idx = ea.index.disp
            ? `${ea.index.base}${ea.index.disp.kind === 'ImmUnary' ? '' : '+'}${formatImmExprForAsm(ea.index.disp)}`
            : ea.index.base;
          break;
        case 'IndexEa':
          idx = formatEaExprForAsm(ea.index.expr);
          break;
      }
      return `${formatEaExprForAsm(ea.base)}[${idx}]`;
    }
    default:
      return 'ea';
  }
};

export const formatAsmOperandForTrace = (operand: AsmOperandNode): string => {
  switch (operand.kind) {
    case 'Reg':
      return operand.name;
    case 'Imm':
      return formatImmExprForAsm(operand.expr);
    case 'Ea':
      return formatEaExprForAsm(operand.expr);
    case 'Mem':
      return `(${formatEaExprForAsm(operand.expr)})`;
    case 'PortC':
      return '(C)';
    case 'PortImm8':
      return `(${formatImmExprForAsm(operand.expr)})`;
    default:
      return '?';
  }
};

export const formatAsmInstrForTrace = (head: string, operands: AsmOperandNode[]): string => {
  const lowerHead = head.toLowerCase();
  if (operands.length === 0) return lowerHead;
  return `${lowerHead} ${operands.map(formatAsmOperandForTrace).join(', ')}`;
};

export const formatFixupSymbolExpr = (baseLower: string, addend: number): string => {
  if (addend === 0) return baseLower;
  if (addend > 0) return `${baseLower} + ${addend}`;
  return `${baseLower} - ${Math.abs(addend)}`;
};

const jpCondFromOpcode = (opcode: number): string | undefined => {
  switch (opcode & 0xff) {
    case 0xc2:
      return 'NZ';
    case 0xca:
      return 'Z';
    case 0xd2:
      return 'NC';
    case 0xda:
      return 'C';
    case 0xe2:
      return 'PO';
    case 0xea:
      return 'PE';
    case 0xf2:
      return 'P';
    case 0xfa:
      return 'M';
    default:
      return undefined;
  }
};

const callCondFromOpcode = (opcode: number): string | undefined => {
  switch (opcode & 0xff) {
    case 0xc4:
      return 'NZ';
    case 0xcc:
      return 'Z';
    case 0xd4:
      return 'NC';
    case 0xdc:
      return 'C';
    case 0xe4:
      return 'PO';
    case 0xec:
      return 'PE';
    case 0xf4:
      return 'P';
    case 0xfc:
      return 'M';
    default:
      return undefined;
  }
};

export const formatAbs16FixupAsm = (opcode: number, baseLower: string, addend: number): string => {
  const sym = formatFixupSymbolExpr(baseLower, addend);
  switch (opcode & 0xff) {
    case 0x01:
      return `ld BC, ${sym}`;
    case 0x11:
      return `ld DE, ${sym}`;
    case 0x21:
      return `ld HL, ${sym}`;
    case 0x31:
      return `ld SP, ${sym}`;
    case 0x2a:
      return `ld HL, (${sym})`;
    case 0x3a:
      return `ld A, (${sym})`;
    case 0x22:
      return `ld (${sym}), HL`;
    case 0x32:
      return `ld (${sym}), A`;
    case 0xc3:
      return `jp ${sym}`;
    case 0xcd:
      return `call ${sym}`;
    default: {
      const jpCc = jpCondFromOpcode(opcode);
      if (jpCc) return `jp ${jpCc}, ${sym}`;
      const callCc = callCondFromOpcode(opcode);
      if (callCc) return `call ${callCc}, ${sym}`;
      return `db ${toHexByte(opcode)}, lo(${baseLower}), hi(${baseLower})`;
    }
  }
};

export const formatAbs16FixupEdAsm = (
  opcode2: number,
  baseLower: string,
  addend: number,
): string => {
  const sym = formatFixupSymbolExpr(baseLower, addend);
  switch (opcode2 & 0xff) {
    case 0x4b:
      return `ld BC, (${sym})`;
    case 0x5b:
      return `ld DE, (${sym})`;
    case 0x7b:
      return `ld SP, (${sym})`;
    case 0x43:
      return `ld (${sym}), BC`;
    case 0x53:
      return `ld (${sym}), DE`;
    case 0x73:
      return `ld (${sym}), SP`;
    default:
      return `db $ED, ${toHexByte(opcode2)}, lo(${baseLower}), hi(${baseLower})`;
  }
};

export const formatAbs16FixupPrefixedAsm = (
  prefix: number,
  opcode2: number,
  baseLower: string,
  addend: number,
): string => {
  const sym = formatFixupSymbolExpr(baseLower, addend);
  const reg16 = prefix === 0xdd ? 'IX' : prefix === 0xfd ? 'IY' : undefined;
  if (!reg16) {
    return `db ${toHexByte(prefix)}, ${toHexByte(opcode2)}, lo(${baseLower}), hi(${baseLower})`;
  }
  switch (opcode2 & 0xff) {
    case 0x21:
      return `ld ${reg16}, ${sym}`;
    case 0x2a:
      return `ld ${reg16}, (${sym})`;
    case 0x22:
      return `ld (${sym}), ${reg16}`;
    default:
      return `db ${toHexByte(prefix)}, ${toHexByte(opcode2)}, lo(${baseLower}), hi(${baseLower})`;
  }
};

export const formatIxDisp = (disp: number): string => {
  const hex = Math.abs(disp).toString(16).padStart(2, '0');
  const sign = disp >= 0 ? '+' : '-';
  return `${sign}$${hex}`;
};
