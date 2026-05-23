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
import { containsCurrentLocation } from '../frontend/immExprUtils.js';
import { offsetPathInTypeExpr, sizeOfTypeExpr } from './layout.js';
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

export interface CompileEnv {
  /**
   * Map of equate name -> evaluated numeric value.
   *
   * Values are plain JavaScript numbers; interpretation (imm8/imm16 wrapping, etc.) happens at use sites.
   */
  equates: Map<string, number>;

  /**
   * Map of enum member name -> evaluated numeric value.
   */
  enums: Map<string, number>;

  /**
   * Map of type name -> type declaration.
   *
   * Layout declarations used by sizeof/offset and layout casts.
   */
  types: Map<string, TypeDeclNode | UnionDeclNode>;

  asmEquExprs?: Map<string, { expr: ImmExprNode; currentLocation?: number }>;
}

const diag = diagSemanticsError;

export function evalImmExpr(
  expr: ImmExprNode,
  env: CompileEnv,
  diagnostics?: Diagnostic[],
  options?: { currentLocation?: number },
): number | undefined {
  const hasUnqualifiedEnumMember = (name: string): boolean => {
    if (name.includes('.')) return false;
    const suffix = `.${name}`;
    for (const key of env.enums.keys()) {
      if (key.endsWith(suffix)) return true;
    }
    return false;
  };

  switch (expr.kind) {
    case 'ImmLiteral':
      return expr.value;
    case 'ImmCurrentLocation':
      return options?.currentLocation;
    case 'ImmName': {
      const fromConst = env.equates.get(expr.name) ?? env.equates.get(expr.name.toLowerCase());
      if (fromConst !== undefined) return fromConst;
      const fromEnum = env.enums.get(expr.name);
      if (fromEnum !== undefined) return fromEnum;
      if (diagnostics && hasUnqualifiedEnumMember(expr.name)) {
        diagnostics.push({
          id: DiagnosticIds.SemanticsError,
          severity: 'error',
          message: `Enum member "${expr.name}" must be qualified.`,
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
    case 'ImmOffset': {
      return offsetPathInTypeExpr(
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
  equates: AsmEquNodeLike[];
};

type AsmEquNodeLike = {
  kind: 'AsmEqu';
  span: SourceSpan;
  name: string;
  value?: ImmExprNode;
};

function isAsmEquNode(item: {
  kind: string;
  name?: unknown;
  value?: unknown;
}): item is AsmEquNodeLike {
  return (
    item.kind === 'AsmEqu' &&
    typeof item.name === 'string' &&
    (item.value as { kind?: unknown } | undefined)?.kind !== undefined
  );
}

function constValueExpr(item: AsmEquNodeLike): ImmExprNode {
  const expr = item.value;
  if (!expr) throw new Error('ASM equ directive is missing an expression.');
  return expr;
}

function isAsmDirectiveItem(item: { kind: string }): boolean {
  return (
    item.kind === 'AsmOrg' ||
    item.kind === 'AsmEqu' ||
    item.kind === 'AsmRawData' ||
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
    name === 'IX' ||
    name === 'IY' ||
    name === 'IXH' ||
    name === 'IXL' ||
    name === 'IYH' ||
    name === 'IYL';

  if (
    ['cpi', 'cpir', 'ldi', 'ldir', 'lddr', 'ini', 'outi', 'neg', 'reti', 'retn', 'rld'].includes(
      head,
    )
  ) {
    return 2;
  }
  if (['nop', 'ccf', 'cpl', 'daa', 'exx', 'rlca', 'rrca', 'rla', 'rra', 'scf'].includes(head)) {
    return 1;
  }
  if (head === 'jr' || head === 'djnz') return 2;
  if (head === 'call') return 3;
  if (head === 'jp')
    return ops[0]?.kind === 'Mem' && ixiyReg(regFromMem(ops[0]))
      ? 2
      : ops[0]?.kind === 'Mem'
        ? 1
        : 3;
  if (head === 'ret') return 1;
  if (head === 'rst') return 1;
  if (head === 'push' || head === 'pop') return ixiyReg(r0) ? 2 : 1;
  if (head === 'ex') return ixiyReg(r1) || indexed ? 2 : 1;
  if (head === 'in' || head === 'out') return 2;
  if (['bit', 'res', 'set', 'rl', 'rr', 'rlc', 'rrc', 'sla', 'srl'].includes(head))
    return indexed ? 4 : 2;
  if (head === 'inc' || head === 'dec') return indexed ? 3 : ixiyReg(r0) ? 2 : 1;
  if (['add', 'adc', 'sbc'].includes(head)) {
    if (r0 === 'HL' && r1) return 1;
    if ((r0 === 'IX' || r0 === 'IY') && r1) return 2;
    if (r0 === 'HL') return 2;
    if (indexed) return 3;
    return ops[1]?.kind === 'Imm' || (ops.length === 1 && ops[0]?.kind === 'Imm') ? 2 : 1;
  }
  if (['sub', 'and', 'or', 'xor', 'cp'].includes(head))
    return indexed ? 3 : ops[0]?.kind === 'Imm' ? 2 : 1;
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
  if (op.expr.kind === 'EaIndex' && op.expr.index.kind === 'IndexMemIxIy')
    return op.expr.index.base;
  return undefined;
}

function asmRawDataSize(
  item: { directive?: string; values?: unknown[]; size?: ImmExprNode },
  env: CompileEnv,
): number {
  const values = item.values ?? [];
  if (item.directive === 'ds') {
    if (!item.size) return 0;
    if (item.size.kind === 'ImmName') {
      const constValue =
        env.equates.get(item.size.name) ?? env.equates.get(item.size.name.toLowerCase());
      const enumValue = env.enums.get(item.size.name);
      if (constValue === undefined && enumValue === undefined) {
        const typeSize = sizeOfTypeExpr(
          { kind: 'TypeName', span: item.size.span, name: item.size.name },
          env,
          undefined,
        );
        if (typeSize !== undefined) return typeSize;
      }
    }
    return evalImmExpr(item.size, env) ?? 0;
  }
  if (item.directive === 'dw') return values.length * 2;
  if (item.directive === 'cstr') return asmStringLength(values[0]) + 1;
  if (item.directive === 'pstr') return asmStringLength(values[0]) + 1;
  if (item.directive === 'istr') return asmStringLength(values[0]);
  return values.reduce<number>((size, value) => size + asmStringLength(value, 1), 0);
}

function asmStringLength(value: unknown, fallback = 0): number {
  if (typeof value === 'string') return value.length;
  if (value && typeof value === 'object' && 'kind' in value && value.kind === 'AsmString') {
    return 'value' in value && typeof value.value === 'string' ? value.value.length : fallback;
  }
  return fallback;
}

function seedAsmCurrentLocationEquates(program: ProgramNode, env: CompileEnv): void {
  for (const mf of program.files) {
    if (!mf.items.some((item) => isAsmDirectiveItem(item))) continue;
    const scratchEnv: CompileEnv = { ...env, equates: new Map(env.equates) };
    let current = 0;
    for (const item of mf.items) {
      const kind = (item as { kind: string }).kind;
      switch (kind) {
        case 'AsmOrg': {
          const expr = (item as { value?: ImmExprNode }).value;
          const value = expr ? evalImmExpr(expr, scratchEnv) : undefined;
          if (value !== undefined) current = value;
          break;
        }
        case 'AsmLabel': {
          const label = item as { name: string };
          scratchEnv.equates.set(label.name, current);
          scratchEnv.equates.set(label.name.toLowerCase(), current);
          break;
        }
        case 'AsmEqu': {
          const equ = item as AsmEquNodeLike;
          if (env.types.has(equ.name)) break;
          const expr = equ.value;
          if (expr) {
            env.asmEquExprs?.set(equ.name, { expr, currentLocation: current });
            env.asmEquExprs?.set(equ.name.toLowerCase(), { expr, currentLocation: current });
            const value = containsCurrentLocation(expr)
              ? evalImmExpr(expr, scratchEnv, undefined, { currentLocation: current })
              : evalImmExpr(expr, scratchEnv);
            if (value !== undefined) {
              env.equates.set(equ.name, value);
              env.equates.set(equ.name.toLowerCase(), value);
              scratchEnv.equates.set(equ.name, value);
              scratchEnv.equates.set(equ.name.toLowerCase(), value);
            }
          }
          break;
        }
        case 'AsmRawData':
          {
            const raw = item as {
              name?: string;
              directive?: string;
              values?: unknown[];
              size?: ImmExprNode;
            };
            if (raw.name) {
              scratchEnv.equates.set(raw.name, current);
              scratchEnv.equates.set(raw.name.toLowerCase(), current);
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

export function buildEnv(program: ProgramNode, diagnostics: Diagnostic[]): CompileEnv {
  const equates = new Map<string, number>();
  const asmEquExprs = new Map<string, { expr: ImmExprNode; currentLocation?: number }>();
  const enums = new Map<string, number>();
  const types = new Map<string, TypeDeclNode | UnionDeclNode>();

  if (program.files.length === 0) {
    diag(diagnostics, program.entryFile, 'No source files to compile.');
    return {
      equates,
      enums,
      types,
    };
  }

  const collectedByFile = new Map<string, CollectedDecls>();
  for (const mf of program.files) {
    const collected: CollectedDecls = {
      types: [],
      enums: [],
      equates: [],
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
      if (isAsmEquNode(item)) {
        collected.equates.push(item);
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
    equates,
    enums,
    types,
    asmEquExprs,
  };

  seedAsmCurrentLocationEquates(program, env);

  for (const mf of program.files) {
    const collected = collectedByFile.get(mf.path);
    if (!collected) continue;
    for (const item of collected.equates) {
      if (types.has(item.name)) {
        diag(diagnostics, item.span.file, `Equate name "${item.name}" collides with a type name.`);
        continue;
      }
      if (!claim('equate', item.name, item.span.file)) continue;
      if (equates.has(item.name.toLowerCase())) continue;

      const expr = constValueExpr(item);
      if (!asmEquExprs.has(item.name)) asmEquExprs.set(item.name, { expr });
      if (!asmEquExprs.has(item.name.toLowerCase())) {
        asmEquExprs.set(item.name.toLowerCase(), { expr });
      }
      const v = evalImmExpr(expr, env, diagnostics);
      if (v === undefined) {
        continue;
      }
      equates.set(item.name, v);
      equates.set(item.name.toLowerCase(), v);
    }
  }

  return env;
}
