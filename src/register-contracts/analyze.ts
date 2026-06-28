import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type {
  AnalyzeRegisterContractsOptions,
  RegisterContractsFinding,
  RegisterContractsAnnotationFile,
  RegisterContractsDirectCall,
  RegisterContractsJsonReportModel,
  RegisterContractsOutputCandidate,
  RegisterContractsPolicy,
  RegisterContractsPolicyMode,
  RegisterContractsRoutine,
  RegisterContractsReportModel,
  RoutineContract,
  RoutineSummary,
} from './types.js';
import { buildRegisterContractsProgramModel } from './programModel.js';
import { registerContractsPolicyModeForFile } from './policy.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import {
  renderRegisterContractsInterface,
  renderRegisterContractsJsonReport,
  renderRegisterContractsReport,
} from './report.js';
import {
  findCallerOutputCandidateObservations,
  findRegisterContractsConflicts,
} from './liveness.js';
import { buildAnnotations } from './annotations.js';
import {
  autoAcceptedOutputCandidateMap,
  buildRegisterContractsReportModel,
  diagnosticsForFindings,
  diagnosticsForConflicts,
  knownRoutineNames,
  outputCandidatesWithFixability,
  strictStackFindings,
  summariesForAnnotations,
  unknownBoundaryFindings,
} from './analyze-helpers.js';
import {
  buildProfileSummaries,
  buildSummaries,
  buildSummaryByName,
  outputCandidateKey,
  withAcceptedOutputs,
} from './summaries.js';

interface AnalyzeRegisterContractsResult {
  diagnostics: Diagnostic[];
  findings?: RegisterContractsFinding[];
  outputCandidates?: RegisterContractsOutputCandidate[];
  reportText?: string;
  reportJson?: RegisterContractsJsonReportModel;
  reportFormat?: 'text' | 'json';
  interfaceText?: string;
  annotations?: readonly RegisterContractsAnnotationFile[];
  unknownCalls?: string[];
}

