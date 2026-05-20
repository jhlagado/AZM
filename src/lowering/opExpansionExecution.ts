import type {
  AsmItemNode,
  AsmOperandNode,
  OpDeclNode,
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
};

type ExpandInlineOpBodyItemsArgs = ExpandAndLowerArgs & {
  allocateLocalLabel: (labelName: string, opDecl: OpDeclNode) => string;
};

export function expandInlineOpBodyItems({
  opDecl,
  allocateLocalLabel,
  substituteOperandWithOpLabels,
}: ExpandInlineOpBodyItemsArgs): AsmItemNode[] {
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
    return bodyItem;
  });
};

export function createOpExpansionExecutionHelpers(ctx: OpExpansionExecutionContext) {
  const expandAndLowerOpBody = ({
    opDecl,
    substituteOperandWithOpLabels,
  }: ExpandAndLowerArgs): void => {
    const expandedItems = expandInlineOpBodyItems({
      opDecl,
      allocateLocalLabel: () => ctx.newHiddenLabel(`__azm_op_${opDecl.name.toLowerCase()}_lbl`),
      substituteOperandWithOpLabels,
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
