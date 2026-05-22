import type { Z80Instruction } from '../z80/instruction.js';

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

export type SmartComment =
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
  complete?: boolean;
}

export interface RegisterCareInstruction {
  instruction: Z80Instruction;
  file: string;
  line: number;
  column: number;
  labels: string[];
}

export interface RegisterCareRoutine {
  name: string;
  labels: string[];
  entryLabels: string[];
  instructions: RegisterCareInstruction[];
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

export interface RegisterCareDirectCall {
  target: string;
  file: string;
  line: number;
  column: number;
}

export interface RegisterCareProgramModel {
  routines: RegisterCareRoutine[];
  directCalls: RegisterCareDirectCall[];
}

export interface RoutineSummary {
  name: string;
  mayRead: RegisterCareUnit[];
  mayWrite: RegisterCareUnit[];
  preserved: RegisterCareUnit[];
}

export interface RegisterCareReportModel {
  entryFile: string;
  mode: RegisterCareMode;
  summaries: RoutineSummary[];
  conflicts: [];
}

export interface AnalyzeRegisterCareOptions {
  mode: RegisterCareMode;
  emitReport: boolean;
  emitInterface: boolean;
  emitAnnotations?: boolean;
  interfaceContracts?: RoutineContract[];
  acceptedOutputCandidates?: ReadonlyMap<string, RegisterCareUnit[]>;
}

export interface RegisterCareAnnotationFile {
  readonly path: string;
  readonly text: string;
}
