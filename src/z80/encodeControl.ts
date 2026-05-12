import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';

export type ControlEncodeContext = {
  diag: (
    diagnostics: Diagnostic[],
    node: { span: { file: string; start: { line: number; column: number } } },
    message: string,
  ) => void;
  immValue: (op: AsmOperandNode, env: CompileEnv) => number | undefined;
  registerTokenName: (op: AsmOperandNode) => string | undefined;
  conditionName: (op: AsmOperandNode) => string | undefined;
  symbolicImmBaseName: (op: AsmOperandNode, env: CompileEnv) => string | undefined;
  fitsImm16: (value: number) => boolean;
  isMemRegName: (op: AsmOperandNode, reg: string) => boolean;
  retConditionOpcode: (name: string) => number | undefined;
  callConditionOpcode: (name: string) => number | undefined;
  jpConditionOpcode: (name: string) => number | undefined;
  jrConditionOpcode: (name: string) => number | undefined;
};

export function encodeControlInstruction(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: ControlEncodeContext,
): Uint8Array | undefined {
  const head = node.head.toLowerCase();
  const ops = node.operands;

  if (head === 'ret' && ops.length === 0) return Uint8Array.of(0xc9);
  if (head === 'ret' && ops.length === 1) {
    const cc = ctx.conditionName(ops[0]!);
    const opcode = cc ? ctx.retConditionOpcode(cc) : undefined;
    if (opcode === undefined) {
      ctx.diag(diagnostics, node, `ret cc expects a valid condition code`);
      return undefined;
    }
    return Uint8Array.of(opcode);
  }
  if (head === 'ret') {
    ctx.diag(diagnostics, node, `ret expects no operands or one condition code`);
    return undefined;
  }

  if (head === 'call' && ops.length === 1) {
    if (ops[0]!.kind === 'Mem') {
      ctx.diag(diagnostics, node, `call does not support indirect targets; use imm16`);
      return undefined;
    }
    if (ctx.registerTokenName(ops[0]!) !== undefined && ctx.immValue(ops[0]!, env) === undefined) {
      ctx.diag(diagnostics, node, `call does not support register targets; use imm16`);
      return undefined;
    }
    const cc = ctx.conditionName(ops[0]!) ?? ctx.symbolicImmBaseName(ops[0]!, env);
    if (cc && ctx.callConditionOpcode(cc) !== undefined) {
      ctx.diag(diagnostics, node, `call cc, nn expects two operands (cc, nn)`);
      return undefined;
    }
    const n = ctx.immValue(ops[0]!, env);
    if (n === undefined || !ctx.fitsImm16(n)) {
      ctx.diag(diagnostics, node, `call expects imm16`);
      return undefined;
    }
    return Uint8Array.of(0xcd, n & 0xff, (n >> 8) & 0xff);
  }
  if (head === 'call' && ops.length === 2) {
    const cc = ctx.conditionName(ops[0]!);
    const opcode = cc ? ctx.callConditionOpcode(cc) : undefined;
    if (opcode === undefined) {
      ctx.diag(diagnostics, node, `call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M`);
      return undefined;
    }
    if (ops[1]!.kind === 'Mem') {
      ctx.diag(diagnostics, node, `call cc, nn does not support indirect targets`);
      return undefined;
    }
    const n = ctx.immValue(ops[1]!, env);
    if (n === undefined || !ctx.fitsImm16(n)) {
      ctx.diag(diagnostics, node, `call cc, nn expects imm16`);
      return undefined;
    }
    return Uint8Array.of(opcode, n & 0xff, (n >> 8) & 0xff);
  }
  if (head === 'call') {
    ctx.diag(diagnostics, node, `call expects one operand (nn) or two operands (cc, nn)`);
    return undefined;
  }

  if (head === 'djnz' && ops.length === 1) {
    if (ops[0]!.kind === 'Mem') {
      ctx.diag(diagnostics, node, `djnz does not support indirect targets; expects disp8`);
      return undefined;
    }
    if (ctx.registerTokenName(ops[0]!) !== undefined && ctx.immValue(ops[0]!, env) === undefined) {
      ctx.diag(diagnostics, node, `djnz does not support register targets; expects disp8`);
      return undefined;
    }
    const n = ctx.immValue(ops[0]!, env);
    if (n === undefined || n < -128 || n > 127) {
      ctx.diag(diagnostics, node, `djnz expects disp8`);
      return undefined;
    }
    return Uint8Array.of(0x10, n & 0xff);
  }
  if (head === 'djnz') {
    ctx.diag(diagnostics, node, `djnz expects one operand (disp8)`);
    return undefined;
  }

  if (head === 'jp' && ops.length === 1) {
    if (ops[0]!.kind === 'Mem') {
      if (ctx.isMemRegName(ops[0]!, 'HL')) return Uint8Array.of(0xe9);
      if (ctx.isMemRegName(ops[0]!, 'IX')) return Uint8Array.of(0xdd, 0xe9);
      if (ctx.isMemRegName(ops[0]!, 'IY')) return Uint8Array.of(0xfd, 0xe9);
      ctx.diag(diagnostics, node, `jp indirect form supports (hl), (ix), or (iy) only`);
      return undefined;
    }
    const jpReg = ctx.registerTokenName(ops[0]!);
    const jpImm = ctx.immValue(ops[0]!, env);
    if (jpReg !== undefined && jpImm === undefined) {
      if (jpReg === 'HL' || jpReg === 'IX' || jpReg === 'IY') {
        ctx.diag(
          diagnostics,
          node,
          `jp indirect form requires parentheses; use (hl), (ix), or (iy)`,
        );
        return undefined;
      }
      ctx.diag(diagnostics, node, `jp does not support register targets; use imm16`);
      return undefined;
    }

    const cc = ctx.conditionName(ops[0]!) ?? ctx.symbolicImmBaseName(ops[0]!, env);
    if (cc && ctx.jpConditionOpcode(cc) !== undefined) {
      ctx.diag(diagnostics, node, `jp cc, nn expects two operands (cc, nn)`);
      return undefined;
    }
    const n = jpImm;
    if (n === undefined || !ctx.fitsImm16(n)) {
      ctx.diag(diagnostics, node, `jp expects imm16`);
      return undefined;
    }
    return Uint8Array.of(0xc3, n & 0xff, (n >> 8) & 0xff);
  }
  if (head === 'jp' && ops.length === 2) {
    const cc = ctx.conditionName(ops[0]!);
    const opcode = cc ? ctx.jpConditionOpcode(cc) : undefined;
    if (opcode === undefined) {
      ctx.diag(diagnostics, node, `jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M`);
      return undefined;
    }
    if (ops[1]!.kind === 'Mem') {
      ctx.diag(diagnostics, node, `jp cc, nn does not support indirect targets`);
      return undefined;
    }
    const n = ctx.immValue(ops[1]!, env);
    if (n === undefined || !ctx.fitsImm16(n)) {
      ctx.diag(diagnostics, node, `jp cc, nn expects imm16`);
      return undefined;
    }
    return Uint8Array.of(opcode, n & 0xff, (n >> 8) & 0xff);
  }
  if (head === 'jp') {
    ctx.diag(
      diagnostics,
      node,
      `jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)`,
    );
    return undefined;
  }

  if (head === 'jr' && ops.length === 1) {
    if (ops[0]!.kind === 'Mem') {
      ctx.diag(diagnostics, node, `jr does not support indirect targets; expects disp8`);
      return undefined;
    }
    if (ctx.registerTokenName(ops[0]!) !== undefined && ctx.immValue(ops[0]!, env) === undefined) {
      ctx.diag(diagnostics, node, `jr does not support register targets; expects disp8`);
      return undefined;
    }
    const cc = ctx.conditionName(ops[0]!) ?? ctx.symbolicImmBaseName(ops[0]!, env);
    if (cc && ctx.jrConditionOpcode(cc) !== undefined) {
      ctx.diag(diagnostics, node, `jr cc, disp expects two operands (cc, disp8)`);
      return undefined;
    }
    const n = ctx.immValue(ops[0]!, env);
    if (n === undefined || n < -128 || n > 127) {
      ctx.diag(diagnostics, node, `jr expects disp8`);
      return undefined;
    }
    return Uint8Array.of(0x18, n & 0xff);
  }
  if (head === 'jr' && ops.length === 2) {
    const cc = ctx.conditionName(ops[0]!);
    const opcode = cc ? ctx.jrConditionOpcode(cc) : undefined;
    if (opcode === undefined) {
      ctx.diag(diagnostics, node, `jr cc expects valid condition code NZ/Z/NC/C`);
      return undefined;
    }
    if (ops[1]!.kind === 'Mem') {
      ctx.diag(diagnostics, node, `jr cc, disp does not support indirect targets`);
      return undefined;
    }
    const n = ctx.immValue(ops[1]!, env);
    if (n === undefined || n < -128 || n > 127) {
      ctx.diag(diagnostics, node, `jr cc, disp expects disp8`);
      return undefined;
    }
    return Uint8Array.of(opcode, n & 0xff);
  }
  if (head === 'jr') {
    ctx.diag(diagnostics, node, `jr expects one operand (disp8) or two operands (cc, disp8)`);
    return undefined;
  }

  return undefined;
}
