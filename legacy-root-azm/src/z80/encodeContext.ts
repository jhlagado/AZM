import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';

type EncodeDiag = (
  diagnostics: Diagnostic[],
  node: { span: AsmInstructionNode['span'] },
  message: string,
) => void;

type IndexedReg8 = {
  prefix: number;
  code: number;
  display: 'IXH' | 'IXL' | 'IYH' | 'IYL';
};

export type EncoderRegisterContext = {
  diag: EncodeDiag;
  regName: (op: AsmOperandNode) => string | undefined;
  indexedReg8: (op: AsmOperandNode) => IndexedReg8 | undefined;
  reg8Code: (name: string) => number | undefined;
};

export type EncoderImmContext = {
  immValue: (op: AsmOperandNode, env: CompileEnv) => number | undefined;
  fitsImm8: (value: number) => boolean;
};

export type EncoderMemContext = {
  isMemHL: (op: AsmOperandNode) => boolean;
  memIndexed: (op: AsmOperandNode, env: CompileEnv) => { prefix: number; disp: number } | undefined;
};
