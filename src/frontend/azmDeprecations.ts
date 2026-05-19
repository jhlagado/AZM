import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmBlockNode,
  AsmInstructionNode,
  AsmItemNode,
  AsmOperandNode,
  DataBlockNode,
  EaExprNode,
  ExternDeclNode,
  FuncDeclNode,
  ModuleItemNode,
  NamedSectionNode,
  OpDeclNode,
  ProgramNode,
  SectionItemNode,
  SourceSpan,
  VarBlockNode,
} from './ast.js';

function warning(span: SourceSpan, message: string): Diagnostic {
  return {
    id: DiagnosticIds.AzmDeprecatedZaxConstruct,
    severity: 'warning',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  };
}

function deprecatedFunction(node: FuncDeclNode): Diagnostic {
  return warning(
    node.span,
    'ZAX function declarations are deprecated in AZM; use labels, CALL/RET, and AZMDoc register contracts.',
  );
}

function deprecatedDataBlock(node: DataBlockNode): Diagnostic {
  return warning(
    node.span,
    'ZAX typed data blocks are deprecated in AZM; use labels with .db/.dw/.ds plus sizeof/offset constants.',
  );
}

function deprecatedVarBlock(node: VarBlockNode): Diagnostic {
  return warning(
    node.span,
    'ZAX typed storage blocks are deprecated in AZM; use explicit labels and assembler directives.',
  );
}

function deprecatedExtern(node: ExternDeclNode): Diagnostic {
  return warning(
    node.span,
    'ZAX typed extern declarations are deprecated in AZM; use AZMI/register-care interface contracts for external routines.',
  );
}

function deprecatedStructuredControl(item: AsmItemNode): Diagnostic | undefined {
  if (item.kind === 'AsmInstruction' || item.kind === 'AsmLabel' || item.kind === 'Unimplemented') {
    return undefined;
  }
  return warning(
    item.span,
    'ZAX structured control flow is deprecated in AZM; use explicit labels and branch instructions.',
  );
}

function deprecatedTypedAssignment(item: AsmInstructionNode): Diagnostic | undefined {
  if (item.head !== ':=') return undefined;
  return warning(
    item.span,
    'ZAX typed assignment is deprecated in AZM; use explicit Z80 instructions and layout constants.',
  );
}

function typedEaDiagnostic(expr: EaExprNode): Diagnostic | undefined {
  switch (expr.kind) {
    case 'EaReinterpret':
    case 'EaField':
    case 'EaIndex':
      return warning(
        expr.span,
        'ZAX typed effective-address syntax is deprecated in AZM; use sizeof/offset constants and explicit address arithmetic.',
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
    const control = deprecatedStructuredControl(item);
    if (control) diagnostics.push(control);
    if (item.kind !== 'AsmInstruction') continue;

    const assignment = deprecatedTypedAssignment(item);
    if (assignment) diagnostics.push(assignment);
    for (const operand of item.operands) diagnostics.push(...operandDiagnostics(operand));
  }
  return diagnostics;
}

function opDiagnostics(node: OpDeclNode): Diagnostic[] {
  return asmBlockDiagnostics(node.body);
}

function itemDiagnostics(item: ModuleItemNode | SectionItemNode): Diagnostic[] {
  switch (item.kind) {
    case 'FuncDecl':
      return [deprecatedFunction(item), ...asmBlockDiagnostics(item.asm)];
    case 'DataBlock':
      return [deprecatedDataBlock(item)];
    case 'VarBlock':
      return [deprecatedVarBlock(item)];
    case 'ExternDecl':
      return [deprecatedExtern(item)];
    case 'OpDecl':
      return opDiagnostics(item);
    case 'NamedSection':
      return sectionDiagnostics(item);
    default:
      return [];
  }
}

function sectionDiagnostics(section: NamedSectionNode): Diagnostic[] {
  return section.items.flatMap((item) => itemDiagnostics(item));
}

export function diagnosticsForAzmDeprecatedZaxConstructs(program: ProgramNode): Diagnostic[] {
  return program.files.flatMap((file) => file.items.flatMap((item) => itemDiagnostics(item)));
}
