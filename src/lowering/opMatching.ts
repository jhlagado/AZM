import type { AsmOperandNode, EaExprNode, ImmExprNode, OpDeclNode, OpMatcherNode } from '../frontend/ast.js';

type OpMatchingContext = {
  /** 8-bit register names for matching. */
  reg8: Set<string>;
  /** True when operand uses IX/IY indexed memory form. */
  isIxIyIndexedMem: (operand: AsmOperandNode) => boolean;
  /** Flattens dotted EA; `undefined` if not expressible as dotted. */
  flattenEaDottedName: (ea: EaExprNode) => string | undefined;
  /** True for declared enum names. */
  isEnumName: (name: string) => boolean;
  /** Normalizes fixed tokens for overload keys. */
  normalizeFixedToken: (operand: AsmOperandNode) => string | undefined;
  /** Maps condition name to opcode; `undefined` if unknown. */
  conditionOpcodeFromName: (name: string) => number | undefined;
  /** Best-effort imm evaluation. */
  evalImmNoDiag: (expr: ImmExprNode) => number | undefined;
  /** Infers memory operand width in bytes; `undefined` if unknown. */
  inferMemWidth: (operand: AsmOperandNode) => number | undefined;
};

type MatcherSpecificity = 'x_more_specific' | 'y_more_specific' | 'equal';
type OverloadSpecificity = 'x_wins' | 'y_wins' | 'equal' | 'incomparable';

export type OpOverloadSelection =
  | {
      kind: 'arity_mismatch';
      /** Candidate overloads. */
      overloads: OpDeclNode[];
      /** Rendered arity signatures for diagnostics. */
      signatures: string[];
    }
  | {
      kind: 'no_match';
      /** Candidate overloads. */
      overloads: OpDeclNode[];
      /** Per-operand mismatch notes. */
      mismatchDetails: string[];
    }
  | {
      kind: 'ambiguous';
      /** Competing overloads. */
      overloads: OpDeclNode[];
      /** Rendered definitions for diagnostics. */
      definitions: string[];
    }
  | {
      kind: 'selected';
      /** Chosen overload. */
      overload: OpDeclNode;
    };

const fitsImm8 = (value: number): boolean => value >= -0x80 && value <= 0xff;
const fitsImm16 = (value: number): boolean => value >= -0x8000 && value <= 0xffff;

