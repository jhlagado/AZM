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
  | 'halfCarry';

export interface CarrierSet {
  units: RegisterCareUnit[];
}

export type StackEffect =
  | { kind: 'none' }
  | { kind: 'push'; units: RegisterCareUnit[] }
  | { kind: 'pop'; units: RegisterCareUnit[] }
  | { kind: 'exchangeTop'; units: RegisterCareUnit[] }
  | { kind: 'unknown' };

export type ControlEffect =
  | { kind: 'fallthrough' }
  | { kind: 'call'; target?: string; conditional: boolean }
  | { kind: 'rst'; vector?: number }
  | { kind: 'return' }
  | { kind: 'jump'; target?: string; conditional: boolean }
  | { kind: 'unknown' };

export interface InstructionEffect {
  reads: RegisterCareUnit[];
  writes: RegisterCareUnit[];
  stack: StackEffect;
  control: ControlEffect;
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

export interface RoutineContract {
  name: string;
  in: RegisterCareUnit[];
  out: RegisterCareUnit[];
  clobbers: RegisterCareUnit[];
  preserves: RegisterCareUnit[];
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

export interface RegisterCareDirectCall {
  target: string;
  subject: string;
  file: string;
  line: number;
  column: number;
}

export interface RegisterCareProgramModel {
  routines: RegisterCareRoutine[];
  directCallTargets: string[];
  directCalls: RegisterCareDirectCall[];
  directBoundaries: RegisterCareDirectCall[];
}

export interface ValueRelation {
  out: RegisterCareUnit[];
  from: RegisterCareUnit[];
}

export interface RoutineSummary {
  name: string;
  mayRead: RegisterCareUnit[];
  mayWrite: RegisterCareUnit[];
  preserved: RegisterCareUnit[];
  valueRelations: ValueRelation[];
  stackBalanced: boolean;
  hasUnknownStackEffect: boolean;
}

export interface RegisterCareConflict {
  file: string;
  line: number;
  column: number;
  callTarget: string;
  carriers: RegisterCareUnit[];
  message: string;
}

export interface RegisterCareUnknownBoundary {
  file: string;
  line: number;
  column: number;
  target: string;
  message: string;
}

export interface RegisterCareReportModel {
  entryFile: string;
  mode: RegisterCareMode;
  profile?: string;
  summaries: RoutineSummary[];
  conflicts: RegisterCareConflict[];
  unknownCalls: string[];
}
