import type { Asm80Artifact, WriteAsm80Options } from './types.js';
import type {
  LoweredAsmProgram,
  LoweredAsmItem,
  LoweredImmExpr,
  LoweredOperand,
  LoweredEaExpr,
} from '../lowering/loweredAsmTypes.js';

const toHex = (value: number, width: number): string =>
  value.toString(16).toUpperCase().padStart(width, '0');

const formatNumber = (value: number): string => {
  if (value < 0) {
    const abs = Math.abs(value);
    return `-$${toHex(abs, abs > 0xff ? 4 : 2)}`;
  }
  return `$${toHex(value, value > 0xff ? 4 : 2)}`;
};

function formatImmExpr(expr: LoweredImmExpr): string {
  switch (expr.kind) {
    case 'literal':
      return formatNumber(expr.value);
    case 'symbol': {
      if (expr.addend === 0) return expr.name;
      const addend = formatNumber(Math.abs(expr.addend));
      return expr.addend > 0 ? `${expr.name}+${addend}` : `${expr.name}-${addend}`;
    }
    case 'unary':
      return `${expr.op}${formatImmExpr(expr.expr)}`;
    case 'binary':
      return `(${formatImmExpr(expr.left)} ${expr.op} ${formatImmExpr(expr.right)})`;
    case 'opaque':
      return expr.text;
  }
}

function formatEaExpr(expr: LoweredEaExpr): string {
  switch (expr.kind) {
    case 'name':
      return expr.name;
    case 'imm':
      return formatImmExpr(expr.expr);
    case 'add':
      return `${formatEaExpr(expr.base)}+${formatImmExpr(expr.offset)}`;
    case 'sub':
      return `${formatEaExpr(expr.base)}-${formatImmExpr(expr.offset)}`;
    case 'field':
    case 'index':
    case 'reinterpret':
      throw new Error(`ASM80 emitter cannot format lowered EA kind "${expr.kind}".`);
  }
}

function formatOperand(op: LoweredOperand): string {
  switch (op.kind) {
    case 'reg':
      return op.name.toLowerCase();
    case 'imm':
      return formatImmExpr(op.expr);
    case 'ea':
      return formatEaExpr(op.expr);
    case 'mem':
      return `(${formatEaExpr(op.expr)})`;
    case 'portImm8':
      return `(${formatImmExpr(op.expr)})`;
    case 'portC':
      return '(c)';
  }
}

function formatItem(item: LoweredAsmItem): string[] {
  switch (item.kind) {
    case 'label':
      return [`${item.name}:`];
    case 'const':
      return [`${item.name} EQU ${formatImmExpr(item.value)}`];
    case 'comment':
      if (!item.text.trim()) return [];
      if (item.origin === 'user') return [`; ${item.text}`];
      return [`; ZAX: ${item.text}`];
    case 'db':
      return [`DB ${item.values.map(formatImmExpr).join(', ')}`];
    case 'dw':
      return [`DW ${item.values.map(formatImmExpr).join(', ')}`];
    case 'ds':
      return [
        item.fill === undefined
          ? `DS ${formatImmExpr(item.size)}`
          : `DS ${formatImmExpr(item.size)}, ${formatImmExpr(item.fill)}`,
      ];
    case 'instr': {
      if (item.head === '@raw') {
        const bytes = item.bytes ?? [];
        if (bytes.length === 0) return [];
        const parts = bytes.map((b) => `$${toHex(b & 0xff, 2)}`);
        return [`DB ${parts.join(', ')}`];
      }
      const head = item.head.toLowerCase();
      const ops = item.operands.map(formatOperand);
      return [ops.length ? `${head} ${ops.join(', ')}` : head];
    }
  }
}

/**
 * Emit ASM80-compatible source from a placed lowered assembly program.
 */
export function writeAsm80(
  program: LoweredAsmProgram,
  opts?: WriteAsm80Options,
): Asm80Artifact {
  const lineEnding = opts?.lineEnding ?? '\n';
  const lines: string[] = [];
  lines.push('; ZAX lowered ASM80 output');

  for (const block of program.blocks) {
    lines.push('');
    lines.push(`ORG ${formatNumber(block.origin)}`);
    for (const item of block.items) {
      lines.push(...formatItem(item));
    }
  }

  return { kind: 'asm80', text: lines.join(lineEnding) + lineEnding };
}
