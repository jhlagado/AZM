import type { AsmInstructionNode, SourceSpan } from '../frontend/ast.js';

export type RegisterCareMode = 'off' | 'audit' | 'warn' | 'error' | 'strict';

export type RegisterCareUnit =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'H'
  | 'L'
  | 'F'
  | 'IXH'
  | 'IXL'
  | 'IYH'
  | 'IYL'
  | 'SPH'
  | 'SPL'
  | 'carry'
  | 'zero'
  | 'sign'
  | 'parity'
  | 'halfCarry'
  | 'negative';

export interface CarrierSet {
  units: RegisterCareUnit[];
}

export type SmartComment =
  | { kind: 'proc'; name: string }
  | { kind: 'extern'; name: string }
  | { kind: 'end' }
  | { kind: 'in'; carriers: RegisterCareUnit[]; name?: string }
  | { kind: 'out'; carriers: RegisterCareUnit[]; name?: string }
  | { kind: 'clobbers'; carriers: RegisterCareUnit[] }
  | { kind: 'preserves'; carriers: RegisterCareUnit[] }
  | { kind: 'expectOut'; carriers: RegisterCareUnit[]; name?: string };

export interface LocatedSmartComment {
  file: string;
  line: number;
  comment: SmartComment;
}

export interface RegisterCareInstruction {
  instruction: AsmInstructionNode;
  head: string;
  file: string;
  line: number;
  column: number;
}

export interface RegisterCareRoutine {
  name: string;
  span: SourceSpan;
  labels: string[];
  instructions: RegisterCareInstruction[];
}

export interface RegisterCareProgramModel {
  routines: RegisterCareRoutine[];
  directCallTargets: string[];
}