export function createOpMatchingHelpers(ctx: OpMatchingContext) {
  const enumImmExprFromOperand = (op: AsmOperandNode): ImmExprNode | undefined => {
    switch (op.kind) {
      case 'Imm':
        return op.expr;
      case 'Reg':
        return { kind: 'ImmName', span: op.span, name: op.name };
      case 'Ea': {
        const name = ctx.flattenEaDottedName(op.expr);
        if (!name || !ctx.isEnumName(name)) return undefined;
        return { kind: 'ImmName', span: op.span, name };
      }
      default:
        return undefined;
    }
  };

  const matcherMatchesOperand = (matcher: OpMatcherNode, operand: AsmOperandNode): boolean => {
    switch (matcher.kind) {
      case 'MatcherReg8':
        return operand.kind === 'Reg' && ctx.reg8.has(operand.name.toUpperCase());
      case 'MatcherReg16':
        return (
          operand.kind === 'Reg' &&
          (operand.name.toUpperCase() === 'BC' ||
            operand.name.toUpperCase() === 'DE' ||
            operand.name.toUpperCase() === 'HL' ||
            operand.name.toUpperCase() === 'SP')
        );
      case 'MatcherIdx16':
        return ctx.isIxIyIndexedMem(operand);
      case 'MatcherCc': {
        const token = ctx.normalizeFixedToken(operand);
        return token !== undefined && ctx.conditionOpcodeFromName(token) !== undefined;
      }
      case 'MatcherImm8': {
        const expr = enumImmExprFromOperand(operand);
        if (!expr) return false;
        const v = ctx.evalImmNoDiag(expr);
        return v !== undefined && fitsImm8(v);
      }
      case 'MatcherImm16': {
        const expr = enumImmExprFromOperand(operand);
        if (!expr) return false;
        const v = ctx.evalImmNoDiag(expr);
        return v !== undefined && fitsImm16(v);
      }
      case 'MatcherEa':
        return operand.kind === 'Ea';
      case 'MatcherMem8': {
        if (operand.kind !== 'Mem') return false;
        const width = ctx.inferMemWidth(operand);
        return width === undefined ? true : width === 1;
      }
      case 'MatcherMem16': {
        if (operand.kind !== 'Mem') return false;
        const width = ctx.inferMemWidth(operand);
        return width === undefined ? true : width === 2;
      }
      case 'MatcherFixed': {
        const got = ctx.normalizeFixedToken(operand);
        return got !== undefined && got === matcher.token.toUpperCase();
      }
      default:
        return false;
    }
  };

  const fixedTokenBeatsClassMatcher = (
    fixed: Extract<OpMatcherNode, { kind: 'MatcherFixed' }>,
    other: OpMatcherNode,
    operand: AsmOperandNode,
  ): boolean => {
    const fixedToken = fixed.token.toUpperCase();
    switch (other.kind) {
      case 'MatcherReg8':
        return operand.kind === 'Reg' && operand.name.toUpperCase() === fixedToken && ctx.reg8.has(fixedToken);
      case 'MatcherReg16':
        return (
          operand.kind === 'Reg' &&
          operand.name.toUpperCase() === fixedToken &&
          (fixedToken === 'BC' || fixedToken === 'DE' || fixedToken === 'HL' || fixedToken === 'SP')
        );
      case 'MatcherCc':
        return ctx.conditionOpcodeFromName(fixedToken) !== undefined;
      default:
        return false;
    }
  };

  const compareMatcherSpecificity = (
    matcherX: OpMatcherNode,
    matcherY: OpMatcherNode,
    operand: AsmOperandNode,
  ): MatcherSpecificity => {
    if (matcherX.kind === matcherY.kind) return 'equal';

    if (matcherX.kind === 'MatcherFixed' && fixedTokenBeatsClassMatcher(matcherX, matcherY, operand)) {
      return 'x_more_specific';
    }
    if (matcherY.kind === 'MatcherFixed' && fixedTokenBeatsClassMatcher(matcherY, matcherX, operand)) {
      return 'y_more_specific';
    }

    if (matcherX.kind === 'MatcherImm8' && matcherY.kind === 'MatcherImm16') {
      const expr = enumImmExprFromOperand(operand);
      if (!expr) return 'equal';
      const value = ctx.evalImmNoDiag(expr);
      return value !== undefined && fitsImm8(value) ? 'x_more_specific' : 'equal';
    }
    if (matcherX.kind === 'MatcherImm16' && matcherY.kind === 'MatcherImm8') {
      const expr = enumImmExprFromOperand(operand);
      if (!expr) return 'equal';
      const value = ctx.evalImmNoDiag(expr);
      return value !== undefined && fitsImm8(value) ? 'y_more_specific' : 'equal';
    }
    if (
      (matcherX.kind === 'MatcherMem8' || matcherX.kind === 'MatcherMem16') &&
      matcherY.kind === 'MatcherEa' &&
      operand.kind === 'Mem'
    ) {
      return 'x_more_specific';
    }
    if (
      matcherX.kind === 'MatcherEa' &&
      (matcherY.kind === 'MatcherMem8' || matcherY.kind === 'MatcherMem16') &&
      operand.kind === 'Mem'
    ) {
      return 'y_more_specific';
    }

    return 'equal';
  };

  const compareOpOverloadSpecificity = (
    overloadX: OpDeclNode,
    overloadY: OpDeclNode,
    operands: AsmOperandNode[],
  ): OverloadSpecificity => {
    let xBetter = 0;
    let yBetter = 0;
    for (let i = 0; i < operands.length; i++) {
      const xMatcher = overloadX.params[i]!.matcher;
      const yMatcher = overloadY.params[i]!.matcher;
      const cmp = compareMatcherSpecificity(xMatcher, yMatcher, operands[i]!);
      if (cmp === 'x_more_specific') xBetter++;
      if (cmp === 'y_more_specific') yBetter++;
    }
    if (xBetter > 0 && yBetter === 0) return 'x_wins';
    if (yBetter > 0 && xBetter === 0) return 'y_wins';
    if (xBetter === 0 && yBetter === 0) return 'equal';
    return 'incomparable';
  };

  const selectMostSpecificOpOverload = (
    candidates: OpDeclNode[],
    operands: AsmOperandNode[],
  ): OpDeclNode | undefined => {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0]!;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      let beatsAll = true;
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const cmp = compareOpOverloadSpecificity(candidate, candidates[j]!, operands);
        if (cmp !== 'x_wins') {
          beatsAll = false;
          break;
        }
      }
      if (beatsAll) return candidate;
    }
    return undefined;
  };

  const formatOpMatcher = (matcher: OpMatcherNode): string => {
    switch (matcher.kind) {
      case 'MatcherReg8':
        return 'reg8';
      case 'MatcherReg16':
        return 'reg16';
      case 'MatcherIdx16':
        return 'idx16';
      case 'MatcherCc':
        return 'cc';
      case 'MatcherImm8':
        return 'imm8';
      case 'MatcherImm16':
        return 'imm16';
      case 'MatcherEa':
        return 'ea';
      case 'MatcherMem8':
        return 'mem8';
      case 'MatcherMem16':
        return 'mem16';
      case 'MatcherFixed':
        return matcher.token;
      default:
        return 'unknown';
    }
  };

  const formatImmExprForOpDiag = (expr: ImmExprNode): string => {
    switch (expr.kind) {
      case 'ImmLiteral':
        return String(expr.value);
      case 'ImmName':
        return expr.name;
      case 'ImmSizeof':
        return 'sizeof(...)';
      case 'ImmOffsetof':
        return 'offsetof(...)';
      case 'ImmUnary':
        return `${expr.op}${formatImmExprForOpDiag(expr.expr)}`;
      case 'ImmBinary':
        return `${formatImmExprForOpDiag(expr.left)} ${expr.op} ${formatImmExprForOpDiag(expr.right)}`;
      default:
        return 'imm';
    }
  };

  const formatEaExprForOpDiag = (ea: EaExprNode): string => {
    switch (ea.kind) {
      case 'EaName':
        return ea.name;
      case 'EaImm':
        return `(${formatImmExprForOpDiag(ea.expr)})`;
      case 'EaField':
        return `${formatEaExprForOpDiag(ea.base)}.${ea.field}`;
      case 'EaAdd':
        return `${formatEaExprForOpDiag(ea.base)} + ${formatImmExprForOpDiag(ea.offset)}`;
      case 'EaSub':
        return `${formatEaExprForOpDiag(ea.base)} - ${formatImmExprForOpDiag(ea.offset)}`;
      case 'EaIndex': {
        let idx = '';
        switch (ea.index.kind) {
          case 'IndexImm':
            idx = formatImmExprForOpDiag(ea.index.value);
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
              ? `${ea.index.base}${ea.index.disp.kind === 'ImmUnary' ? '' : '+'}${formatImmExprForOpDiag(ea.index.disp)}`
              : ea.index.base;
            break;
          case 'IndexEa':
            idx = formatEaExprForOpDiag(ea.index.expr);
            break;
        }
        return `${formatEaExprForOpDiag(ea.base)}[${idx}]`;
      }
      default:
        return 'ea';
    }
  };

  const formatAsmOperandForOpDiag = (operand: AsmOperandNode): string => {
    switch (operand.kind) {
      case 'Reg':
        return operand.name;
      case 'Imm':
        return formatImmExprForOpDiag(operand.expr);
      case 'Ea':
        return formatEaExprForOpDiag(operand.expr);
      case 'Mem':
        return `(${formatEaExprForOpDiag(operand.expr)})`;
      case 'PortC':
        return '(C)';
      case 'PortImm8':
        return `(${formatImmExprForOpDiag(operand.expr)})`;
      default:
        return '?';
    }
  };

  const formatOpSignature = (opDecl: OpDeclNode): string => {
    const params = opDecl.params.map((p) => `${p.name}: ${formatOpMatcher(p.matcher)}`).join(', ');
    return `${opDecl.name}(${params})`;
  };

  const formatOpDefinitionForDiag = (opDecl: OpDeclNode): string =>
    `${formatOpSignature(opDecl)} (${opDecl.span.file}:${opDecl.span.start.line})`;

  const matcherMismatchReason = (matcher: OpMatcherNode, operand: AsmOperandNode): string => {
    const got = formatAsmOperandForOpDiag(operand);
    switch (matcher.kind) {
      case 'MatcherReg8':
        return `expects reg8, got ${got}`;
      case 'MatcherReg16':
        return `expects reg16, got ${got}`;
      case 'MatcherIdx16':
        return `expects IX/IY indexed memory operand, got ${got}`;
      case 'MatcherCc':
        return 'expects condition token NZ/Z/NC/C/PO/PE/P/M, got ' + got;
      case 'MatcherImm8': {
        const expr = enumImmExprFromOperand(operand);
        if (!expr) return `expects imm8, got ${got}`;
        const value = ctx.evalImmNoDiag(expr);
        if (value === undefined) return `expects imm8, got ${got}`;
        if (!fitsImm8(value)) return `expects imm8 (-128..255), got ${got}`;
        return `expects imm8, got ${got}`;
      }
      case 'MatcherImm16': {
        const expr = enumImmExprFromOperand(operand);
        if (!expr) return `expects imm16, got ${got}`;
        const value = ctx.evalImmNoDiag(expr);
        if (value === undefined) return `expects imm16, got ${got}`;
        if (!fitsImm16(value)) return `expects imm16 (-32768..65535), got ${got}`;
        return `expects imm16, got ${got}`;
      }
      case 'MatcherEa':
        return `expects ea, got ${got}`;
      case 'MatcherMem8': {
        if (operand.kind !== 'Mem') return `expects mem8 dereference, got ${got}`;
        const width = ctx.inferMemWidth(operand);
        if (width !== undefined && width !== 1) return `expects mem8 dereference, got mem${width * 8}`;
        return `expects mem8 dereference, got ${got}`;
      }
      case 'MatcherMem16': {
        if (operand.kind !== 'Mem') return `expects mem16 dereference, got ${got}`;
        const width = ctx.inferMemWidth(operand);
        if (width !== undefined && width !== 2) return `expects mem16 dereference, got mem${width * 8}`;
        return `expects mem16 dereference, got ${got}`;
      }
      case 'MatcherFixed':
        return `expects ${matcher.token}, got ${got}`;
      default:
        return `operand mismatch: expected ${formatOpMatcher(matcher)}, got ${got}`;
    }
  };

  const firstOpOverloadMismatchReason = (
    opDecl: OpDeclNode,
    operands: AsmOperandNode[],
  ): string | undefined => {
    for (let i = 0; i < opDecl.params.length && i < operands.length; i++) {
      const param = opDecl.params[i]!;
      const operand = operands[i]!;
      if (matcherMatchesOperand(param.matcher, operand)) continue;
      return `${param.name}: ${matcherMismatchReason(param.matcher, operand)}`;
    }
    return undefined;
  };

  const selectOpOverload = (
    overloads: OpDeclNode[],
    operands: AsmOperandNode[],
  ): OpOverloadSelection => {
    const arityMatches = overloads.filter((candidate) => candidate.params.length === operands.length);
    if (arityMatches.length === 0) {
      return {
        kind: 'arity_mismatch',
        overloads,
        signatures: overloads.map((candidate) => formatOpSignature(candidate)),
      };
    }

    const matches = arityMatches.filter((candidate) => {
      if (candidate.params.length !== operands.length) return false;
      for (let idx = 0; idx < candidate.params.length; idx++) {
        const param = candidate.params[idx]!;
        const arg = operands[idx]!;
        if (!matcherMatchesOperand(param.matcher, arg)) return false;
      }
      return true;
    });
    if (matches.length === 0) {
      return {
        kind: 'no_match',
        overloads: arityMatches,
        mismatchDetails: arityMatches.map((candidate) => {
          const reason = firstOpOverloadMismatchReason(candidate, operands);
          return `${formatOpDefinitionForDiag(candidate)}${reason ? ` ; ${reason}` : ''}`;
        }),
      };
    }

    const selected = selectMostSpecificOpOverload(matches, operands);
    if (!selected) {
      return {
        kind: 'ambiguous',
        overloads: matches,
        definitions: matches.map((candidate) => formatOpDefinitionForDiag(candidate)),
      };
    }

    return { kind: 'selected', overload: selected };
  };

  return {
    matcherMatchesOperand,
    selectMostSpecificOpOverload,
    selectOpOverload,
    formatAsmOperandForOpDiag,
    formatOpSignature,
    formatOpDefinitionForDiag,
    firstOpOverloadMismatchReason,
  };
}
