import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmBlockNode,
  AsmControlNode,
  AsmInstructionNode,
  AsmItemNode,
  AsmLabelNode,
  AsmOperandNode,
  DataBlockNode,
  EaExprNode,
  ExternDeclNode,
  FuncDeclNode,
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

function removedFunction(node: FuncDeclNode): Diagnostic {
  return removed(
    node.span,
    'Function declarations are not supported in AZM-native source; use labels, CALL/RET, and AZMDoc register contracts.',
  );
}

function removedDataBlock(node: DataBlockNode): Diagnostic {
  return removed(
    node.span,
    'Typed data blocks are not supported in AZM-native source; use labels with .db/.dw/.ds plus sizeof/offset constants.',
  );
}

function removedVarBlock(node: VarBlockNode): Diagnostic {
  return removed(
    node.span,
    'Typed storage blocks are not supported in AZM-native source; use explicit labels and assembler directives.',
  );
}

function removedExtern(node: ExternDeclNode): Diagnostic {
  return removed(
    node.span,
    'Typed extern declarations are not supported in AZM-native source; use AZMI/register-care interface contracts for external routines.',
  );
}

function removedStructuredControl(item: AsmItemNode): Diagnostic | undefined {
  if (item.kind === 'AsmInstruction' || item.kind === 'AsmLabel' || item.kind === 'Unimplemented') {
    return undefined;
  }
  return removed(
    item.span,
    'Structured control is not supported in AZM-native source; use explicit labels and branch instructions.',
  );
}

function removedTypedAssignment(item: AsmInstructionNode): Diagnostic | undefined {
  if (item.head !== ':=') return undefined;
  return removed(
    item.span,
    'Typed assignment is not supported in AZM-native source; use explicit Z80 instructions and layout constants.',
  );
}

function typedEaDiagnostic(expr: EaExprNode): Diagnostic | undefined {
  if (isLabelConstantLayoutCastEa(expr, new Map())) {
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
    const control = removedStructuredControl(item);
    if (control) diagnostics.push(control);
    if (item.kind !== 'AsmInstruction') continue;

    const assignment = removedTypedAssignment(item);
    if (assignment) diagnostics.push(assignment);
    for (const operand of item.operands) diagnostics.push(...operandDiagnostics(operand));
  }
  return diagnostics;
}

function opDiagnostics(node: OpDeclNode): Diagnostic[] {
  return asmBlockDiagnostics(node.body);
}

function asmStreamDiagnostics(
  item: AsmLabelNode | AsmInstructionNode | AsmControlNode,
): Diagnostic[] {
  const control = removedStructuredControl(item);
  if (control) return [control];
  if (item.kind !== 'AsmInstruction') return [];
  const assignment = removedTypedAssignment(item);
  const diagnostics = assignment ? [assignment] : [];
  for (const operand of item.operands) diagnostics.push(...operandDiagnostics(operand));
  return diagnostics;
}

function isAzmAsmStreamItem(
  item: ModuleItemNode,
): item is AsmLabelNode | AsmInstructionNode | AsmControlNode {
  return (
    item.kind === 'AsmLabel' ||
    item.kind === 'AsmInstruction' ||
    item.kind === 'If' ||
    item.kind === 'Else' ||
    item.kind === 'End' ||
    item.kind === 'While' ||
    item.kind === 'Repeat' ||
    item.kind === 'Until' ||
    item.kind === 'Break' ||
    item.kind === 'Continue' ||
    item.kind === 'Select' ||
    item.kind === 'Case' ||
    item.kind === 'SelectElse'
  );
}

function itemDiagnostics(item: ModuleItemNode): Diagnostic[] {
  if (isAzmAsmStreamItem(item)) return asmStreamDiagnostics(item);
  switch (item.kind) {
    case 'FuncDecl':
      return [removedFunction(item), ...asmBlockDiagnostics(item.asm)];
    case 'DataBlock':
      return [removedDataBlock(item)];
    case 'VarBlock':
      return [removedVarBlock(item)];
    case 'ExternDecl':
      return [removedExtern(item)];
    case 'OpDecl':
      return opDiagnostics(item);
    default:
      return [];
  }
}

export function diagnosticsForAzmRemovedZaxConstructs(program: ProgramNode): Diagnostic[] {
  return program.files.flatMap((file) => file.items.flatMap((item) => itemDiagnostics(item)));
}
