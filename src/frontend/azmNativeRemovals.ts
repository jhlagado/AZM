import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmBlockNode,
  AsmInstructionNode,
  AsmLabelNode,
  AsmOperandNode,
  EaExprNode,
  ModuleItemNode,
  OpDeclNode,
  ProgramNode,
  SourceSpan,
  VarBlockNode,
} from './ast.js';
import { isLabelConstantLayoutCastEa } from '../semantics/layoutCastFold.js';

function removed(span: SourceSpan, message: string): Diagnostic {
  return {
    id: DiagnosticIds.AzmRemovedZaxConstruct,
    severity: 'error',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  };
}

function removedVarBlock(node: VarBlockNode): Diagnostic {
  return removed(
    node.span,
    'Typed storage blocks are not supported in AZM-native source; use explicit labels and assembler directives.',
  );
}

function typedEaDiagnostic(expr: EaExprNode): Diagnostic | undefined {
  if (isLabelConstantLayoutCastEa(expr)) {
    return undefined;
  }
  switch (expr.kind) {
    case 'EaReinterpret':
    case 'EaField':
    case 'EaIndex':
      return removed(
        expr.span,
        'ZAX typed effective-address syntax is not supported in AZM-native source; use sizeof/offset constants, layout-cast address expressions, or explicit address arithmetic.',
      );
    case 'EaAdd':
    case 'EaSub':
      return typedEaDiagnostic(expr.base);
    case 'EaName':
    case 'EaImm':
      return undefined;
  }
}

function operandDiagnostics(operand: AsmOperandNode): Diagnostic[] {
  switch (operand.kind) {
    case 'Ea':
    case 'Mem': {
      const diag = typedEaDiagnostic(operand.expr);
      return diag ? [diag] : [];
    }
    case 'Reg':
    case 'Imm':
    case 'PortC':
    case 'PortImm8':
      return [];
  }
}

function asmBlockDiagnostics(block: AsmBlockNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const item of block.items) {
    if (item.kind !== 'AsmInstruction') continue;

    for (const operand of item.operands) diagnostics.push(...operandDiagnostics(operand));
  }
  return diagnostics;
}

function opDiagnostics(node: OpDeclNode): Diagnostic[] {
  return asmBlockDiagnostics(node.body);
}

function asmStreamDiagnostics(
  item: AsmLabelNode | AsmInstructionNode,
): Diagnostic[] {
  if (item.kind !== 'AsmInstruction') return [];
  const diagnostics: Diagnostic[] = [];
  for (const operand of item.operands) diagnostics.push(...operandDiagnostics(operand));
  return diagnostics;
}

function isAzmAsmStreamItem(
  item: ModuleItemNode,
): item is AsmLabelNode | AsmInstructionNode {
  return (
    item.kind === 'AsmLabel' ||
    item.kind === 'AsmInstruction'
  );
}

function itemDiagnostics(item: ModuleItemNode): Diagnostic[] {
  if (isAzmAsmStreamItem(item)) return asmStreamDiagnostics(item);
  switch (item.kind) {
    case 'VarBlock':
      return [removedVarBlock(item)];
    case 'OpDecl':
      return opDiagnostics(item);
    default:
      return [];
  }
}

export function diagnosticsForAzmRemovedZaxConstructs(program: ProgramNode): Diagnostic[] {
  return program.files.flatMap((file) => file.items.flatMap((item) => itemDiagnostics(item)));
}
