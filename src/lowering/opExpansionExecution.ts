import type {
  AsmItemNode,
  AsmOperandNode,
  ImmExprNode,
  OpDeclNode,
  SourceSpan,
} from '../frontend/ast.js';
import type {
  AsmRangeLoweringCapability,
  HiddenLabelCapability,
  LoweringDiagnosticsCapability,
} from './capabilities.js';

type OpExpansionExecutionContext = LoweringDiagnosticsCapability &
  HiddenLabelCapability &
  AsmRangeLoweringCapability;

type ExpandAndLowerArgs = {
  opDecl: OpDeclNode;
  substituteOperandWithOpLabels: (
    operand: AsmOperandNode,
    localLabelMap: Map<string, string>,
  ) => AsmOperandNode;
  substituteImmWithOpLabels: (
    expr: ImmExprNode,
    localLabelMap: Map<string, string>,
  ) => ImmExprNode;
  substituteConditionWithOpLabels: (condition: string, span: SourceSpan, opName: string) => string;
};

export type ExpandVisibleOpBodyItemsArgs = ExpandAndLowerArgs & {
  allocateLocalLabel: (labelName: string, opDecl: OpDeclNode) => string;
};

export function expandVisibleOpBodyItems({
  opDecl,
  allocateLocalLabel,
  substituteOperandWithOpLabels,
  substituteImmWithOpLabels,
  substituteConditionWithOpLabels,
}: ExpandVisibleOpBodyItemsArgs): AsmItemNode[] {
  const localLabelMap = new Map<string, string>();
  for (const bodyItem of opDecl.body.items) {
    if (bodyItem.kind !== 'AsmLabel') continue;
    const key = bodyItem.name.toLowerCase();
    if (!localLabelMap.has(key)) {
      localLabelMap.set(key, allocateLocalLabel(bodyItem.name, opDecl));
    }
  }

  return opDecl.body.items.map((bodyItem) => {
    if (bodyItem.kind === 'AsmInstruction') {
      return {
        kind: 'AsmInstruction',
        span: bodyItem.span,
        head: bodyItem.head,
        operands: bodyItem.operands.map((operand) =>
          substituteOperandWithOpLabels(operand, localLabelMap),
        ),
      };
    }
    if (bodyItem.kind === 'AsmLabel') {
      return {
        kind: 'AsmLabel',
        span: bodyItem.span,
        name: localLabelMap.get(bodyItem.name.toLowerCase()) ?? bodyItem.name,
      };
    }
    if (bodyItem.kind === 'Select') {
      return {
        kind: 'Select',
        span: bodyItem.span,
        selector: substituteOperandWithOpLabels(bodyItem.selector, localLabelMap),
      };
    }
    if (bodyItem.kind === 'Case') {
      return {
        kind: 'Case',
        span: bodyItem.span,
        value: substituteImmWithOpLabels(bodyItem.value, localLabelMap),
        ...(bodyItem.end ? { end: substituteImmWithOpLabels(bodyItem.end, localLabelMap) } : {}),
      };
    }
    if (bodyItem.kind === 'If' || bodyItem.kind === 'While' || bodyItem.kind === 'Until') {
      return {
        ...bodyItem,
        cc: substituteConditionWithOpLabels(bodyItem.cc, bodyItem.span, opDecl.name),
      };
    }
    return { ...bodyItem };
  });
};

export function createOpExpansionExecutionHelpers(ctx: OpExpansionExecutionContext) {
  const expandAndLowerOpBody = ({
    opDecl,
    substituteOperandWithOpLabels,
    substituteImmWithOpLabels,
    substituteConditionWithOpLabels,
  }: ExpandAndLowerArgs): void => {
    const expandedItems = expandVisibleOpBodyItems({
      opDecl,
      allocateLocalLabel: () => ctx.newHiddenLabel(`__zax_op_${opDecl.name.toLowerCase()}_lbl`),
      substituteOperandWithOpLabels,
      substituteImmWithOpLabels,
      substituteConditionWithOpLabels,
    });

    const consumed = ctx.lowerAsmRange(expandedItems, 0, new Set());
    if (consumed < expandedItems.length) {
      ctx.diagAt(
        ctx.diagnostics,
        expandedItems[consumed]!.span,
        'Internal control-flow lowering error.',
      );
    }
  };

  return {
    expandAndLowerOpBody,
  };
}
