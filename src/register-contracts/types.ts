import type { Z80Instruction } from '../z80/instruction.js';
import type { RegisterContractsUnit } from '../model/register-contract.js';
import type { RoutineContractDeclaration } from '../model/register-contract.js';
import type { SourceSpan } from '../source/source-span.js';

export type { RegisterContractsUnit } from '../model/register-contract.js';

export type RegisterContractsMode = 'off' | 'audit' | 'warn' | 'error' | 'strict';
export type RegisterContractsReportFormat = 'text' | 'json';
export type RegisterContractsInferenceFormat = 'json' | 'markdown';

export type RegisterContractsPolicyMode = 'off' | 'audit' | 'strict';

export interface RegisterContractsPolicy {
  strict?: readonly string[];
  audit?: readonly string[];
  off?: readonly string[];
}

export type RegisterContractsStackFrameUnit = 'AF' | 'BC' | 'DE' | 'HL' | 'IX' | 'IY';

export type SmartComment =
  | { kind: 'extern'; name: string }
  | { kind: 'end' }
  | { kind: 'in'; carriers: RegisterContractsUnit[]; name?: string }
  | { kind: 'out'; carriers: RegisterContractsUnit[]; name?: string }
  | { kind: 'clobbers'; carriers: RegisterContractsUnit[] }
  | { kind: 'preserves'; carriers: RegisterContractsUnit[] }
  | { kind: 'expectOut'; carriers: RegisterContractsUnit[]; name?: string }
  | { kind: 'rcIgnoreNext'; findingKind: RegisterContractsFindingKind; reason: string };

