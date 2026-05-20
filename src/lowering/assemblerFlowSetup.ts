import { DiagnosticIds } from '../diagnosticTypes.js';
import type { Diagnostic, DiagnosticId } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
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

type AssemblerFlowSetupContext = {
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
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  generatedLabelCounterRef: { current: number };
  formatAsmOperandForOpDiag: (op: AsmOperandNode) => string;
};

export function createAssemblerFlowSetupHelpers({
  diagnostics,
  diagAt,
  diagAtWithId,
  getCurrentCodeSegmentTag,
  setCurrentCodeSegmentTag,
  taken,
  traceLabel,
  pending,
  getCodeOffset,
  emitInstr,
  generatedLabelCounterRef,
  formatAsmOperandForOpDiag,
}: AssemblerFlowSetupContext) {
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
    newHiddenLabel,
    defineCodeLabel,
    emitVirtualReg16Transfer,
  };
}
