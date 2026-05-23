import type { Asm80Artifact, WriteAsm80Options } from './types.js';
import type {
  LoweredAsmProgram,
  LoweredAsmItem,
  LoweredOperand,
  LoweredEaExpr,
} from '../lowering/loweredAsmTypes.js';
import { formatLoweredImmExpr, formatLoweredNumber } from '../lowering/loweredFormat.js';

const toHexByte = (value: number): string => value.toString(16).toUpperCase().padStart(2, '0');

function formatEaExpr(expr: LoweredEaExpr): string {
  switch (expr.kind) {
    case 'name':
      return expr.name;
    case 'imm':
      return formatLoweredImmExpr(expr.expr);
    case 'add':
      return `${formatEaExpr(expr.base)}+${formatLoweredImmExpr(expr.offset)}`;
    case 'sub':
      return `${formatEaExpr(expr.base)}-${formatLoweredImmExpr(expr.offset)}`;
    case 'field':
    case 'index':
    case 'layoutCast':
      throw new Error(`ASM80 emitter cannot format lowered EA kind "${expr.kind}".`);
  }
}

function formatOperand(op: LoweredOperand): string {
  switch (op.kind) {
    case 'reg':
      return op.name.toLowerCase();
    case 'imm':
      return formatLoweredImmExpr(op.expr);
    case 'ea':
      return formatEaExpr(op.expr);
    case 'mem':
      return `(${formatEaExpr(op.expr)})`;
    case 'portImm8':
      return `(${formatLoweredImmExpr(op.expr)})`;
    case 'portC':
      return '(c)';
  }
}

function formatItem(item: LoweredAsmItem): string[] {
  switch (item.kind) {
    case 'label':
      return [`${item.name}:`];
    case 'const':
      return [`${item.name} EQU ${formatLoweredImmExpr(item.value)}`];
    case 'comment':
      if (!item.text.trim()) return [];
      if (item.origin === 'user') return [`; ${item.text}`];
      return [`; AZM: ${item.text}`];
    case 'db':
      return [`DB ${item.values.map(formatLoweredImmExpr).join(', ')}`];
    case 'dw':
      return [`DW ${item.values.map(formatLoweredImmExpr).join(', ')}`];
    case 'ds':
      return [
        item.fill === undefined
          ? `DS ${formatLoweredImmExpr(item.size)}`
          : `DS ${formatLoweredImmExpr(item.size)}, ${formatLoweredImmExpr(item.fill)}`,
      ];
    case 'instr': {
      if (item.head === '@raw') {
        const bytes = item.bytes ?? [];
        if (bytes.length === 0) return [];
        const parts = bytes.map((b) => `$${toHexByte(b & 0xff)}`);
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
export function writeAsm80(program: LoweredAsmProgram, opts?: WriteAsm80Options): Asm80Artifact {
  const lineEnding = opts?.lineEnding ?? '\n';
  const lines: string[] = [];
  lines.push('; AZM lowered ASM80 output');

  for (const block of program.blocks) {
    lines.push('');
    lines.push(`ORG ${formatLoweredNumber(block.origin)}`);
    for (const item of block.items) {
      lines.push(...formatItem(item));
    }
  }

  return { kind: 'asm80', text: lines.join(lineEnding) + lineEnding };
}
