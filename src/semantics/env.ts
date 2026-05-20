import type { Diagnostic, DiagnosticId } from '../diagnosticTypes.js';
import { DiagnosticIds } from '../diagnosticTypes.js';
import type {
  EnumDeclNode,
  ImmExprNode,
  AsmInstructionNode,
  AsmOperandNode,
  ProgramNode,
  TypeDeclNode,
  UnionDeclNode,
  SourceSpan,
} from '../frontend/ast.js';
import { offsetOfPathInTypeExpr, sizeOfTypeExpr } from './layout.js';
import { visitDeclTree } from './declVisitor.js';
import { diagSemanticsError } from './semanticsDiagnostics.js';

function reportImmArithmeticError(
  diagnostics: Diagnostic[] | undefined,
  expr: { span: { file: string; start: { line: number; column: number } } },
  id: DiagnosticId,
  message: string,
): void {
  diagnostics?.push({
    id,
    severity: 'error',
    message,
    file: expr.span.file,
    line: expr.span.start.line,
    column: expr.span.start.column,
  });
}

/**
 * Immutable compilation environment for PR2: resolved constant and enum member values.
 */
export interface CompileEnv {
  /**
   * Map of constant name -> evaluated numeric value.
   *
   * Values are plain JavaScript numbers; interpretation (imm8/imm16 wrapping, etc.) happens at use sites.
   */
  consts: Map<string, number>;

  /**
   * Map of enum member name -> evaluated numeric value.
   *
   * PR2 supports only implicit 0..N-1 member values.
   */
  enums: Map<string, number>;

  /**
   * Map of type name -> type declaration.
   *
   * PR3 uses this for layout calculation for module-scope `var` declarations.
   */
  types: Map<string, TypeDeclNode | UnionDeclNode>;

  asmEquExprs?: Map<string, { expr: ImmExprNode; currentLocation?: number }>;
}

const diag = diagSemanticsError;

/**
 * Evaluate an `imm` expression using values from the provided environment.
 *
 * PR2 implementation note:
 * - Supports literals, names, unary `+ - ~`, and binary `* / % + - & ^ | << >>`.
 * - Division/modulo use JavaScript semantics and truncate toward zero.
 */
export function evalImmExpr(
  expr: ImmExprNode,
  env: CompileEnv,
  diagnostics?: Diagnostic[],
  options?: { currentLocation?: number },
): number | undefined {
  const unqualifiedEnumCandidates = (name: string): string[] => {
    if (name.includes('.')) return [];
    const suffix = `.${name}`;
    const matches: string[] = [];
    for (const key of env.enums.keys()) {
      if (key.endsWith(suffix)) matches.push(key);
    }
    return matches;
  };

  switch (expr.kind) {
    case 'ImmLiteral':
      return expr.value;
    case 'ImmCurrentLocation':
      return options?.currentLocation;
    case 'ImmName': {
      const fromConst = env.consts.get(expr.name) ?? env.consts.get(expr.name.toLowerCase());
      if (fromConst !== undefined) return fromConst;
      const fromEnum = env.enums.get(expr.name);
      if (fromEnum !== undefined) return fromEnum;
      const enumMatches = unqualifiedEnumCandidates(expr.name);
      if (enumMatches.length > 0 && diagnostics) {
        const message =
          enumMatches.length === 1
            ? `Unqualified enum member "${expr.name}" is not allowed; use "${enumMatches[0]}".`
            : `Unqualified enum member "${expr.name}" is ambiguous; use one of: ${enumMatches.join(', ')}.`;
        diagnostics.push({
          id: DiagnosticIds.SemanticsError,
          severity: 'error',
          message,
          file: expr.span.file,
          line: expr.span.start.line,
          column: expr.span.start.column,
        });
      }
      return undefined;
    }
    case 'ImmSizeof': {
      return sizeOfTypeExpr(expr.typeExpr, env, diagnostics);
    }
    case 'ImmOffsetof': {
      return offsetOfPathInTypeExpr(
        expr.typeExpr,
        expr.path,
        env,
        (inner) => evalImmExpr(inner, env, diagnostics, options),
        diagnostics,
      );
    }
    case 'ImmUnary': {
      const v = evalImmExpr(expr.expr, env, diagnostics, options);
      if (v === undefined) return undefined;
      switch (expr.op) {
        case '+':
          return +v;
        case '-':
          return -v;
        case '~':
          return ~v;
      }
      // Exhaustive (future-proof)
      return undefined;
    }
    case 'ImmBinary': {
      const l = evalImmExpr(expr.left, env, diagnostics, options);
      const r = evalImmExpr(expr.right, env, diagnostics, options);
      if (l === undefined || r === undefined) return undefined;
      switch (expr.op) {
        case '*':
          return l * r;
        case '/':
          if (r === 0) {
            reportImmArithmeticError(
              diagnostics,
              expr,
              DiagnosticIds.ImmDivideByZero,
              'Divide by zero in imm expression.',
            );
            return undefined;
          }
          return (l / r) | 0;
        case '%':
          if (r === 0) {
            reportImmArithmeticError(
              diagnostics,
              expr,
              DiagnosticIds.ImmModuloByZero,
              'Modulo by zero in imm expression.',
            );
            return undefined;
          }
          return l % r;
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '&':
          return l & r;
        case '^':
          return l ^ r;
        case '|':
          return l | r;
        case '<<':
          return l << r;
        case '>>':
          return l >> r;
      }
      return undefined;
    }
  }
}

