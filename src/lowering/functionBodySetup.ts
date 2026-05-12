import { DiagnosticIds } from '../diagnosticTypes.js';
import type { Diagnostic, DiagnosticId } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
  SourceSpan,
} from '../frontend/ast.js';
import type { SourceSegmentTag } from './loweringTypes.js';

export type FlowState = {
  reachable: boolean;
  spDelta: number;
  spValid: boolean;
  spInvalidDueToMutation: boolean;
};

export type OpExpansionFrame = {
  key: string;
  name: string;
  declSpan: SourceSpan;
  callSiteSpan: SourceSpan;
};

type FunctionBodySetupContext = {
  diagnostics: Diagnostic[];
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  diagAtWithId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: DiagnosticId,
    message: string,
  ) => void;
  getCurrentCodeSegmentTag: () => SourceSegmentTag | undefined;
  setCurrentCodeSegmentTag: (tag: SourceSegmentTag | undefined) => void;
  taken: Set<string>;
  traceLabel: (offset: number, name: string, span?: SourceSpan) => void;
  pending: Array<{
    kind: 'label' | 'data' | 'var';
    name: string;
    section: 'code' | 'data' | 'var';
    offset: number;
    file?: string;
    line?: number;
    scope?: 'global' | 'local';
    size?: number;
  }>;
  getCodeOffset: () => number;
  emitAbs16Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  conditionNameFromOpcode: (opcode: number) => string | undefined;
  inverseConditionName: (nameRaw: string) => string | undefined;
  conditionOpcodeFromName: (nameRaw: string) => number | undefined;
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  emitRawCodeBytes: (bytes: Uint8Array, file: string, asmText: string) => void;
  loadImm16ToHL: (value: number, span: SourceSpan) => boolean;
  pushEaAddress: (ea: EaExprNode, span: SourceSpan) => boolean;
  pushMemValue: (
    ea: EaExprNode,
    want: 'byte' | 'word',
    span: SourceSpan,
  ) => boolean;
  evalImmExpr: (expr: ImmExprNode) => number | undefined;
  reg8: Set<string>;
  generatedLabelCounterRef: { current: number };
  formatAsmOperandForOpDiag: (op: AsmOperandNode) => string;
};

