import type { Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
  SourceSpan,
} from '../frontend/ast.js';
import { flattenEaDottedName } from '../lowering/asmUtils.js';
import { diagEncodeAt } from '../lowering/loweringDiagnostics.js';
import type { CompileEnv } from '../semantics/env.js';
import { evalImmExpr } from '../semantics/env.js';
import type { EncoderFamily } from './encoderRegistry.js';
import { getEncoderRegistryEntry } from './encoderRegistry.js';
import { encodeAluInstruction } from './encodeAlu.js';
import { encodeBitOpsInstruction } from './encodeBitOps.js';
import { encodeControlInstruction } from './encodeControl.js';
import { encodeCoreOpsInstruction } from './encodeCoreOps.js';
import { encodeIoInstruction } from './encodeIo.js';
import { encodeLdInstruction } from './encodeLd.js';

/** Pass-through to {@link diagEncodeAt} for encoder submodules that take an instruction node. */
function diag(
  diagnostics: Diagnostic[],
  node: { span: { file: string; start: { line: number; column: number } } },
  message: string,
): void {
  diagEncodeAt(diagnostics, node.span as SourceSpan, message);
}

function immValue(op: AsmOperandNode, env: CompileEnv): number | undefined {
  if (op.kind === 'Imm') return evalImmExpr(op.expr, env);
  if (op.kind !== 'Ea') return undefined;
  const dotted = flattenEaDottedName(op.expr);
  if (!dotted || !env.enums.has(dotted)) return undefined;
  return evalImmExpr({ kind: 'ImmName', span: op.span, name: dotted }, env);
}

function portImmValue(op: AsmOperandNode, env: CompileEnv): number | undefined {
  if (op.kind !== 'PortImm8') return undefined;
  return evalImmExpr(op.expr, env);
}

function fitsImm8(value: number): boolean {
  return value >= -0x80 && value <= 0xff;
}

function fitsImm16(value: number): boolean {
  return value >= -0x8000 && value <= 0xffff;
}

function regName(op: AsmOperandNode): string | undefined {
  return op.kind === 'Reg' ? op.name.toUpperCase() : undefined;
}

function registerTokenName(op: AsmOperandNode): string | undefined {
  const name =
    op.kind === 'Reg'
      ? op.name.toUpperCase()
      : op.kind === 'Imm' && op.expr.kind === 'ImmName'
        ? op.expr.name.toUpperCase()
        : undefined;
  if (!name) return undefined;
  switch (name) {
    case 'A':
    case 'B':
    case 'C':
    case 'D':
    case 'E':
    case 'H':
    case 'L':
    case 'BC':
    case 'DE':
    case 'HL':
    case 'SP':
    case 'AF':
    case 'IX':
    case 'IY':
    case 'IXH':
    case 'IXL':
    case 'IYH':
    case 'IYL':
      return name;
    default:
      return undefined;
  }
}

function reg8Code(name: string): number | undefined {
  switch (name.toUpperCase()) {
    case 'B':
      return 0;
    case 'C':
      return 1;
    case 'D':
      return 2;
    case 'E':
      return 3;
    case 'H':
      return 4;
    case 'L':
      return 5;
    case 'A':
      return 7;
    default:
      return undefined;
  }
}

function isLegacyHLReg8(name: string | undefined): boolean {
  return name === 'H' || name === 'L';
}

function indexedReg8(
  op: AsmOperandNode,
): { prefix: number; code: number; display: 'IXH' | 'IXL' | 'IYH' | 'IYL' } | undefined {
  const n = regName(op);
  switch (n) {
    case 'IXH':
      return { prefix: 0xdd, code: 4, display: 'IXH' };
    case 'IXL':
      return { prefix: 0xdd, code: 5, display: 'IXL' };
    case 'IYH':
      return { prefix: 0xfd, code: 4, display: 'IYH' };
    case 'IYL':
      return { prefix: 0xfd, code: 5, display: 'IYL' };
    default:
      return undefined;
  }
}

function isMemHL(op: AsmOperandNode): boolean {
  return op.kind === 'Mem' && op.expr.kind === 'EaName' && op.expr.name.toUpperCase() === 'HL';
}

function isMemRegName(op: AsmOperandNode, reg: string): boolean {
  return op.kind === 'Mem' && op.expr.kind === 'EaName' && op.expr.name.toUpperCase() === reg;
}