type CollectedDecls = {
  types: Array<TypeDeclNode | UnionDeclNode>;
  enums: EnumDeclNode[];
  consts: AsmEquDecl[];
};

type AsmEquDecl = {
  kind: string;
  span: SourceSpan;
  name: string;
  exported?: boolean;
  value?: ImmExprNode;
  expr?: ImmExprNode;
};

function isAsmEquDecl(item: {
  kind: string;
  name?: unknown;
  value?: unknown;
  expr?: unknown;
}): item is AsmEquDecl {
  return (
    (item.kind === 'ClassicEqu' || item.kind === 'ClassicEquDecl' || item.kind === 'EquDecl') &&
    typeof item.name === 'string' &&
    ((item.value as { kind?: unknown } | undefined)?.kind !== undefined ||
      (item.expr as { kind?: unknown } | undefined)?.kind !== undefined)
  );
}

function constValueExpr(item: AsmEquDecl): ImmExprNode {
  const expr = item.value ?? item.expr;
  if (!expr) throw new Error('ASM equ directive is missing an expression.');
  return expr;
}

function containsCurrentLocation(expr: ImmExprNode): boolean {
  switch (expr.kind) {
    case 'ImmCurrentLocation':
      return true;
    case 'ImmUnary':
      return containsCurrentLocation(expr.expr);
    case 'ImmBinary':
      return containsCurrentLocation(expr.left) || containsCurrentLocation(expr.right);
    default:
      return false;
  }
}

function isAsmDirectiveItem(item: { kind: string }): boolean {
  return (
    item.kind === 'ClassicOrg' ||
    item.kind === 'ClassicEqu' ||
    item.kind === 'ClassicRawData' ||
    item.kind === 'AsmLabel' ||
    item.kind === 'AsmInstruction'
  );
}

function isIndexedOperand(op: AsmOperandNode | undefined): boolean {
  if (!op) return false;
  const expr = op.kind === 'Mem' ? op.expr : op.kind === 'Ea' ? op.expr : undefined;
  return expr?.kind === 'EaIndex' && expr.index.kind === 'IndexMemIxIy';
}

function reg(op: AsmOperandNode | undefined): string | undefined {
  if (!op) return undefined;
  if (op.kind === 'Reg') return op.name.toUpperCase();
  if (op.kind === 'Imm' && op.expr.kind === 'ImmName') return op.expr.name.toUpperCase();
  return undefined;
}

