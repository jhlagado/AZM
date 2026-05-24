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
  subject: string;
  file: string;
  line: number;
  column: number;
}

export interface RegisterCareProgramModel {
  routines: RegisterCareRoutine[];
  directCalls: RegisterCareDirectCall[];
  directBoundaries: RegisterCareDirectCall[];
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
  | { kind: 'return'; conditional: boolean }
  | { kind: 'jump'; target?: string; conditional: boolean }
  | { kind: 'unknown' };

export interface InstructionEffect {
  reads: RegisterCareUnit[];
  writes: RegisterCareUnit[];
  stack: StackEffect;
  control: ControlEffect;
}

export interface ValueRelation {
  out: RegisterCareUnit[];
  from: RegisterCareUnit[];
}

export interface RoutineSummary {
  name: string;
  mayRead: RegisterCareUnit[];
  mayWrite: RegisterCareUnit[];
  mayOutput?: RegisterCareUnit[];
  preserved: RegisterCareUnit[];
  valueRelations: ValueRelation[];
  stackBalanced: boolean;
  hasUnknownStackEffect?: boolean;
  outputCandidates?: RegisterCareUnit[];
}

export interface RegisterCareOutputCandidate {
  file: string;
  line: number;
  column: number;
  routine: string;
  carriers: RegisterCareUnit[];
  autoFixable?: boolean;
  message: string;
}

export interface RegisterCareConflict {
  file: string;
  line: number;
  column: number;
  callTarget: string;
  carriers: RegisterCareUnit[];
  message: string;
}

export interface RegisterCareReportModel {
  entryFile: string;
  mode: RegisterCareMode;
  profile?: string;
  summaries: RoutineSummary[];
  conflicts: RegisterCareConflict[];
  outputCandidates?: RegisterCareOutputCandidate[];
  unknownCalls: string[];
}

export interface AnalyzeRegisterCareOptions {
  mode: RegisterCareMode;
  emitReport: boolean;
  emitInterface: boolean;
  emitAnnotations?: boolean;
  fixRegisterContracts?: boolean;
  registerCareProfile?: 'mon3';
  interfaceContracts?: RoutineContract[];
  acceptedOutputCandidates?: ReadonlyMap<string, RegisterCareUnit[]>;
}

export interface RegisterCareAnnotationFile {
  readonly path: string;
  readonly text: string;
}