function isReg16TransferName(name: string | undefined): boolean {
  return (
    name === 'BC' ||
    name === 'DE' ||
    name === 'HL' ||
    name === 'SP' ||
    name === 'AF' ||
    name === 'IX' ||
    name === 'IY'
  );
}

function memIndexed(
  op: AsmOperandNode,
  env: CompileEnv,
  _diagnostics?: Diagnostic[],
): { prefix: number; disp: number } | undefined {
  if (op.kind !== 'Mem') return undefined;
  const ea = op.expr;
  const encodeBaseDisp = (
    baseExpr: EaExprNode,
    dispExpr: ImmExprNode,
    negate = false,
  ): { prefix: number; disp: number } | undefined => {
    if (baseExpr.kind !== 'EaName') return undefined;
    const base = baseExpr.name.toUpperCase();
    if (base !== 'IX' && base !== 'IY') return undefined;
    const rawDisp = evalImmExpr(dispExpr, env);
    if (rawDisp === undefined) return undefined;
    const prefix = base === 'IX' ? 0xdd : 0xfd;
    return { prefix, disp: negate ? -rawDisp : rawDisp };
  };

  if (ea.kind === 'EaIndex' && ea.index.kind === 'IndexImm') {
    return encodeBaseDisp(ea.base, ea.index.value);
  }
  if (ea.kind === 'EaName') {
    const base = ea.name.toUpperCase();
    if (base === 'IX') return { prefix: 0xdd, disp: 0 };
    if (base === 'IY') return { prefix: 0xfd, disp: 0 };
  }
  if (ea.kind === 'EaAdd') {
    return encodeBaseDisp(ea.base, ea.offset);
  }
  if (ea.kind === 'EaSub') {
    return encodeBaseDisp(ea.base, ea.offset, true);
  }
  return undefined;
}

function memAbs16(op: AsmOperandNode, env: CompileEnv): number | undefined {
  if (op.kind !== 'Mem') return undefined;

  const evalEaAbs16 = (ea: EaExprNode): number | undefined => {
    switch (ea.kind) {
      case 'EaName':
        return evalImmExpr(
          {
            kind: 'ImmName',
            span: ea.span,
            name: ea.name,
          },
          env,
        );
      case 'EaImm':
        return evalImmExpr(ea.expr, env);
      case 'EaAdd': {
        const base = evalEaAbs16(ea.base);
        const delta = evalImmExpr(ea.offset, env);
        if (base === undefined || delta === undefined) return undefined;
        return base + delta;
      }
      case 'EaSub': {
        const base = evalEaAbs16(ea.base);
        const delta = evalImmExpr(ea.offset, env);
        if (base === undefined || delta === undefined) return undefined;
        return base - delta;
      }
      default:
        return undefined;
    }
  };

  return evalEaAbs16(op.expr);
}

function conditionName(op: AsmOperandNode): string | undefined {
  if (op.kind === 'Reg') return op.name.toUpperCase();
  if (op.kind === 'Imm' && op.expr.kind === 'ImmName') return op.expr.name.toUpperCase();
  return undefined;
}

function symbolicImmBaseName(op: AsmOperandNode, env: CompileEnv): string | undefined {
  if (op.kind !== 'Imm') return undefined;
  const expr = op.expr;
  if (expr.kind === 'ImmName') return expr.name.toUpperCase();
  if (expr.kind !== 'ImmBinary') return undefined;
  if (expr.op !== '+' && expr.op !== '-') return undefined;

  const leftName = expr.left.kind === 'ImmName' ? expr.left.name.toUpperCase() : undefined;
  const rightName = expr.right.kind === 'ImmName' ? expr.right.name.toUpperCase() : undefined;

  if (leftName) {
    const right = evalImmExpr(expr.right, env);
    if (right !== undefined) return leftName;
  }
  if (expr.op === '+' && rightName) {
    const left = evalImmExpr(expr.left, env);
    if (left !== undefined) return rightName;
  }
  return undefined;
}

function jpConditionOpcode(name: string): number | undefined {
  switch (name) {
    case 'NZ':
      return 0xc2;
    case 'Z':
      return 0xca;
    case 'NC':
      return 0xd2;
    case 'C':
      return 0xda;
    case 'PO':
      return 0xe2;
    case 'PE':
      return 0xea;
    case 'P':
      return 0xf2;
    case 'M':
      return 0xfa;
    default:
      return undefined;
  }
}

