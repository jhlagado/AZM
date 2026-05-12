import type {
  AsmItemNode,
  AsmInstructionNode,
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
    operand: AsmInstructionNode['operands'][number],
    localLabelMap: Map<string, string>,
  ) => AsmInstructionNode['operands'][number];
  substituteImmWithOpLabels: (
    expr: Extract<Extract<AsmItemNode, { kind: 'Case' }>['value'], object>,
    localLabelMap: Map<string, string>,
  ) => Extract<Extract<AsmItemNode, { kind: 'Case' }>['value'], object>;
  substituteConditionWithOpLabels: (condition: string, span: AsmInstructionNode['span'], opName: string) => string;
};

export function createOpExpansionExecutionHelpers(ctx: OpExpansionExecutionContext) {
  const expandAndLowerOpBody = ({
    opDecl,
    substituteOperandWithOpLabels,
    substituteImmWithOpLabels,
    substituteConditionWithOpLabels,
  }: ExpandAndLowerArgs): void => {
    const localLabelMap = new Map<string, string>();
    for (const bodyItem of opDecl.body.items) {
      if (bodyItem.kind !== 'AsmLabel') continue;
      const key = bodyItem.name.toLowerCase();
      if (!localLabelMap.has(key)) {
        localLabelMap.set(key, ctx.newHiddenLabel(`__zax_op_${opDecl.name.toLowerCase()}_lbl`));
      }
    }

    const expandedItems: AsmItemNode[] = opDecl.body.items.map((bodyItem) => {
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