export interface LocatedSmartComment {
  file: string;
  line: number;
  targetLine?: number;
  targetColumn?: number;
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

export interface RegisterContractsServiceRangeContract {
  vector: number;
  selector: RegisterContractsUnit;
  min: number;
  max?: number;
  target: string;
}

export interface RegisterContractsInstruction {
  instruction: Z80Instruction;
  file: string;
  line: number;
  column: number;
  sourceUnit?: string;
  sourceRelation?: 'entry' | 'include' | 'import';
  sourceUnitRelation?: 'entry' | 'include' | 'import';
  labels: string[];
  resolvedTarget?: string;
  constants?: ReadonlyMap<string, number>;
}

export interface RegisterContractsRoutine {
  name: string;
  identity?: string;
  isExported?: boolean;
  exportedEntryLabels?: string[];
  labels: string[];
  entryLabels: string[];
  declaredContract?: RoutineContractDeclaration;
  directiveSpan?: SourceSpan;
  instructions: RegisterContractsInstruction[];
  constants?: ReadonlyMap<string, number>;
  span: {
    file: string;
    sourceUnit?: string;
    sourceRelation?: 'entry' | 'include' | 'import';
    sourceUnitRelation?: 'entry' | 'include' | 'import';
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

export interface RegisterContractsDirectCall {
  target: string;
  targetIdentity?: string;
  subject: string;
  file: string;
  line: number;
  column: number;
  sourceUnit?: string;
  sourceRelation?: 'entry' | 'include' | 'import';
  sourceUnitRelation?: 'entry' | 'include' | 'import';
}

export interface RegisterContractsProgramModel {
  routines: RegisterContractsRoutine[];
  directCalls: RegisterContractsDirectCall[];
  directBoundaries: RegisterContractsDirectCall[];
}

type StackEffect =
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
  identity?: string;
  mayRead: RegisterContractsUnit[];
  mayWrite: RegisterContractsUnit[];
  mayOutput?: RegisterContractsUnit[];
  preserved: RegisterContractsUnit[];
  valueRelations: ValueRelation[];
  stackBalanced: boolean;
  hasUnknownStackEffect?: boolean;
  consumesStackFrame?: RegisterContractsStackFrameUnit[];
  outputCandidates?: RegisterContractsUnit[];
}

export interface RegisterContractsOutputCandidate {
  kind?: 'output_candidate';
  file: string;
  line: number;
  column: number;
  sourceUnit?: string;
  sourceRelation?: 'entry' | 'include' | 'import';
  sourceUnitRelation?: 'entry' | 'include' | 'import';
  routine: string;
  routineIdentity?: string;
  carriers: RegisterContractsUnit[];
  autoFixable?: boolean;
  message: string;
}

export interface RegisterContractsConflict {
  kind?: 'definite_contract_violation' | 'flag_lifetime_risk';
  file: string;
  line: number;
  column: number;
  sourceUnit?: string;
  sourceRelation?: 'entry' | 'include' | 'import';
  sourceUnitRelation?: 'entry' | 'include' | 'import';
  routine?: string;
  routineIdentity?: string;
  callTarget: string;
  carriers: RegisterContractsUnit[];
  message: string;
}

export type RegisterContractsFindingKind =
  | 'definite_contract_violation'
  | 'declaration_contract_mismatch'
  | 'flag_lifetime_risk'
  | 'missing_callee_contract'
  | 'unknown_control_flow'
  | 'external_interface_unknown'
  | 'output_candidate';

interface RegisterContractsFindingBase {
  kind: RegisterContractsFindingKind;
  file: string;
  line: number;
  column: number;
  sourceUnit?: string;
  sourceRelation?: 'entry' | 'include' | 'import';
  sourceUnitRelation?: 'entry' | 'include' | 'import';
  message: string;
  routine?: string;
  routineIdentity?: string;
  carriers?: RegisterContractsUnit[];
}

interface RegisterContractsConflictFinding extends RegisterContractsFindingBase {
  kind: 'definite_contract_violation' | 'flag_lifetime_risk';
  callTarget: string;
}

interface RegisterContractsUnknownBoundaryFinding extends RegisterContractsFindingBase {
  kind: 'missing_callee_contract' | 'external_interface_unknown';
  callTarget: string;
  subject: string;
}

interface RegisterContractsStackFinding extends RegisterContractsFindingBase {
  kind: 'unknown_control_flow';
  routine: string;
  stackBalanced: boolean;
  hasUnknownStackEffect?: boolean;
}

interface RegisterContractsDeclarationMismatchFinding extends RegisterContractsFindingBase {
  kind: 'declaration_contract_mismatch';
  routine: string;
  carriers: RegisterContractsUnit[];
}

interface RegisterContractsOutputCandidateFinding extends RegisterContractsFindingBase {
  kind: 'output_candidate';
  routine: string;
  autoFixable?: boolean;
}

export type RegisterContractsFinding =
  | RegisterContractsConflictFinding
  | RegisterContractsUnknownBoundaryFinding
  | RegisterContractsStackFinding
  | RegisterContractsDeclarationMismatchFinding
  | RegisterContractsOutputCandidateFinding;

export interface RegisterContractsReportModel {
  entryFile: string;
  mode: RegisterContractsMode;
  filePolicies?: Readonly<Record<string, RegisterContractsPolicyMode>>;
  profile?: string;
  summaries: RoutineSummary[];
  findings?: RegisterContractsFinding[];
  suppressedFindings?: RegisterContractsSuppressedFinding[];
  conflicts: RegisterContractsConflict[];
  outputCandidates?: RegisterContractsOutputCandidate[];
  unknownCalls: string[];
  ratchet?: RegisterContractsRatchetResult;
}

export interface RegisterContractsJsonLocation {
  file: string;
  line: number;
  column: number;
  sourceUnit?: string;
  sourceRelation?: 'entry' | 'include' | 'import';
  sourceUnitRelation?: 'entry' | 'include' | 'import';
}

export interface RegisterContractsJsonRemediation {
  category:
    | 'add_contract'
    | 'fix_call_or_contract'
    | 'fix_declaration_contract'
    | 'review_control_flow'
    | 'review_output_contract';
  hint: string;
}

export interface RegisterContractsJsonFinding {
  kind: RegisterContractsFindingKind;
  location: RegisterContractsJsonLocation;
  message: string;
  routine?: string;
  routineIdentity?: string;
  callTarget?: string;
  subject?: string;
  carriers?: RegisterContractsUnit[];
  stackBalanced?: boolean;
  hasUnknownStackEffect?: boolean;
  autoFixable?: boolean;
  remediation: RegisterContractsJsonRemediation;
}

export interface RegisterContractsSuppression {
  file: string;
  line: number;
  column: number;
  findingKind: RegisterContractsFindingKind;
  reason: string;
  directiveLine?: number;
  directiveColumn?: number;
}

export interface RegisterContractsSuppressedFinding {
  finding: RegisterContractsFinding;
  suppression: RegisterContractsSuppression;
}

export interface RegisterContractsJsonReportModel {
  format: 'azm-register-contracts-report';
  version: 1;
  entryFile: string;
  mode: RegisterContractsMode;
  filePolicies?: Readonly<Record<string, RegisterContractsPolicyMode>>;
  profile?: string;
  summaries: RoutineSummary[];
  findings: RegisterContractsJsonFinding[];
  suppressedFindings?: Array<{
    finding: RegisterContractsJsonFinding;
    suppression: RegisterContractsSuppression;
  }>;
  unknownCalls: string[];
  ratchet?: RegisterContractsRatchetResult;
}

export interface RegisterContractsInferenceRoutine {
  name: string;
  identity: string;
  in: RegisterContractsUnit[];
  out: RegisterContractsUnit[];
  clobbers: RegisterContractsUnit[];
  preserves: RegisterContractsUnit[];
  confidence: 'explicit' | 'inferred' | 'draft';
  callerImpact: {
    outputCandidateCount: number;
    outputCandidateCarriers: RegisterContractsUnit[];
  };
}

export interface RegisterContractsInferenceModel {
  format: 'azm-register-contracts-inference';
  version: 1;
  routines: RegisterContractsInferenceRoutine[];
}

export interface RegisterContractsRatchetEntry {
  identity: string;
  finding: RegisterContractsJsonFinding;
}

export interface RegisterContractsRatchetResult {
  baselineFile?: string;
  newFindings: RegisterContractsRatchetEntry[];
  removedFindings: RegisterContractsRatchetEntry[];
  changedFindings: Array<{
    identity: string;
    baseline: RegisterContractsJsonFinding;
    current: RegisterContractsJsonFinding;
  }>;
}

export interface AnalyzeRegisterContractsOptions {
  mode: RegisterContractsMode;
  policy?: RegisterContractsPolicy;
  emitReport: boolean;
  reportFormat?: RegisterContractsReportFormat;
  emitInterface: boolean;
  emitInference?: boolean;
  inferenceFormat?: RegisterContractsInferenceFormat;
  emitAnnotations?: boolean;
  fixRegisterContracts?: boolean;
  registerContractsProfile?: 'mon3';
  interfaceContracts?: RoutineContract[];
  interfaceServiceRanges?: RegisterContractsServiceRangeContract[];
  acceptedOutputCandidates?: ReadonlyMap<string, RegisterContractsUnit[]>;
  baselineReport?: RegisterContractsJsonReportModel;
  baselineFile?: string;
  ratchet?: boolean;
}

export interface RegisterContractsAnnotationFile {
  readonly path: string;
  readonly text: string;
}