function asmInstructionSize(item: AsmInstructionNode): number {
  const head = item.head.toLowerCase();
  const ops = item.operands;
  const r0 = reg(ops[0]);
  const r1 = reg(ops[1]);
  const indexed = isIndexedOperand(ops[0]) || isIndexedOperand(ops[1]);
  const ixiyReg = (name: string | undefined): boolean =>
    name === 'IX' || name === 'IY' || name === 'IXH' || name === 'IXL' || name === 'IYH' || name === 'IYL';

  if (
    [
      'cpi',
      'cpir',
      'ldi',
      'ldir',
      'lddr',
      'ini',
      'outi',
      'neg',
      'reti',
      'retn',
      'rld',
    ].includes(head)
  ) {
    return 2;
  }
  if (['nop', 'ccf', 'cpl', 'daa', 'exx', 'rlca', 'rrca', 'rla', 'rra', 'scf'].includes(head)) {
    return 1;
  }
  if (head === 'jr' || head === 'djnz') return 2;
  if (head === 'call') return 3;
  if (head === 'jp') return ops[0]?.kind === 'Mem' && ixiyReg(regFromMem(ops[0])) ? 2 : ops[0]?.kind === 'Mem' ? 1 : 3;
  if (head === 'ret') return 1;
  if (head === 'rst') return 1;
  if (head === 'push' || head === 'pop') return ixiyReg(r0) ? 2 : 1;
  if (head === 'ex') return ixiyReg(r1) || indexed ? 2 : 1;
  if (head === 'in' || head === 'out') return 2;
  if (['bit', 'res', 'set', 'rl', 'rr', 'rlc', 'rrc', 'sla', 'srl'].includes(head)) return indexed ? 4 : 2;
  if (head === 'inc' || head === 'dec') return indexed ? 3 : ixiyReg(r0) ? 2 : 1;
  if (['add', 'adc', 'sbc'].includes(head)) {
    if (r0 === 'HL' && r1) return 1;
    if ((r0 === 'IX' || r0 === 'IY') && r1) return 2;
    if (r0 === 'HL') return 2;
    if (indexed) return 3;
    return ops[1]?.kind === 'Imm' || (ops.length === 1 && ops[0]?.kind === 'Imm') ? 2 : 1;
  }
  if (['sub', 'and', 'or', 'xor', 'cp'].includes(head)) return indexed ? 3 : ops[0]?.kind === 'Imm' ? 2 : 1;
  if (head === 'ld') {
    if (indexed) return ops[0]?.kind === 'Imm' || ops[1]?.kind === 'Imm' ? 4 : 3;
    if (ops[0]?.kind === 'Mem' || ops[1]?.kind === 'Mem') {
      const memOp = ops[0]?.kind === 'Mem' ? ops[0] : ops[1];
      const memReg = ops[0]?.kind === 'Mem' ? r1 : r0;
      const indirectReg = regFromMem(memOp);
      if (indirectReg) {
        if (memReg === 'A' && (indirectReg === 'BC' || indirectReg === 'DE')) return 1;
        if (indirectReg === 'HL') return 1;
      }
      return memReg && ['BC', 'DE', 'SP', 'IX', 'IY'].includes(memReg) ? 4 : 3;
    }
    if (ixiyReg(r0) || ixiyReg(r1)) return ops[1]?.kind === 'Imm' ? 4 : 2;
    if (ops[1]?.kind === 'Imm') return r0 && ['BC', 'DE', 'HL', 'SP'].includes(r0) ? 3 : 2;
    return 1;
  }
  return 1;
}

function regFromMem(op: AsmOperandNode | undefined): string | undefined {
  if (!op || op.kind !== 'Mem') return undefined;
  if (op.expr.kind === 'EaName') return op.expr.name.toUpperCase();
  if (op.expr.kind === 'EaIndex' && op.expr.index.kind === 'IndexMemIxIy') return op.expr.index.base;
  return undefined;
}

function asmRawDataSize(item: { directive?: string; values?: unknown[]; size?: ImmExprNode }, env: CompileEnv): number {
  const values = item.values ?? [];
  if (item.directive === 'ds') {
    return item.size ? (evalImmExpr(item.size, env) ?? 0) : 0;
  }
  if (item.directive === 'dw') return values.length * 2;
  if (item.directive === 'cstr') return asmStringLength(values[0]) + 1;
  if (item.directive === 'pstr') return asmStringLength(values[0]) + 1;
  if (item.directive === 'istr') return asmStringLength(values[0]);
  return values.reduce<number>((size, value) => size + asmStringLength(value, 1), 0);
}

function asmStringLength(value: unknown, fallback = 0): number {
  if (typeof value === 'string') return value.length;
  if (
    value &&
    typeof value === 'object' &&
    'kind' in value &&
    (value.kind === 'ClassicString' || value.kind === 'StringLiteral' || value.kind === 'RawString')
  ) {
    const text =
      'value' in value && typeof value.value === 'string'
        ? value.value
        : 'text' in value && typeof value.text === 'string'
          ? value.text
          : undefined;
    return text?.length ?? fallback;
  }
  return fallback;
}

function seedAsmCurrentLocationEquates(program: ProgramNode, env: CompileEnv): void {
  for (const mf of program.files) {
    if (!mf.items.some((item) => isAsmDirectiveItem(item))) continue;
    const scratchEnv: CompileEnv = { ...env, consts: new Map(env.consts) };
    let current = 0;
    for (const item of mf.items) {
      const kind = (item as { kind: string }).kind;
      switch (kind) {
        case 'ClassicOrg': {
          const expr = (item as { value?: ImmExprNode; expr?: ImmExprNode }).value ?? (item as { expr?: ImmExprNode }).expr;
          const value = expr ? evalImmExpr(expr, scratchEnv) : undefined;
          if (value !== undefined) current = value;
          break;
        }
        case 'AsmLabel': {
          const label = item as { name: string };
          scratchEnv.consts.set(label.name, current);
          scratchEnv.consts.set(label.name.toLowerCase(), current);
          break;
        }
        case 'ClassicEqu': {
          const equ = item as AsmEquDecl;
          const expr = equ.value ?? equ.expr;
          if (expr) {
            env.asmEquExprs?.set(equ.name, { expr, currentLocation: current });
            env.asmEquExprs?.set(equ.name.toLowerCase(), { expr, currentLocation: current });
            const value = containsCurrentLocation(expr)
              ? evalImmExpr(expr, scratchEnv, undefined, { currentLocation: current })
              : evalImmExpr(expr, scratchEnv);
            if (value !== undefined) {
              env.consts.set(equ.name, value);
              env.consts.set(equ.name.toLowerCase(), value);
              scratchEnv.consts.set(equ.name, value);
              scratchEnv.consts.set(equ.name.toLowerCase(), value);
            }
          }
          break;
        }
        case 'ClassicRawData':
          {
            const raw = item as { name?: string; directive?: string; values?: unknown[]; size?: ImmExprNode };
            if (raw.name) {
              scratchEnv.consts.set(raw.name, current);
              scratchEnv.consts.set(raw.name.toLowerCase(), current);
            }
            current += asmRawDataSize(raw, scratchEnv);
          }
          break;
        case 'AsmInstruction':
          current += asmInstructionSize(item as AsmInstructionNode);
          break;
      }
    }
  }
}

