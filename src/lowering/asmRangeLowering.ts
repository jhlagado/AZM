import type { AsmInstructionNode, AsmItemNode, AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import type { FlowState } from './functionBodySetup.js';

type Context<TCodeSegmentTag> = {
  sourceTagForSpan: (span: SourceSpan) => TCodeSegmentTag;
  getCurrentCodeSegmentTag: () => TCodeSegmentTag | undefined;
  setCurrentCodeSegmentTag: (tag: TCodeSegmentTag | undefined) => void;
  defineCodeLabel: (name: string, span: SourceSpan, scope: 'global' | 'local') => void;
  emitAsmInstruction: (item: AsmInstructionNode) => void;
  flowRef: { readonly current: FlowState };
  syncFromFlow: () => void;
  snapshotFlow: () => FlowState;
  restoreFlow: (state: FlowState) => void;
  newHiddenLabel: (prefix: string) => string;
  emitJumpIfFalse: (cc: string, label: string, span: SourceSpan) => boolean;
  emitJumpTo: (label: string, span: SourceSpan) => void;
  diagAt: (span: SourceSpan, message: string) => void;
  warnAt: (span: SourceSpan, message: string) => void;
  joinFlows: (left: FlowState, right: FlowState, span: SourceSpan, contextName: string) => FlowState;
  hasStackSlots: boolean;
  reg8: Set<string>;
  evalImmExpr: (expr: ImmExprNode) => number | undefined;
  loadSelectorIntoHL: (selector: AsmOperandNode, span: SourceSpan) => boolean;
  emitRawCodeBytes: (bytes: Uint8Array, file: string, trace: string) => void;
  emitSelectCompareReg8ToImm8: (value: number, missLabel: string, span: SourceSpan) => void;
  emitSelectCompareToImm16: (value: number, missLabel: string, span: SourceSpan) => void;
  emitSelectCompareReg8Range: (
    start: number,
    end: number,
    missLabel: string,
    span: SourceSpan,
  ) => void;
  emitSelectCompareImm16Range: (
    start: number,
    end: number,
    missLabel: string,
    span: SourceSpan,
  ) => void;
  emitInstr: (name: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
};

type SelectCaseArm =
  | { kind: 'value'; value: number; bodyLabel: string; span: SourceSpan }
  | { kind: 'range'; start: number; end: number; bodyLabel: string; span: SourceSpan };

type LoopContext = {
  breakLabel: string;
  continueLabel: string;
  breakExits: FlowState[];
  continueExits: FlowState[];
};

function formatCaseInterval(start: number, end: number): string {
  return start === end ? `${start}` : `${start}..${end}`;
}

export function createAsmRangeLoweringHelpers<TCodeSegmentTag>(ctx: Context<TCodeSegmentTag>) {
  const joinFlowList = (
    flows: readonly FlowState[],
    span: SourceSpan,
    contextName: string,
  ): FlowState => {
    const reachable = flows.filter((flow) => flow.reachable);
    if (reachable.length === 0) {
      return {
        reachable: false,
        spDelta: 0,
        spValid: true,
        spInvalidDueToMutation: false,
      };
    }
    return reachable.slice(1).reduce((joined, flow) => ctx.joinFlows(joined, flow, span, contextName), reachable[0]!);
  };

  const validateLoopBackEdges = (
    entry: FlowState,
    backEdgeFlows: readonly FlowState[],
    span: SourceSpan,
    exactMismatchMessage: (flow: FlowState, baseline: FlowState) => string,
    mutationMessage: string,
    unknownMessage: string,
  ): { unknown: boolean; mutation: boolean } => {
    const reachable = backEdgeFlows.filter((flow) => flow.reachable);
    if (reachable.length === 0) return { unknown: false, mutation: false };

    const exactMismatch = reachable.find(
      (flow) => flow.spValid && entry.spValid && flow.spDelta !== entry.spDelta,
    );
    if (exactMismatch) {
      ctx.diagAt(span, exactMismatchMessage(exactMismatch, entry));
      return { unknown: true, mutation: false };
    }

    const mutationUnknown = reachable.some(
      (flow) =>
        (!flow.spValid || !entry.spValid) &&
        (flow.spInvalidDueToMutation || entry.spInvalidDueToMutation),
    );
    if (mutationUnknown) {
      ctx.diagAt(span, mutationMessage);
      return { unknown: true, mutation: true };
    }

    const plainUnknown = reachable.some((flow) => (!flow.spValid || !entry.spValid) && ctx.hasStackSlots);
    if (plainUnknown) {
      ctx.diagAt(span, unknownMessage);
      return { unknown: true, mutation: false };
    }

    return { unknown: false, mutation: false };
  };

  const lowerAsmRange = (
    asmItems: readonly AsmItemNode[],
    startIndex: number,
    stopKinds: Set<string>,
    loopStack: LoopContext[] = [],
  ): number => {
    let i = startIndex;
    while (i < asmItems.length) {
      const it = asmItems[i]!;
      if (stopKinds.has(it.kind)) return i;
      const prevTag = ctx.getCurrentCodeSegmentTag();
      ctx.setCurrentCodeSegmentTag(ctx.sourceTagForSpan(it.span));
      try {
        if (it.kind === 'AsmLabel') {
          ctx.defineCodeLabel(it.name, it.span, 'global');
          if (!ctx.flowRef.current.reachable) {
            ctx.flowRef.current.reachable = true;
            ctx.flowRef.current.spValid = false;
            ctx.flowRef.current.spDelta = 0;
            ctx.flowRef.current.spInvalidDueToMutation = false;
            ctx.syncFromFlow();
          }
          i++;
          continue;
        }
        if (it.kind === 'AsmInstruction') {
          ctx.emitAsmInstruction(it);
          i++;
          continue;
        }
        if (it.kind === 'If') {
          const entry = ctx.snapshotFlow();
          const elseLabel = ctx.newHiddenLabel('__zax_if_else');
          const endLabel = ctx.newHiddenLabel('__zax_if_end');
          ctx.emitJumpIfFalse(it.cc, elseLabel, it.span);

          let j = lowerAsmRange(asmItems, i + 1, new Set(['Else', 'End']), loopStack);
          const thenExit = ctx.snapshotFlow();
          if (j >= asmItems.length) {
            ctx.diagAt(it.span, 'if without matching end.');
            return asmItems.length;
          }
          const term = asmItems[j]!;
          if (term.kind === 'Else') {
            if (thenExit.reachable) ctx.emitJumpTo(endLabel, term.span);
            ctx.defineCodeLabel(elseLabel, term.span, 'local');
            ctx.restoreFlow(entry);
            j = lowerAsmRange(asmItems, j + 1, new Set(['End']), loopStack);
            const elseExit = ctx.snapshotFlow();
            if (j >= asmItems.length || asmItems[j]!.kind !== 'End') {
              ctx.diagAt(it.span, 'if/else without matching end.');
              return asmItems.length;
            }
            ctx.defineCodeLabel(endLabel, asmItems[j]!.span, 'local');
            ctx.restoreFlow(ctx.joinFlows(thenExit, elseExit, asmItems[j]!.span, 'if/else'));
            i = j + 1;
            continue;
          }
          if (term.kind !== 'End') {
            ctx.diagAt(it.span, 'if without matching end.');
            return asmItems.length;
          }
          ctx.defineCodeLabel(elseLabel, term.span, 'local');
          ctx.restoreFlow(ctx.joinFlows(thenExit, entry, term.span, 'if'));
          i = j + 1;
          continue;
        }
        if (it.kind === 'While') {
          const entry = ctx.snapshotFlow();
          const condLabel = ctx.newHiddenLabel('__zax_while_cond');
          const endLabel = ctx.newHiddenLabel('__zax_while_end');
          const loopCtx: LoopContext = {
            breakLabel: endLabel,
            continueLabel: condLabel,
            breakExits: [],
            continueExits: [],
          };
          ctx.defineCodeLabel(condLabel, it.span, 'local');
          ctx.emitJumpIfFalse(it.cc, endLabel, it.span);

          const j = lowerAsmRange(asmItems, i + 1, new Set(['End']), [...loopStack, loopCtx]);
          const bodyExit = ctx.snapshotFlow();
          if (j >= asmItems.length || asmItems[j]!.kind !== 'End') {
            ctx.diagAt(it.span, 'while without matching end.');
            return asmItems.length;
          }
          const backEdge = validateLoopBackEdges(
            entry,
            [bodyExit, ...loopCtx.continueExits],
            asmItems[j]!.span,
            (flow, baseline) =>
              `Stack depth mismatch at while back-edge (${flow.spDelta} vs ${baseline.spDelta}).`,
            'Cannot verify stack depth at while back-edge due to untracked SP mutation.',
            'Cannot verify stack depth at while back-edge due to unknown stack state.',
          );
          if (bodyExit.reachable) ctx.emitJumpTo(condLabel, asmItems[j]!.span);
          ctx.defineCodeLabel(endLabel, asmItems[j]!.span, 'local');
          const normalExit = backEdge.unknown
            ? {
                reachable: entry.reachable,
                spDelta: 0,
                spValid: false,
                spInvalidDueToMutation: backEdge.mutation,
              }
            : entry;
          ctx.restoreFlow(joinFlowList([normalExit, ...loopCtx.breakExits], asmItems[j]!.span, 'while exit'));
          i = j + 1;
          continue;
        }
        if (it.kind === 'Repeat') {
          const entry = ctx.snapshotFlow();
          const loopLabel = ctx.newHiddenLabel('__zax_repeat_body');
          const condLabel = ctx.newHiddenLabel('__zax_repeat_cond');
          const endLabel = ctx.newHiddenLabel('__zax_repeat_end');
          const loopCtx: LoopContext = {
            breakLabel: endLabel,
            continueLabel: condLabel,
            breakExits: [],
            continueExits: [],
          };
          ctx.defineCodeLabel(loopLabel, it.span, 'local');
          const j = lowerAsmRange(asmItems, i + 1, new Set(['Until']), [...loopStack, loopCtx]);
          if (j >= asmItems.length || asmItems[j]!.kind !== 'Until') {
            ctx.diagAt(it.span, 'repeat without matching until.');
            return asmItems.length;
          }
          const untilNode = asmItems[j]!;
          const bodyExit = ctx.snapshotFlow();
          ctx.defineCodeLabel(condLabel, untilNode.span, 'local');
          ctx.restoreFlow(joinFlowList([bodyExit, ...loopCtx.continueExits], untilNode.span, 'repeat continue'));
          const condExit = ctx.snapshotFlow();
          const ok = ctx.emitJumpIfFalse(untilNode.cc, loopLabel, untilNode.span);
          if (!ok) return asmItems.length;
          const backEdge = validateLoopBackEdges(
            entry,
            [condExit],
            untilNode.span,
            (flow, baseline) =>
              `Stack depth mismatch at repeat/until (${flow.spDelta} vs ${baseline.spDelta}).`,
            'Cannot verify stack depth at repeat/until due to untracked SP mutation.',
            'Cannot verify stack depth at repeat/until due to unknown stack state.',
          );
          ctx.defineCodeLabel(endLabel, untilNode.span, 'local');
          const normalExit = backEdge.unknown
            ? {
                reachable: condExit.reachable,
                spDelta: 0,
                spValid: false,
                spInvalidDueToMutation: backEdge.mutation,
              }
            : condExit;
          ctx.restoreFlow(joinFlowList([normalExit, ...loopCtx.breakExits], untilNode.span, 'repeat exit'));
          i = j + 1;
          continue;
        }
        if (it.kind === 'Break' || it.kind === 'Continue') {
          const loopCtx = loopStack.at(-1);
          if (!loopCtx) {
            ctx.diagAt(it.span, `"${it.kind.toLowerCase()}" is only valid inside "while" or "repeat".`);
            i++;
            continue;
          }
          const exitFlow = ctx.snapshotFlow();
          if (it.kind === 'Break') {
            loopCtx.breakExits.push(exitFlow);
            ctx.emitJumpTo(loopCtx.breakLabel, it.span);
          } else {
            loopCtx.continueExits.push(exitFlow);
            ctx.emitJumpTo(loopCtx.continueLabel, it.span);
          }
          ctx.flowRef.current.reachable = false;
          ctx.syncFromFlow();
          i++;
          continue;
        }
        if (it.kind === 'Select') {
          const entry = ctx.snapshotFlow();
          const dispatchLabel = ctx.newHiddenLabel('__zax_select_dispatch');
          const endLabel = ctx.newHiddenLabel('__zax_select_end');
          const selectorIsReg8 =
            it.selector.kind === 'Reg' && ctx.reg8.has(it.selector.name.toUpperCase());
          const seenCaseIntervals: Array<{ start: number; end: number; desc: string }> = [];
          const caseArms: SelectCaseArm[] = [];
          let elseLabel: string | undefined;
          let sawArm = false;
          const armExits: FlowState[] = [];

          ctx.emitJumpTo(dispatchLabel, it.span);
          let j = i + 1;

          const closeArm = (span: SourceSpan) => {
            armExits.push(ctx.snapshotFlow());
            if (ctx.flowRef.current.reachable) ctx.emitJumpTo(endLabel, span);
          };

          while (j < asmItems.length) {
            const armItem = asmItems[j]!;
            if (armItem.kind === 'Case') {
              const bodyLabel = ctx.newHiddenLabel('__zax_case');
              ctx.defineCodeLabel(bodyLabel, armItem.span, 'local');
              let k = j;
              while (k < asmItems.length) {
                const caseItem = asmItems[k]!;
                if (caseItem.kind !== 'Case') break;
                const startValue = ctx.evalImmExpr(caseItem.value);
                const endValue = caseItem.end ? ctx.evalImmExpr(caseItem.end) : startValue;
                if (startValue === undefined || endValue === undefined) {
                  ctx.diagAt(caseItem.span, 'Failed to evaluate case value.');
                } else {
                  const rawStart = startValue & 0xffff;
                  const rawEnd = endValue & 0xffff;
                  if (rawStart > rawEnd) {
                    ctx.diagAt(
                      caseItem.span,
                      `Case range ${formatCaseInterval(rawStart, rawEnd)} is descending.`,
                    );
                    k++;
                    continue;
                  }

                  let start = rawStart;
                  let end = rawEnd;
                  if (selectorIsReg8 && start > 0xff) {
                    const intervalText = formatCaseInterval(rawStart, rawEnd);
                    ctx.warnAt(caseItem.span, `Case ${intervalText} can never match reg8 selector.`);
                    k++;
                    continue;
                  }
                  if (selectorIsReg8 && end > 0xff) {
                    const original = formatCaseInterval(rawStart, rawEnd);
                    ctx.warnAt(
                      caseItem.span,
                      `Case range ${original} exceeds reg8 selector range; reachable portion ${formatCaseInterval(
                        start,
                        0xff,
                      )} is used.`,
                    );
                    end = 0xff;
                  }

                  const overlap = seenCaseIntervals.find(
                    (interval) => !(end < interval.start || start > interval.end),
                  );
                  if (overlap) {
                    const overlapStart = Math.max(start, overlap.start);
                    const overlapEnd = Math.min(end, overlap.end);
                    if (overlapStart === overlapEnd) {
                      ctx.diagAt(caseItem.span, `Duplicate case value ${overlapStart}.`);
                    } else {
                      ctx.diagAt(
                        caseItem.span,
                        `Case range ${formatCaseInterval(start, end)} overlaps existing case ${
                          overlap.desc
                        } on ${formatCaseInterval(overlapStart, overlapEnd)}.`,
                      );
                    }
                    k++;
                    continue;
                  }

                  seenCaseIntervals.push({
                    start,
                    end,
                    desc: formatCaseInterval(start, end),
                  });
                  if (start === end) {
                    caseArms.push({ kind: 'value', value: start, bodyLabel, span: caseItem.span });
                  } else {
                    caseArms.push({ kind: 'range', start, end, bodyLabel, span: caseItem.span });
                  }
                }
                k++;
              }
              ctx.restoreFlow(entry);
              sawArm = true;
              j = lowerAsmRange(asmItems, k, new Set(['Case', 'SelectElse', 'End']), loopStack);
              closeArm(asmItems[Math.min(j, asmItems.length - 1)]!.span);
              continue;
            }
            if (armItem.kind === 'SelectElse') {
              if (elseLabel) {
                ctx.diagAt(armItem.span, 'Duplicate else in select.');
              }
              elseLabel = ctx.newHiddenLabel('__zax_select_else');
              ctx.defineCodeLabel(elseLabel, armItem.span, 'local');
              ctx.restoreFlow(entry);
              sawArm = true;
              j = lowerAsmRange(asmItems, j + 1, new Set(['End']), loopStack);
              closeArm(asmItems[Math.min(j, asmItems.length - 1)]!.span);
              continue;
            }
            if (armItem.kind === 'End') break;
            ctx.diagAt(armItem.span, 'Expected case/else/end inside select.');
            j++;
          }

          if (j >= asmItems.length || asmItems[j]!.kind !== 'End') {
            ctx.diagAt(it.span, 'select without matching end.');
            return asmItems.length;
          }
          if (!sawArm) {
            ctx.diagAt(it.span, 'select must contain at least one case or else arm.');
          }

          ctx.defineCodeLabel(dispatchLabel, asmItems[j]!.span, 'local');
          let selectorConst: number | undefined;
          if (it.selector.kind === 'Imm') {
            const v = ctx.evalImmExpr(it.selector.expr);
            if (v !== undefined) selectorConst = v & 0xffff;
          }
          if (selectorConst !== undefined) {
            const matched = caseArms.find((arm) =>
              arm.kind === 'value'
                ? arm.value === selectorConst
                : selectorConst >= arm.start && selectorConst <= arm.end,
            );
            ctx.emitJumpTo(matched?.bodyLabel ?? elseLabel ?? endLabel, asmItems[j]!.span);
          } else if (caseArms.length === 0) {
            ctx.emitJumpTo(elseLabel ?? endLabel, asmItems[j]!.span);
          } else {
            if (!ctx.emitInstr('push', [{ kind: 'Reg', span: it.span, name: 'HL' }], it.span)) {
              return asmItems.length;
            }
            if (!ctx.loadSelectorIntoHL(it.selector, it.span)) {
              return asmItems.length;
            }
            if (selectorIsReg8) {
              ctx.emitRawCodeBytes(Uint8Array.of(0x7d), it.span.file, 'ld a, l');
            }
            for (const arm of caseArms) {
              const miss = ctx.newHiddenLabel('__zax_select_next');
              if (arm.kind === 'value' && selectorIsReg8) {
                ctx.emitSelectCompareReg8ToImm8(arm.value, miss, arm.span);
              } else if (arm.kind === 'value') {
                ctx.emitSelectCompareToImm16(arm.value, miss, arm.span);
              } else if (selectorIsReg8) {
                ctx.emitSelectCompareReg8Range(arm.start, arm.end, miss, arm.span);
              } else {
                ctx.emitSelectCompareImm16Range(arm.start, arm.end, miss, arm.span);
              }
              ctx.emitInstr('pop', [{ kind: 'Reg', span: arm.span, name: 'HL' }], arm.span);
              ctx.emitJumpTo(arm.bodyLabel, arm.span);
              ctx.defineCodeLabel(miss, arm.span, 'local');
            }
            ctx.emitInstr('pop', [{ kind: 'Reg', span: asmItems[j]!.span, name: 'HL' }], asmItems[j]!.span);
            ctx.emitJumpTo(elseLabel ?? endLabel, asmItems[j]!.span);
          }

          ctx.defineCodeLabel(endLabel, asmItems[j]!.span, 'local');
          const joinInputs = [...armExits];
          if (!elseLabel) joinInputs.push(entry);
          const reachable = joinInputs.filter((f) => f.reachable);
          if (reachable.length === 0) {
            ctx.restoreFlow({
              reachable: false,
              spDelta: 0,
              spValid: true,
              spInvalidDueToMutation: false,
            });
          } else {
            const base = reachable[0]!;
            const allValid = reachable.every((f) => f.spValid);
            let hasMismatch = false;
            if (allValid) {
              const mismatchFlow = reachable.find((f) => f.spDelta !== base.spDelta);
              if (mismatchFlow) {
                hasMismatch = true;
                ctx.diagAt(
                  asmItems[j]!.span,
                  `Stack depth mismatch at select join (${base.spDelta} vs ${mismatchFlow.spDelta}).`,
                );
              }
            } else if (reachable.some((f) => f.spInvalidDueToMutation)) {
              ctx.diagAt(
                asmItems[j]!.span,
                'Cannot verify stack depth at select join due to untracked SP mutation.',
              );
            } else if (ctx.hasStackSlots) {
              ctx.diagAt(asmItems[j]!.span, 'Cannot verify stack depth at select join due to unknown stack state.');
            }
            ctx.restoreFlow({
              reachable: true,
              spDelta: base.spDelta,
              spValid: allValid && !hasMismatch,
              spInvalidDueToMutation: reachable.some((f) => f.spInvalidDueToMutation),
            });
          }
          i = j + 1;
          continue;
        }
        if (
          it.kind === 'Else' ||
          it.kind === 'End' ||
          it.kind === 'Until' ||
          it.kind === 'Case' ||
          it.kind === 'SelectElse'
        ) {
          ctx.diagAt(it.span, `Unexpected "${it.kind.toLowerCase()}" in asm block.`);
          i++;
          continue;
        }
      } finally {
        ctx.setCurrentCodeSegmentTag(prevTag);
      }
    }
    return i;
  };

  return {
    lowerAsmRange,
  };
}