export function createFunctionBodySetupHelpers({
  diagnostics,
  diagAt,
  diagAtWithId,
  getCurrentCodeSegmentTag,
  setCurrentCodeSegmentTag,
  taken,
  traceLabel,
  pending,
  getCodeOffset,
  emitAbs16Fixup,
  conditionNameFromOpcode,
  inverseConditionName,
  conditionOpcodeFromName,
  emitInstr,
  emitRawCodeBytes,
  loadImm16ToHL,
  pushEaAddress,
  pushMemValue,
  evalImmExpr,
  reg8,
  generatedLabelCounterRef,
  formatAsmOperandForOpDiag,
}: FunctionBodySetupContext) {
  const currentOpExpansionFrame = (
    opExpansionStack: OpExpansionFrame[],
  ): OpExpansionFrame | undefined =>
    opExpansionStack.length > 0 ? opExpansionStack[opExpansionStack.length - 1] : undefined;

  const rootOpExpansionFrame = (opExpansionStack: OpExpansionFrame[]): OpExpansionFrame | undefined =>
    opExpansionStack.length > 0 ? opExpansionStack[0] : undefined;

  const currentMacroCallSiteSpan = (opExpansionStack: OpExpansionFrame[]): SourceSpan | undefined =>
    rootOpExpansionFrame(opExpansionStack)?.callSiteSpan;

  const formatInstructionForOpExpansionDiag = (inst: AsmInstructionNode): string => {
    const ops = inst.operands.map(formatAsmOperandForOpDiag).join(', ');
    return ops.length > 0 ? `${inst.head} ${ops}` : inst.head;
  };

  const appendInvalidOpExpansionDiagnostic = (
    inst: AsmInstructionNode,
    diagnosticsStart: number,
    opExpansionStack: OpExpansionFrame[],
  ): void => {
    const frame = currentOpExpansionFrame(opExpansionStack);
    if (!frame) return;
    const rootFrame = rootOpExpansionFrame(opExpansionStack);
    const newDiagnostics = diagnostics.slice(diagnosticsStart);
    const hasConcreteInstructionFailure = newDiagnostics.some(
      (d) =>
        d.severity === 'error' &&
        (d.id === DiagnosticIds.EncodeError || d.id === DiagnosticIds.EmitError),
    );
    if (!hasConcreteInstructionFailure) return;
    if (
      newDiagnostics.some(
        (d) =>
          d.id === DiagnosticIds.OpInvalidExpansion ||
          d.id === DiagnosticIds.OpArityMismatch ||
          d.id === DiagnosticIds.OpNoMatchingOverload ||
          d.id === DiagnosticIds.OpAmbiguousOverload ||
          d.id === DiagnosticIds.OpExpansionCycle,
      )
    ) {
      return;
    }
    const expansionChain = opExpansionStack
      .map((entry) => `${entry.name} (${entry.declSpan.file}:${entry.declSpan.start.line})`)
      .join(' -> ');
    diagAtWithId(
      diagnostics,
      rootFrame?.callSiteSpan ?? frame.callSiteSpan,
      DiagnosticIds.OpInvalidExpansion,
      `Invalid op expansion in "${frame.name}" at call site.\n` +
        `expanded instruction: ${formatInstructionForOpExpansionDiag(inst)}\n` +
        `op definition: ${frame.declSpan.file}:${frame.declSpan.start.line}\n` +
        `expansion chain: ${expansionChain}`,
    );
  };

  const sourceTagForSpan = (span: SourceSpan, opExpansionStack: OpExpansionFrame[]): SourceSegmentTag => {
    const macroCallSite = currentMacroCallSiteSpan(opExpansionStack);
    const taggedSpan = macroCallSite ?? span;
    return {
      file: taggedSpan.file,
      line: taggedSpan.start.line,
      column: taggedSpan.start.column,
      kind: macroCallSite ? 'macro' : 'code',
      confidence: 'high',
    };
  };

  const withCodeSourceTag = <T>(tag: SourceSegmentTag, fn: () => T): T => {
    const prev = getCurrentCodeSegmentTag();
    setCurrentCodeSegmentTag(tag);
    try {
      return fn();
    } finally {
      setCurrentCodeSegmentTag(prev);
    }
  };

  const syncFromFlow = (flow: FlowState, tracked: { delta: number; valid: boolean; invalid: boolean }): void => {
    tracked.delta = flow.spDelta;
    tracked.valid = flow.spValid;
    tracked.invalid = flow.spInvalidDueToMutation;
  };

  const syncToFlow = (flow: FlowState, tracked: { delta: number; valid: boolean; invalid: boolean }): void => {
    flow.spDelta = tracked.delta;
    flow.spValid = tracked.valid;
    flow.spInvalidDueToMutation = tracked.invalid;
  };

  const snapshotFlow = (flow: FlowState): FlowState => ({ ...flow });

  const restoreFlow = (
    flowRef: { current: FlowState },
    state: FlowState,
    tracked: { delta: number; valid: boolean; invalid: boolean },
  ): void => {
    flowRef.current = { ...state };
    syncFromFlow(flowRef.current, tracked);
  };

  const newHiddenLabel = (prefix: string): string => {
    let n = `${prefix}_${generatedLabelCounterRef.current++}`;
    while (taken.has(n)) {
      n = `${prefix}_${generatedLabelCounterRef.current++}`;
    }
    return n;
  };

  const defineCodeLabel = (name: string, span: SourceSpan, scope: 'global' | 'local'): void => {
    if (taken.has(name)) {
      diagAt(diagnostics, span, `Duplicate symbol name "${name}".`);
      return;
    }
    taken.add(name);
    traceLabel(getCodeOffset(), name, span);
    pending.push({
      kind: 'label',
      name,
      section: 'code',
      offset: getCodeOffset(),
      file: span.file,
      line: span.start.line,
      scope,
    });
  };

  const emitJumpTo = (label: string, span: SourceSpan): void => {
    emitAbs16Fixup(0xc3, label.toLowerCase(), 0, span, `jp ${label}`);
  };

  const emitJumpCondTo = (op: number, label: string, span: SourceSpan): void => {
    const ccName = conditionNameFromOpcode(op) ?? 'cc';
    emitAbs16Fixup(op, label.toLowerCase(), 0, span, `jp ${ccName.toLowerCase()}, ${label}`);
  };

  const emitJumpIfFalse = (cc: string, label: string, span: SourceSpan): boolean => {
    if (cc === '__missing__') return false;
    const inv = inverseConditionName(cc);
    if (!inv) {
      diagAt(diagnostics, span, `Unsupported condition code "${cc}".`);
      return false;
    }
    const op = conditionOpcodeFromName(inv);
    if (op === undefined) {
      diagAt(diagnostics, span, `Unsupported condition code "${cc}".`);
      return false;
    }
    emitJumpCondTo(op, label, span);
    return true;
  };

  const emitVirtualReg16Transfer = (asmItem: AsmInstructionNode): boolean => {
    if (asmItem.head.toLowerCase() !== 'ld' || asmItem.operands.length !== 2) return false;
    const dstOp = asmItem.operands[0]!;
    const srcOp = asmItem.operands[1]!;
    if (dstOp.kind !== 'Reg' || srcOp.kind !== 'Reg') return false;
    const dst = dstOp.name.toUpperCase();
    const src = srcOp.name.toUpperCase();
    const supported = new Set(['BC', 'DE', 'HL']);
    if (!supported.has(dst) || !supported.has(src) || dst === src) return false;
    const hi = (reg16: string): 'B' | 'D' | 'H' => (reg16 === 'BC' ? 'B' : reg16 === 'DE' ? 'D' : 'H');
    const lo = (reg16: string): 'C' | 'E' | 'L' => (reg16 === 'BC' ? 'C' : reg16 === 'DE' ? 'E' : 'L');
    emitInstr('ld', [{ kind: 'Reg', span: asmItem.span, name: hi(dst) }, { kind: 'Reg', span: asmItem.span, name: hi(src) }], asmItem.span);
    emitInstr('ld', [{ kind: 'Reg', span: asmItem.span, name: lo(dst) }, { kind: 'Reg', span: asmItem.span, name: lo(src) }], asmItem.span);
    return true;
  };

  const joinFlows = (
    left: FlowState,
    right: FlowState,
    span: SourceSpan,
    contextName: string,
    hasStackSlots: boolean,
  ): FlowState => {
    if (!left.reachable && !right.reachable) {
      return { reachable: false, spDelta: 0, spValid: true, spInvalidDueToMutation: false };
    }
    if (!left.reachable) return { ...right };
    if (!right.reachable) return { ...left };
    let mismatch = false;
    if ((!left.spValid || !right.spValid) && (left.spInvalidDueToMutation || right.spInvalidDueToMutation)) {
      diagAt(diagnostics, span, `Cannot verify stack depth at ${contextName} join due to untracked SP mutation.`);
    } else if ((!left.spValid || !right.spValid) && hasStackSlots) {
      diagAt(diagnostics, span, `Cannot verify stack depth at ${contextName} join due to unknown stack state.`);
    }
    if (left.spValid && right.spValid && left.spDelta !== right.spDelta) {
      mismatch = true;
      diagAt(diagnostics, span, `Stack depth mismatch at ${contextName} join (${left.spDelta} vs ${right.spDelta}).`);
    }
    return {
      reachable: true,
      spDelta: left.spDelta,
      spValid: left.spValid && right.spValid && !mismatch,
      spInvalidDueToMutation: left.spInvalidDueToMutation || right.spInvalidDueToMutation,
    };
  };

  const emitSelectCompareToImm16 = (value: number, mismatchLabel: string, span: SourceSpan): void => {
    emitRawCodeBytes(Uint8Array.of(0x7d), span.file, 'ld a, l');
    emitRawCodeBytes(Uint8Array.of(0xfe, value & 0xff), span.file, 'cp imm8');
    emitJumpCondTo(0xc2, mismatchLabel, span);
    emitRawCodeBytes(Uint8Array.of(0x7c), span.file, 'ld a, h');
    emitRawCodeBytes(Uint8Array.of(0xfe, (value >> 8) & 0xff), span.file, 'cp imm8');
    emitJumpCondTo(0xc2, mismatchLabel, span);
  };

  const emitSelectCompareReg8ToImm8 = (value: number, mismatchLabel: string, span: SourceSpan): void => {
    emitRawCodeBytes(Uint8Array.of(0xfe, value & 0xff), span.file, 'cp imm8');
    emitJumpCondTo(0xc2, mismatchLabel, span);
  };

  const emitSelectCompareReg8Range = (
    start: number,
    end: number,
    mismatchLabel: string,
    span: SourceSpan,
  ): void => {
    emitRawCodeBytes(Uint8Array.of(0xfe, start & 0xff), span.file, 'cp imm8');
    emitJumpCondTo(0xda, mismatchLabel, span);
    if (end < 0xff) {
      emitRawCodeBytes(Uint8Array.of(0xfe, (end + 1) & 0xff), span.file, 'cp imm8');
      emitJumpCondTo(0xd2, mismatchLabel, span);
    }
  };

  const emitSelectCompareImm16Range = (
    start: number,
    end: number,
    mismatchLabel: string,
    span: SourceSpan,
  ): void => {
    const lowerOk = newHiddenLabel('__zax_select_range_lower_ok');
    const upperOk = newHiddenLabel('__zax_select_range_upper_ok');

    emitRawCodeBytes(Uint8Array.of(0x7c), span.file, 'ld a, h');
    emitRawCodeBytes(Uint8Array.of(0xfe, (start >> 8) & 0xff), span.file, 'cp imm8');
    emitJumpCondTo(0xda, mismatchLabel, span);
    emitJumpCondTo(0xc2, lowerOk, span);
    emitRawCodeBytes(Uint8Array.of(0x7d), span.file, 'ld a, l');
    emitRawCodeBytes(Uint8Array.of(0xfe, start & 0xff), span.file, 'cp imm8');
    emitJumpCondTo(0xda, mismatchLabel, span);
    defineCodeLabel(lowerOk, span, 'local');

    emitRawCodeBytes(Uint8Array.of(0x7c), span.file, 'ld a, h');
    emitRawCodeBytes(Uint8Array.of(0xfe, (end >> 8) & 0xff), span.file, 'cp imm8');
    emitJumpCondTo(0xda, upperOk, span);
    emitJumpCondTo(0xc2, mismatchLabel, span);
    emitRawCodeBytes(Uint8Array.of(0x7d), span.file, 'ld a, l');
    emitRawCodeBytes(Uint8Array.of(0xfe, end & 0xff), span.file, 'cp imm8');
    emitJumpCondTo(0xda, upperOk, span);
    emitJumpCondTo(0xca, upperOk, span);
    emitJumpTo(mismatchLabel, span);
    defineCodeLabel(upperOk, span, 'local');
  };

  const loadSelectorIntoHL = (selector: AsmOperandNode, span: SourceSpan): boolean => {
    if (selector.kind === 'Reg') {
      const r = selector.name.toUpperCase();
      if (r === 'BC' || r === 'DE' || r === 'HL') {
        if (!emitInstr('push', [{ kind: 'Reg', span, name: r }], span)) return false;
        return emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
      }
      if (r === 'SP') {
        if (!loadImm16ToHL(0, span)) return false;
        return emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'SP' }], span);
      }
      if (reg8.has(r)) {
        if (!emitInstr('ld', [{ kind: 'Reg', span, name: 'H' }, { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } }], span)) {
          return false;
        }
        return emitInstr('ld', [{ kind: 'Reg', span, name: 'L' }, { kind: 'Reg', span, name: r }], span);
      }
    }
    if (selector.kind === 'Imm') {
      const v = evalImmExpr(selector.expr);
      if (v === undefined) {
        diagAt(diagnostics, span, `Failed to evaluate select selector.`);
        return false;
      }
      return loadImm16ToHL(v & 0xffff, span);
    }
    if (selector.kind === 'Ea') {
      if (!pushEaAddress(selector.expr, span)) return false;
      return emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
    }
    if (selector.kind === 'Mem') {
      if (!pushMemValue(selector.expr, 'word', span)) return false;
      return emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
    }
    diagAt(diagnostics, span, `Unsupported selector form in select.`);
    return false;
  };

  return {
    currentOpExpansionFrame,
    rootOpExpansionFrame,
    currentMacroCallSiteSpan,
    formatInstructionForOpExpansionDiag,
    appendInvalidOpExpansionDiagnostic,
    sourceTagForSpan,
    withCodeSourceTag,
    syncFromFlow,
    syncToFlow,
    snapshotFlow,
    restoreFlow,
    newHiddenLabel,
    defineCodeLabel,
    emitJumpTo,
    emitJumpCondTo,
    emitJumpIfFalse,
    emitVirtualReg16Transfer,
    joinFlows,
    emitSelectCompareToImm16,
    emitSelectCompareReg8ToImm8,
    emitSelectCompareReg8Range,
    emitSelectCompareImm16Range,
    loadSelectorIntoHL,
  };
}