/**
 * Build the compile environment by resolving module-scope enums and assembler equates.
 *
 * Implementation note:
 * - Resolves names across all parsed module files (entry + imports) in program order.
 * - Equates may reference previously defined constants and enum members (forward refs not yet supported).
 */
export function buildEnv(
  program: ProgramNode,
  diagnostics: Diagnostic[],
): CompileEnv {
  const consts = new Map<string, number>();
  const asmEquExprs = new Map<string, { expr: ImmExprNode; currentLocation?: number }>();
  const enums = new Map<string, number>();
  const types = new Map<string, TypeDeclNode | UnionDeclNode>();

  if (program.files.length === 0) {
    diag(diagnostics, program.entryFile, 'No module files to compile.');
    return {
      consts,
      enums,
      types,
    };
  }

  const collectedByFile = new Map<string, CollectedDecls>();
  for (const mf of program.files) {
    const collected: CollectedDecls = {
      types: [],
      enums: [],
      consts: [],
    };
    visitDeclTree(mf.items, (item) => {
      if (item.kind === 'TypeDecl' || item.kind === 'UnionDecl') {
        collected.types.push(item);
        return;
      }
      if (item.kind === 'EnumDecl') {
        collected.enums.push(item);
        return;
      }
      if (isAsmEquDecl(item)) {
        collected.consts.push(item);
      }
    });
    collectedByFile.set(mf.path, collected);
  }

  const globalLower = new Map<string, { kind: string; name: string; file: string }>();
  const claim = (kind: string, name: string, file: string): boolean => {
    const k = name.toLowerCase();
    const prev = globalLower.get(k);
    if (prev) {
      diag(diagnostics, file, `Name "${name}" collides with ${prev.kind} "${prev.name}".`);
      return false;
    }
    globalLower.set(k, { kind, name, file });
    return true;
  };

  for (const mf of program.files) {
    const collected = collectedByFile.get(mf.path);
    if (!collected) continue;
    for (const item of collected.types) {
      const kind = item.kind === 'TypeDecl' ? 'type' : 'union';
      const name = item.name;
      if (!claim(kind, name, item.span.file)) continue;
      types.set(name, item);
    }
  }

  for (const mf of program.files) {
    const collected = collectedByFile.get(mf.path);
    if (!collected) continue;
    for (const e of collected.enums) {
      // Note: enum names are tracked for collision purposes even though PR4 does not use them.
      claim('enum', e.name, e.span.file);

      for (let idx = 0; idx < e.members.length; idx++) {
        const name = e.members[idx]!;
        const qualifiedName = `${e.name}.${name}`;
        if (!claim('enum member', qualifiedName, e.span.file)) continue;
        enums.set(qualifiedName, idx);
      }
    }
  }

  const env: CompileEnv = {
    consts,
    enums,
    types,
    asmEquExprs,
  };

  seedAsmCurrentLocationEquates(program, env);

  for (const mf of program.files) {
    const collected = collectedByFile.get(mf.path);
    if (!collected) continue;
    for (const item of collected.consts) {
      if (types.has(item.name)) {
        diag(diagnostics, item.span.file, `Equate name "${item.name}" collides with a type name.`);
        continue;
      }
      if (!claim('equate', item.name, item.span.file)) continue;
      if (consts.has(item.name.toLowerCase())) continue;

      const expr = constValueExpr(item);
      if (!asmEquExprs.has(item.name)) asmEquExprs.set(item.name, { expr });
      if (!asmEquExprs.has(item.name.toLowerCase())) {
        asmEquExprs.set(item.name.toLowerCase(), { expr });
      }
      const beforeDiagnostics = diagnostics.length;
      const v = evalImmExpr(expr, env, diagnostics);
      if (v === undefined) {
        diagnostics.splice(beforeDiagnostics);
        continue;
      }
      consts.set(item.name, v);
      consts.set(item.name.toLowerCase(), v);
    }
  }

  return env;
}
