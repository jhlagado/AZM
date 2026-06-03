import type { Z80Instruction } from '../z80/instruction.js';

export type RegisterContractsMode = 'off' | 'audit' | 'warn' | 'error' | 'strict';

/** @deprecated Use RegisterContractsMode. */
export type RegisterCareMode = RegisterContractsMode;

export type RegisterContractsUnit =
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

/** @deprecated Use RegisterContractsUnit. */
export type RegisterCareUnit = RegisterContractsUnit;

export type SmartComment =
  | { kind: 'extern'; name: string }
  | { kind: 'end' }
  | { kind: 'in'; carriers: RegisterContractsUnit[]; name?: string }
  | { kind: 'out'; carriers: RegisterContractsUnit[]; name?: string }
  | { kind: 'clobbers'; carriers: RegisterContractsUnit[] }
  | { kind: 'preserves'; carriers: RegisterContractsUnit[] }
  | { kind: 'expectOut'; carriers: RegisterContractsUnit[]; name?: string };

export interface LocatedSmartComment {
  file: string;
  line: number;
  comment: SmartComment;
}

export interface RoutineContract {
  name: string;
  in: RegisterContractsUnit[];
  out: RegisterContractsUnit[];
  clobbers: RegisterContractsUnit[];
  preserves: RegisterContractsUnit[];
  complete?: boolean;
}

export interface RegisterContractsInstruction {
  instruction: Z80Instruction;
  file: string;
  line: number;
  column: number;
  labels: string[];
  constants?: ReadonlyMap<string, number>;
}

/** @deprecated Use RegisterContractsInstruction. */
export type RegisterCareInstruction = RegisterContractsInstruction;

export interface RegisterContractsRoutine {
  name: string;
  labels: string[];
  entryLabels: string[];
  instructions: RegisterContractsInstruction[];
  constants?: ReadonlyMap<string, number>;
  span: {
    file: string;
    start: {
      line: number;
      column: number;
    };
    end: {
      line: number;
      column: number;
    };
  };
}

/** @deprecated Use RegisterContractsRoutine. */
export type RegisterCareRoutine = RegisterContractsRoutine;

export interface RegisterContractsDirectCall {
  target: string;
  subject: string;
  file: string;
  line: number;
  column: number;
}

/** @deprecated Use RegisterContractsDirectCall. */
export type RegisterCareDirectCall = RegisterContractsDirectCall;

export interface RegisterContractsProgramModel {
  routines: RegisterContractsRoutine[];
  directCalls: RegisterContractsDirectCall[];
  directBoundaries: RegisterContractsDirectCall[];
}

/** @deprecated Use RegisterContractsProgramModel. */
export type RegisterCareProgramModel = RegisterContractsProgramModel;

export type StackEffect =
  | { kind: 'none' }
  | { kind: 'push'; units: RegisterContractsUnit[] }
  | { kind: 'pop'; units: RegisterContractsUnit[] }
  | { kind: 'exchangeTop'; units: RegisterContractsUnit[] }
  | { kind: 'unknown' };

export type ControlEffect =
  | { kind: 'fallthrough' }
  | { kind: 'call'; target?: string; conditional: boolean }
  | { kind: 'rst'; vector?: number }
  | { kind: 'return'; conditional: boolean }
  | { kind: 'jump'; target?: string; conditional: boolean }
  | { kind: 'unknown' };

export interface InstructionEffect {
  reads: RegisterContractsUnit[];
  writes: RegisterContractsUnit[];
  stack: StackEffect;
  control: ControlEffect;
}

export interface ValueRelation {
  out: RegisterContractsUnit[];
  from: RegisterContractsUnit[];
}

export interface RoutineSummary {
  name: string;
  mayRead: RegisterContractsUnit[];
  mayWrite: RegisterContractsUnit[];
  mayOutput?: RegisterContractsUnit[];
  preserved: RegisterContractsUnit[];
  valueRelations: ValueRelation[];
  stackBalanced: boolean;
  hasUnknownStackEffect?: boolean;
  outputCandidates?: RegisterContractsUnit[];
}

export interface RegisterContractsOutputCandidate {
  file: string;
  line: number;
  column: number;
  routine: string;
  carriers: RegisterContractsUnit[];
  autoFixable?: boolean;
  message: string;
}

/** @deprecated Use RegisterContractsOutputCandidate. */
export type RegisterCareOutputCandidate = RegisterContractsOutputCandidate;

export interface RegisterContractsConflict {
  file: string;
  line: number;
  column: number;
  callTarget: string;
  carriers: RegisterContractsUnit[];
  message: string;
}

/** @deprecated Use RegisterContractsConflict. */
export type RegisterCareConflict = RegisterContractsConflict;

export interface RegisterContractsReportModel {
  entryFile: string;
  mode: RegisterContractsMode;
  profile?: string;
  summaries: RoutineSummary[];
  conflicts: RegisterContractsConflict[];
  outputCandidates?: RegisterContractsOutputCandidate[];
  unknownCalls: string[];
}

export interface AnalyzeRegisterContractsOptions {
  mode: RegisterContractsMode;
  emitReport: boolean;
  emitInterface: boolean;
  emitAnnotations?: boolean;
  fixRegisterContracts?: boolean;
  registerContractsProfile?: 'mon3';
  interfaceContracts?: RoutineContract[];
  acceptedOutputCandidates?: ReadonlyMap<string, RegisterContractsUnit[]>;
}

export interface RegisterContractsAnnotationFile {
  readonly path: string;
  readonly text: string;
}