function jrConditionOpcode(name: string): number | undefined {
  switch (name) {
    case 'NZ':
      return 0x20;
    case 'Z':
      return 0x28;
    case 'NC':
      return 0x30;
    case 'C':
      return 0x38;
    default:
      return undefined;
  }
}

function callConditionOpcode(name: string): number | undefined {
  switch (name) {
    case 'NZ':
      return 0xc4;
    case 'Z':
      return 0xcc;
    case 'NC':
      return 0xd4;
    case 'C':
      return 0xdc;
    case 'PO':
      return 0xe4;
    case 'PE':
      return 0xec;
    case 'P':
      return 0xf4;
    case 'M':
      return 0xfc;
    default:
      return undefined;
  }
}

function retConditionOpcode(name: string): number | undefined {
  switch (name) {
    case 'NZ':
      return 0xc0;
    case 'Z':
      return 0xc8;
    case 'NC':
      return 0xd0;
    case 'C':
      return 0xd8;
    case 'PO':
      return 0xe0;
    case 'PE':
      return 0xe8;
    case 'P':
      return 0xf0;
    case 'M':
      return 0xf8;
    default:
      return undefined;
  }
}

function encodeFamilyInstruction(
  family: EncoderFamily,
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
): Uint8Array | undefined {
  switch (family) {
    case 'control':
      return encodeControlInstruction(node, env, diagnostics, {
        diag,
        immValue,
        registerTokenName,
        conditionName,
        symbolicImmBaseName,
        fitsImm16,
        isMemRegName,
        retConditionOpcode,
        callConditionOpcode,
        jpConditionOpcode,
        jrConditionOpcode,
      });
    case 'alu':
      return encodeAluInstruction(node, env, diagnostics, {
        diag,
        regName,
        immValue,
        indexedReg8,
        reg8Code,
        fitsImm8,
        isMemHL,
        memIndexed: (op, env) => memIndexed(op, env, diagnostics),
      });
    case 'io':
      return encodeIoInstruction(node, env, diagnostics, {
        diag,
        regName,
        immValue,
        portImmValue,
        indexedReg8,
        reg8Code,
        fitsImm8,
      });
    case 'ld':
      return encodeLdInstruction(node, env, diagnostics, {
        diag,
        regName,
        immValue,
        indexedReg8,
        reg8Code,
        fitsImm8,
        fitsImm16,
        memAbs16,
        memIndexed: (op, env) => memIndexed(op, env, diagnostics),
        isMemHL,
        isMemRegName,
        isReg16TransferName,
        isLegacyHLReg8,
      });
    case 'core':
      return encodeCoreOpsInstruction(node, env, diagnostics, {
        diag,
        regName,
        indexedReg8,
        reg8Code,
        isMemHL,
        memIndexed: (op, env) => memIndexed(op, env, diagnostics),
      });
    case 'bit':
      return encodeBitOpsInstruction(node, env, diagnostics, {
        diag,
        regName,
        immValue,
        indexedReg8,
        reg8Code,
        isMemHL,
        memIndexed: (op, env) => memIndexed(op, env, diagnostics),
      });
  }
}

/**
 * Encode a single `asm` instruction node into Z80 machine-code bytes.
 *
 * - Immediate operands may be `imm` expressions (const/enum names and operators), evaluated via the env.
 * - Unsupported forms append an error diagnostic and return `undefined`.
 */
export function encodeInstruction(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
): Uint8Array | undefined {
  const diagnosticsBefore = diagnostics.length;
  const head = node.head.toLowerCase();
  const entry = getEncoderRegistryEntry(head);
  if (!entry) {
    diagEncodeAt(diagnostics, node.span, `Unsupported instruction: ${node.head}`);
    return undefined;
  }

  if (entry.kind === 'zero') {
    if (node.operands.length === 0) return entry.bytes;
    diagEncodeAt(diagnostics, node.span, `${head} expects no operands`);
    return undefined;
  }

  const encoded = encodeFamilyInstruction(entry.family, node, env, diagnostics);
  if (encoded) return encoded;

  if (entry.fallback === 'none') return undefined;
  if (diagnostics.length > diagnosticsBefore) return undefined;

  const arityMessage = entry.arityDiagnostic(head, node.operands.length);
  if (entry.fallback === 'arity-short-circuit' && arityMessage === undefined) return undefined;
  if (arityMessage !== undefined) {
    diagEncodeAt(diagnostics, node.span, arityMessage);
    return undefined;
  }

  diagEncodeAt(diagnostics, node.span, `${head} has unsupported operand form`);
  return undefined;
}
