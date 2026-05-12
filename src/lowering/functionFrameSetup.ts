import type { Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmOperandNode,
  EaExprNode,
  FuncDeclNode,
  ImmExprNode,
  SourceSpan,
  TypeExprNode,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import { resolveVisibleConst, resolveVisibleEnum } from '../moduleVisibility.js';
import type { PendingSymbol, SourceSegmentTag } from './loweringTypes.js';
import type { AggregateType, ScalarKind } from './typeResolution.js';

type LocalInitializerNameStatus = 'constant' | 'non-constant' | 'unknown';

type TrackedSpState = {
  delta: number;
  valid: boolean;
  invalid: boolean;
};

type LocalScalarInitializer = {
  name: string;
  expr?: ImmExprNode;
  span: SourceSpan;
  scalarKind: 'byte' | 'word' | 'addr';
};

export type FunctionFrameSetupContext = {
  readonly item: FuncDeclNode;
  readonly diagnostics: Diagnostic[];
  readonly diag: (diagnostics: Diagnostic[], file: string, message: string) => void;
  readonly diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  readonly typing: Readonly<FunctionFrameSetupTypingContext>;
  readonly storage: Readonly<FunctionFrameSetupStorageContext>;
  readonly symbols: Readonly<FunctionFrameSetupSymbolContext>;
  readonly emission: Readonly<FunctionFrameSetupEmissionContext>;
  readonly spTracking: Readonly<FunctionFrameSetupSpTrackingContext>;
};

export type FunctionFrameSetupTypingContext = {
  readonly env: CompileEnv;
  readonly resolveScalarBinding: (name: string) => ScalarKind | undefined;
  readonly resolveScalarKind: (typeExpr: TypeExprNode) => ScalarKind | undefined;
  readonly resolveAggregateType: (typeExpr: TypeExprNode) => AggregateType | undefined;
  readonly resolveEaTypeExpr: (ea: EaExprNode) => TypeExprNode | undefined;
  readonly evalImmExpr: (
    expr: ImmExprNode,
    env: CompileEnv,
    diagnostics: Diagnostic[],
  ) => number | undefined;
};

export type FunctionFrameSetupStorageContext = {
  readonly stackSlotOffsets: Map<string, number>;
  readonly stackSlotTypes: Map<string, TypeExprNode>;
  readonly localAliasTargets: Map<string, EaExprNode>;
  readonly storageTypes: Map<string, TypeExprNode>;
  readonly moduleAliasTargets: Map<string, EaExprNode>;
};

export type FunctionFrameSetupSymbolContext = {
  readonly taken: Set<string>;
  readonly pending: PendingSymbol[];
  readonly traceComment: (offset: number, text: string) => void;
  readonly traceLabel: (offset: number, name: string, span?: SourceSpan) => void;
  readonly generatedLabelCounterRef: { current: number };
};

export type FunctionFrameSetupEmissionContext = {
  readonly getCodeOffset: () => number;
  readonly getCurrentCodeSegmentTag: () => SourceSegmentTag | undefined;
  readonly setCurrentCodeSegmentTag: (tag: SourceSegmentTag | undefined) => void;
  readonly emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  readonly loadImm16ToHL: (value: number, span: SourceSpan) => boolean;
};

export type FunctionFrameSetupSpTrackingContext = {
  readonly bindSpTracking: (
    callbacks?: {
      applySpTracking: (headRaw: string, operands: AsmOperandNode[]) => void;
      invalidateSpTracking: () => void;
    },
  ) => void;
};

export type FunctionFrameSetupResult = {
  hasStackSlots: boolean;
  emitSyntheticEpilogue: boolean;
  epilogueLabel: string;
  preserveSet: string[];
  trackedSp: TrackedSpState;
};

function collectImmExprNames(expr: ImmExprNode): string[] {
  switch (expr.kind) {
    case 'ImmLiteral':
    case 'ImmCurrentLocation':
    case 'ImmSizeof':
      return [];
    case 'ImmName':
      return [expr.name];
    case 'ImmOffsetof':
      return expr.path.steps.flatMap((step) =>
        step.kind === 'OffsetofIndex' ? collectImmExprNames(step.expr) : [],
      );
    case 'ImmUnary':
      return collectImmExprNames(expr.expr);
    case 'ImmBinary':
      return [...collectImmExprNames(expr.left), ...collectImmExprNames(expr.right)];
  }
}

function classifyLocalInitializerName(
  name: string,
  file: string,
  env: CompileEnv,
  resolveScalarBinding: (name: string) => ScalarKind | undefined,
  stackSlotTypes: Map<string, TypeExprNode>,
  localAliasTargets: Map<string, EaExprNode>,
  storageTypes: Map<string, TypeExprNode>,
): LocalInitializerNameStatus {
  if (resolveVisibleConst(name, file, env) !== undefined) return 'constant';
  if (resolveVisibleEnum(name, file, env) !== undefined) return 'constant';

  const lower = name.toLowerCase();
  if (
    resolveScalarBinding(name) !== undefined ||
    stackSlotTypes.has(lower) ||
    localAliasTargets.has(lower) ||
    storageTypes.has(lower)
  ) {
    return 'non-constant';
  }

  return 'unknown';
}

function localInitializerFitsScalarKind(value: number, scalarKind: 'byte' | 'word' | 'addr'): boolean {
  if (scalarKind === 'byte') return value >= -0x80 && value <= 0xff;
  return value >= -0x8000 && value <= 0xffff;
}

function localInitializerRangeLabel(scalarKind: 'byte' | 'word' | 'addr'): string {
  return scalarKind === 'byte' ? 'byte range (-128..255)' : 'word/addr range (-32768..65535)';
}

function newSyntheticEpilogueLabel(
  taken: Set<string>,
  generatedLabelCounterRef: { current: number },
): string {
  let epilogueLabel = `__zax_epilogue_${generatedLabelCounterRef.current++}`;
  while (taken.has(epilogueLabel)) {
    epilogueLabel = `__zax_epilogue_${generatedLabelCounterRef.current++}`;
  }
  return epilogueLabel;
}

export function initializeFunctionFrame(ctx: FunctionFrameSetupContext): FunctionFrameSetupResult {
  const {
    item,
    diagnostics,
    diag,
    diagAt,
  } = ctx;
  const { env, resolveScalarBinding, resolveScalarKind, resolveAggregateType, resolveEaTypeExpr, evalImmExpr } =
    ctx.typing;
  const { stackSlotOffsets, stackSlotTypes, localAliasTargets, storageTypes, moduleAliasTargets } =
    ctx.storage;
  const { taken, pending, traceComment, traceLabel, generatedLabelCounterRef } = ctx.symbols;
  const {
    getCodeOffset,
    getCurrentCodeSegmentTag,
    setCurrentCodeSegmentTag,
    emitInstr,
    loadImm16ToHL,
  } = ctx.emission;
  const { bindSpTracking } = ctx.spTracking;

  stackSlotOffsets.clear();
  stackSlotTypes.clear();
  localAliasTargets.clear();

  const localDecls = item.locals.decls;
  const localAliasNames = new Set(
    localDecls.filter((decl) => decl.form === 'alias').map((decl) => decl.name.toLowerCase()),
  );
  const localTypedNames = new Set(
    localDecls.filter((decl) => decl.form === 'typed').map((decl) => decl.name.toLowerCase()),
  );
  const paramNames = new Set(item.params.map((param) => param.name.toLowerCase()));
  const returnRegs = item.returnRegs.map((r: string) => r.toUpperCase());
  const basePreserveOrder: string[] = ['AF', 'BC', 'DE', 'HL'];
  const preserveSet = basePreserveOrder.filter((r) => !returnRegs.includes(r));
  const preserveBytes = preserveSet.length * 2;
  const shouldPreserveTypedBoundary = preserveSet.length > 0;
  const hlPreserved = preserveSet.includes('HL');
  let localSlotCount = 0;
  const localScalarInitializers: LocalScalarInitializer[] = [];
  for (let li = 0; li < localDecls.length; li++) {
    const decl = localDecls[li]!;
    const declLower = decl.name.toLowerCase();
    if (decl.form === 'typed') {
      const scalarKind = resolveScalarKind(decl.typeExpr);
      if (scalarKind) {
        const localIxDisp = -(2 * (localSlotCount + 1));
        stackSlotOffsets.set(declLower, localIxDisp);
        stackSlotTypes.set(declLower, decl.typeExpr);
        localSlotCount++;
        const init = decl.initializer;
        localScalarInitializers.push({
          name: decl.name,
          ...(init ? { expr: init.expr } : {}),
          span: decl.span,
          scalarKind,
        });
        continue;
      }
      const aggregate = resolveAggregateType(decl.typeExpr);
      if (aggregate) {
        if (decl.initializer !== undefined) {
          diagAt(
            diagnostics,
            decl.span,
            `Local "${decl.name}" of record or union type cannot have a constant initializer; assign after declaration.`,
          );
          continue;
        }
        const localIxDisp = -(2 * (localSlotCount + 1));
        stackSlotOffsets.set(declLower, localIxDisp);
        stackSlotTypes.set(declLower, decl.typeExpr);
        localSlotCount++;
        continue;
      }
      diagAt(
        diagnostics,
        decl.span,
        `Non-scalar local storage declaration "${decl.name}" requires alias form ("${decl.name} = rhs").`,
      );
      continue;
    }

    const init = decl.initializer;
    if (init.expr.kind !== 'EaName') {
      diagAt(
        diagnostics,
        decl.span,
        `Function-local alias "${decl.name}" must target a direct module-scope storage name.`,
      );
      continue;
    }
    const targetLower = init.expr.name.toLowerCase();
    if (paramNames.has(targetLower)) {
      diagAt(
        diagnostics,
        decl.span,
        `Function-local alias "${decl.name}" cannot target parameter "${init.expr.name}".`,
      );
      continue;
    }
    if (localAliasNames.has(targetLower) || moduleAliasTargets.has(targetLower)) {
      diagAt(
        diagnostics,
        decl.span,
        `Function-local alias "${decl.name}" cannot target alias "${init.expr.name}".`,
      );
      continue;
    }
    if (localTypedNames.has(targetLower)) {
      diagAt(
        diagnostics,
        decl.span,
        `Function-local alias "${decl.name}" cannot target local "${init.expr.name}".`,
      );
      continue;
    }
    if (!storageTypes.has(targetLower)) {
      diagAt(
        diagnostics,
        decl.span,
        `Function-local alias "${decl.name}" must target a direct module-scope storage name.`,
      );
      continue;
    }
    localAliasTargets.set(declLower, init.expr);
    const inferred = resolveEaTypeExpr(init.expr);
    if (!inferred) {
      diagAt(
        diagnostics,
        decl.span,
        `Incompatible inferred alias binding for "${decl.name}": unable to infer type from alias source.`,
      );
      continue;
    }
    stackSlotTypes.set(declLower, inferred);
  }

  const localBytes = localSlotCount * 2;
  const frameSize = localBytes + preserveBytes;
  const argc = item.params.length;
  const hasStackSlots = frameSize > 0 || argc > 0;
  for (let paramIndex = 0; paramIndex < argc; paramIndex++) {
    const p = item.params[paramIndex]!;
    const base = 4 + 2 * paramIndex;
    stackSlotOffsets.set(p.name.toLowerCase(), base);
    stackSlotTypes.set(p.name.toLowerCase(), p.typeExpr);
  }

  const epilogueLabel = newSyntheticEpilogueLabel(taken, generatedLabelCounterRef);
  const emitSyntheticEpilogue =
    preserveSet.length > 0 || hasStackSlots || localScalarInitializers.length > 0;

  traceComment(getCodeOffset(), `func ${item.name} begin`);
  if (taken.has(item.name)) {
    diag(diagnostics, item.span.file, `Duplicate symbol name "${item.name}".`);
  } else {
    taken.add(item.name);
    traceLabel(getCodeOffset(), item.name, item.span);
    pending.push({
      kind: 'label',
      name: item.name,
      section: 'code',
      offset: getCodeOffset(),
      file: item.span.file,
      line: item.span.start.line,
      scope: 'global',
    });
  }

  if (hasStackSlots) {
    const prevTag = getCurrentCodeSegmentTag();
    setCurrentCodeSegmentTag({
      file: item.span.file,
      line: item.span.start.line,
      column: item.span.start.column,
      kind: 'code',
      confidence: 'high',
    });
    try {
      emitInstr('push', [{ kind: 'Reg', span: item.span, name: 'IX' }], item.span);
      emitInstr(
        'ld',
        [
          { kind: 'Reg', span: item.span, name: 'IX' },
          {
            kind: 'Imm',
            span: item.span,
            expr: { kind: 'ImmLiteral', span: item.span, value: 0 },
          },
        ],
        item.span,
      );
      emitInstr(
        'add',
        [
          { kind: 'Reg', span: item.span, name: 'IX' },
          { kind: 'Reg', span: item.span, name: 'SP' },
        ],
        item.span,
      );
    } finally {
      setCurrentCodeSegmentTag(prevTag);
    }
  }

  for (const init of localScalarInitializers) {
    const prevTag = getCurrentCodeSegmentTag();
    setCurrentCodeSegmentTag({
      file: init.span.file,
      line: init.span.start.line,
      column: init.span.start.column,
      kind: 'code',
      confidence: 'high',
    });
    try {
      let initValue = 0;
      if (init.expr !== undefined) {
        const referencedNames = [...new Set(collectImmExprNames(init.expr))];
        const nonConstantName = referencedNames.find(
          (name) =>
            classifyLocalInitializerName(
              name,
              init.span.file,
              env,
              resolveScalarBinding,
              stackSlotTypes,
              localAliasTargets,
              storageTypes,
            ) === 'non-constant',
        );
        if (nonConstantName) {
          diagAt(
            diagnostics,
            init.span,
            `Invalid local constant initializer for "${init.name}": "${nonConstantName}" is not a compile-time constant.`,
          );
          continue;
        }

        const unknownName = referencedNames.find(
          (name) =>
            classifyLocalInitializerName(
              name,
              init.span.file,
              env,
              resolveScalarBinding,
              stackSlotTypes,
              localAliasTargets,
              storageTypes,
            ) === 'unknown',
        );
        if (unknownName) {
          diagAt(
            diagnostics,
            init.span,
            `Unknown compile-time name "${unknownName}" in local initializer for "${init.name}".`,
          );
          continue;
        }

        const initDiagnostics: Diagnostic[] = [];
        const evaluated = evalImmExpr(init.expr, env, initDiagnostics);
        if (evaluated === undefined) {
          diagnostics.push(...initDiagnostics);
          if (initDiagnostics.length === 0) {
            diagAt(
              diagnostics,
              init.span,
              `Invalid local constant initializer for "${init.name}".`,
            );
          }
          continue;
        }
        initValue = evaluated;
      }

      if (!localInitializerFitsScalarKind(initValue, init.scalarKind)) {
        diagAt(
          diagnostics,
          init.span,
          `Local initializer for "${init.name}" does not fit ${localInitializerRangeLabel(init.scalarKind)}; got ${initValue}.`,
        );
        continue;
      }
      const narrowed = init.scalarKind === 'byte' ? initValue & 0xff : initValue & 0xffff;
      if (hlPreserved) {
        emitInstr('push', [{ kind: 'Reg', span: init.span, name: 'HL' }], init.span);
        if (!loadImm16ToHL(narrowed, init.span)) continue;
        emitInstr(
          'ex',
          [
            {
              kind: 'Mem',
              span: init.span,
              expr: { kind: 'EaName', span: init.span, name: 'SP' },
            },
            { kind: 'Reg', span: init.span, name: 'HL' },
          ],
          init.span,
        );
      } else {
        if (!loadImm16ToHL(narrowed, init.span)) continue;
        emitInstr('push', [{ kind: 'Reg', span: init.span, name: 'HL' }], init.span);
      }
    } finally {
      setCurrentCodeSegmentTag(prevTag);
    }
  }

  if (shouldPreserveTypedBoundary) {
    const prevTag = getCurrentCodeSegmentTag();
    setCurrentCodeSegmentTag({
      file: item.span.file,
      line: item.span.start.line,
      column: item.span.start.column,
      kind: 'code',
      confidence: 'high',
    });
    try {
      for (const reg of preserveSet) {
        emitInstr('push', [{ kind: 'Reg', span: item.span, name: reg }], item.span);
      }
    } finally {
      setCurrentCodeSegmentTag(prevTag);
    }
  }

  const trackedSp: TrackedSpState = {
    delta: 0,
    valid: true,
    invalid: false,
  };
  bindSpTracking({
    applySpTracking: (headRaw: string, operands: AsmOperandNode[]) => {
      const head = headRaw.toLowerCase();
      if (
        head === 'ld' &&
        operands.length === 2 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        if (operands[1]?.kind === 'Reg' && operands[1].name.toUpperCase() === 'IX') {
          trackedSp.delta = -2;
          trackedSp.valid = true;
          trackedSp.invalid = false;
        } else {
          trackedSp.valid = false;
          trackedSp.invalid = true;
        }
        return;
      }
      if (!trackedSp.valid) return;
      if (head === 'push' && operands.length === 1) {
        trackedSp.delta -= 2;
        return;
      }
      if (head === 'pop' && operands.length === 1) {
        trackedSp.delta += 2;
        return;
      }
      if (
        head === 'inc' &&
        operands.length === 1 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        trackedSp.delta += 1;
        return;
      }
      if (
        head === 'dec' &&
        operands.length === 1 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        trackedSp.delta -= 1;
      }
    },
    invalidateSpTracking: () => {
      trackedSp.valid = false;
      trackedSp.invalid = true;
    },
  });

  return {
    hasStackSlots,
    emitSyntheticEpilogue,
    epilogueLabel,
    preserveSet,
    trackedSp,
  };
}