export function analyzeRegisterContracts(
  loaded: {
    program: {
      files: readonly [
        {
          readonly kind: 'SourceFile';
          readonly name: string;
          readonly items: readonly SourceItem[];
        },
      ];
      entryFile: string;
    };
    sourceLineComments: ReadonlyMap<string, ReadonlyMap<number, string>>;
    sourceTexts: ReadonlyMap<string, string>;
  },
  options: AnalyzeRegisterContractsOptions,
): AnalyzeRegisterContractsResult {
  const file = loaded.program.files[0];
  const items = file?.items ?? [];
  const program = buildRegisterContractsProgramModel(items);
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const contractMap = buildRoutineContracts(smartComments, program.routines, loaded.sourceTexts);
  if (options.interfaceContracts !== undefined) {
    for (const contract of options.interfaceContracts) {
      contractMap.set(contract.name, contract);
    }
  }

  const profileSummaries = buildProfileSummaries(options.registerContractsProfile);
  let summaries = buildSummaries(program.routines, contractMap, profileSummaries);
  summaries = withAcceptedOutputs(summaries, options.acceptedOutputCandidates);
  let summariesByName = buildSummaryByName(program.routines, summaries, profileSummaries);
  const knownRoutines = knownRoutineNames(
    program.routines,
    contractMap.keys(),
    options.registerContractsProfile,
  );

  const shouldBuildOutputCandidates =
    options.mode !== 'off' ||
    options.policy !== undefined ||
    options.emitAnnotations === true ||
    options.fixRegisterContracts === true;

  const outputCandidates = shouldBuildOutputCandidates
    ? findCallerOutputCandidateObservations(program.routines, summariesByName)
    : [];
  const autoAcceptedOutputs = autoAcceptedOutputCandidateMap(
    program.routines,
    outputCandidates,
    loaded.sourceTexts,
  );
  if (autoAcceptedOutputs.size > 0) {
    summaries = withAcceptedOutputs(summaries, autoAcceptedOutputs);
    summariesByName = buildSummaryByName(program.routines, summaries, profileSummaries);
  }
  const conflicts = shouldBuildOutputCandidates
    ? program.routines.flatMap((routine) =>
        findRegisterContractsConflicts(routine, summariesByName, smartComments),
      )
    : [];
  const { outputCandidates: outputCandidatesWithAutoFixability, outputCandidateFixability } =
    outputCandidatesWithFixability(program.routines, outputCandidates);
  const diagnostics = options.policy === undefined ? diagnosticsForConflicts(conflicts, options.mode) : [];

  const unknownFindings = unknownBoundaryFindings(program.directBoundaries, knownRoutines);
  const stackFindings = strictStackFindings(program.routines, summaries);
  const scopedBoundaryFindings = scopedBoundaryContractFindings({
    directBoundaries: program.directBoundaries,
    routines: program.routines,
    contractMap,
    summariesByName,
    profileSummaryNames: new Set(profileSummaries.map((summary) => summary.name)),
    policy: options.policy,
    mode: options.mode,
  });
  const findings: RegisterContractsFinding[] =
    options.mode === 'off' && options.policy === undefined
      ? []
      : [
          ...conflicts.map((conflict) => ({
            kind: conflict.kind ?? 'definite_contract_violation',
            callTarget: conflict.callTarget,
            file: conflict.file,
            line: conflict.line,
            column: conflict.column,
            ...(conflict.sourceUnit !== undefined ? { sourceUnit: conflict.sourceUnit } : {}),
            ...(conflict.sourceRelation !== undefined
              ? { sourceRelation: conflict.sourceRelation }
              : {}),
            ...(conflict.sourceUnitRelation !== undefined
              ? { sourceUnitRelation: conflict.sourceUnitRelation }
              : {}),
            ...(conflict.routine !== undefined ? { routine: conflict.routine } : {}),
            carriers: conflict.carriers,
            message: conflict.message,
          })),
          ...unknownFindings,
          ...stackFindings,
          ...outputCandidatesWithAutoFixability.map((candidate): RegisterContractsFinding => {
            return {
              kind: 'output_candidate',
              routine: candidate.routine,
              file: candidate.file,
              line: candidate.line,
              column: candidate.column,
              ...(candidate.sourceUnit !== undefined ? { sourceUnit: candidate.sourceUnit } : {}),
              ...(candidate.sourceRelation !== undefined
                ? { sourceRelation: candidate.sourceRelation }
                : {}),
              ...(candidate.sourceUnitRelation !== undefined
                ? { sourceUnitRelation: candidate.sourceUnitRelation }
                : {}),
              carriers: candidate.carriers,
              message: candidate.message,
              ...(candidate.autoFixable !== undefined ? { autoFixable: candidate.autoFixable } : {}),
            };
          }),
          ...scopedBoundaryFindings,
        ];

  if (options.policy !== undefined) {
    diagnostics.push(...diagnosticsForScopedPolicy(findings, options.policy, options.mode));
  } else if (options.mode === 'strict') {
    diagnostics.push(...diagnosticsForFindings([...unknownFindings, ...stackFindings], 'strict'));
  }

  const reportModel: RegisterContractsReportModel = buildRegisterContractsReportModel({
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries,
    profileSummaries,
    findings,
    conflicts,
    outputCandidates: outputCandidatesWithAutoFixability,
    profile: options.registerContractsProfile,
    directBoundaries: program.directBoundaries,
    knownRoutines,
  });

  const summariesForAnnotationsByName = summariesForAnnotations(
    summariesByName,
    outputCandidatesWithAutoFixability,
  );

  const annotations = options.emitAnnotations
    ? buildAnnotations(
        loaded,
        program.routines,
        summariesForAnnotationsByName,
        outputCandidatesWithAutoFixability,
        {
          fixOutputCandidates: options.fixRegisterContracts === true,
          outputCandidateFixability,
          outputCandidateKey,
        },
      )
    : [];
  const renderedJsonReport =
    options.emitReport && (options.reportFormat ?? 'text') === 'json'
      ? renderRegisterContractsJsonReport(reportModel)
      : undefined;

  return {
    diagnostics,
    ...(findings.length > 0 ? { findings } : {}),
    outputCandidates: outputCandidatesWithAutoFixability,
    ...(options.emitReport
      ? renderedJsonReport !== undefined
        ? {
            reportText: renderedJsonReport.text,
            reportJson: renderedJsonReport.json,
            reportFormat: 'json' as const,
          }
        : { reportText: renderRegisterContractsReport(reportModel), reportFormat: 'text' as const }
      : {}),
    ...(options.emitInterface
      ? { interfaceText: renderRegisterContractsInterface(summaries) }
      : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(reportModel.unknownCalls.length > 0 ? { unknownCalls: reportModel.unknownCalls } : {}),
  };
}

function scopedBoundaryContractFindings(input: {
  directBoundaries: readonly RegisterContractsDirectCall[];
  routines: readonly RegisterContractsRoutine[];
  contractMap: ReadonlyMap<string, RoutineContract>;
  summariesByName: ReadonlyMap<string, RoutineSummary>;
  profileSummaryNames: ReadonlySet<string>;
  policy: RegisterContractsPolicy | undefined;
  mode: AnalyzeRegisterContractsOptions['mode'];
}): RegisterContractsFinding[] {
  if (input.policy === undefined) return [];
  const routinesByLabel = routinesByBoundaryLabel(input.routines);
  const out: RegisterContractsFinding[] = [];
  for (const boundary of input.directBoundaries) {
    const callerMode = policyModeForFile(boundary.file, input.policy, input.mode);
    if (callerMode !== 'strict') continue;
    const targetRoutine = routinesByLabel.get(boundary.target);
    if (targetRoutine === undefined) continue;
    const targetMode = policyModeForFile(targetRoutine.span.file, input.policy, input.mode);
    if (targetMode === 'strict') continue;
    if (
      hasExplicitBoundaryContract(
        boundary.target,
        input.contractMap,
        input.summariesByName,
        input.profileSummaryNames,
      )
    ) {
      continue;
    }
    const routine = routineNameForBoundary(boundary.file, boundary.line, input.routines);
    const targetDescription = registerContractsPolicyModeDescription(targetMode);
    out.push({
      kind: 'external_interface_unknown',
      callTarget: boundary.target,
      subject: boundary.subject,
      file: boundary.file,
      line: boundary.line,
      column: boundary.column,
      ...(boundary.sourceUnit !== undefined ? { sourceUnit: boundary.sourceUnit } : {}),
      ...(boundary.sourceRelation !== undefined ? { sourceRelation: boundary.sourceRelation } : {}),
      ...(boundary.sourceUnitRelation !== undefined
        ? { sourceUnitRelation: boundary.sourceUnitRelation }
        : {}),
      ...(routine !== undefined ? { routine } : {}),
      message: `strict register-contract source calls ${targetDescription} ${boundary.target}; add an explicit source, .asmi, or profile contract at the boundary.`,
    });
  }
  return out;
}

function routinesByBoundaryLabel(
  routines: readonly RegisterContractsRoutine[],
): ReadonlyMap<string, RegisterContractsRoutine> {
  const out = new Map<string, RegisterContractsRoutine>();
  for (const routine of routines) {
    for (const label of routine.labels) out.set(label, routine);
    for (const label of routine.entryLabels) out.set(label, routine);
    out.set(routine.name, routine);
  }
  return out;
}

function routineNameForBoundary(
  file: string,
  line: number,
  routines: readonly RegisterContractsRoutine[],
): string | undefined {
  return routines.find(
    (routine) =>
      routine.span.file === file &&
      routine.span.start.line <= line &&
      routine.span.end.line >= line,
  )?.name;
}

function hasExplicitBoundaryContract(
  target: string,
  contractMap: ReadonlyMap<string, RoutineContract>,
  summariesByName: ReadonlyMap<string, RoutineSummary>,
  profileSummaryNames: ReadonlySet<string>,
): boolean {
  if (contractMap.has(target)) return true;
  const summary = summariesByName.get(target);
  if (summary === undefined) return false;
  return contractMap.has(summary.name) || profileSummaryNames.has(target) || profileSummaryNames.has(summary.name);
}

function diagnosticsForScopedPolicy(
  findings: readonly RegisterContractsFinding[],
  policy: RegisterContractsPolicy,
  fallbackMode: AnalyzeRegisterContractsOptions['mode'],
): Diagnostic[] {
  return findings
    .filter((finding) => policyModeForFile(finding.file, policy, fallbackMode) === 'strict')
    .filter((finding) => finding.kind !== 'output_candidate')
    .map((finding) => ({
      severity: 'error',
      code: 'AZMN_REGISTER_CONTRACTS',
      sourceName: finding.file,
      line: finding.line,
      column: finding.column,
      message: finding.message,
    }));
}

function policyModeForFile(
  file: string,
  policy: RegisterContractsPolicy,
  fallbackMode: AnalyzeRegisterContractsOptions['mode'],
): RegisterContractsPolicyMode {
  return registerContractsPolicyModeForFile(file, policy, fallbackMode);
}

function registerContractsPolicyModeDescription(mode: RegisterContractsPolicyMode): string {
  return mode === 'off' ? 'disabled' : `${mode}ed`;
}
