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
  RegisterContractsSuppressedFinding,
  RegisterContractsSuppression,
  RoutineContract,
  RoutineSummary,
} from './types.js';
import { buildRegisterContractsProgramModel } from './programModel.js';
import { registerContractsPolicyModeForFile } from './policy.js';
import {
  effectiveFilePolicies,
  filterBaselineForAnalyzedFiles,
  registerContractsArtifactFallbackMode,
} from './analysis-policy.js';
import {
  publicRoutineIdentity,
  withPublicCandidateIdentity,
  withPublicRoutineIdentity,
  withPublicSummaryIdentity,
} from './public-routine-identity.js';
import {
  applyRegisterContractsSuppressions,
  findingKey,
  matchOutputCandidateSuppressions,
  registerContractsDirectiveComments,
  registerContractsDirectiveSuppressions,
  staleSuppressionDiagnostics,
} from './analysis-suppressions.js';
import { buildDeclaredRoutineContracts } from './smartComments.js';
import {
  renderRegisterContractsInterface,
  buildRegisterContractsJsonReport,
  buildRegisterContractsInference,
  renderRegisterContractsInferenceMarkdown,
  renderRegisterContractsJsonReport,
  renderRegisterContractsReport,
} from './report.js';
import { compareRegisterContractsBaseline } from './ratchet.js';
import {
  findCallerOutputCandidateObservations,
  findRegisterContractsConflicts,
} from './liveness.js';
import { buildAnnotations } from './annotations.js';
import {
  autoAcceptedOutputCandidateMap,
  buildRegisterContractsReportModel,
  declarationContractMismatchFindings,
  diagnosticsForFindings,
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
  inferenceText?: string;
  inferenceJson?: ReturnType<typeof buildRegisterContractsInference>;
  inferenceFormat?: 'json' | 'markdown';
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
  const sourcePolicy = registerContractsSourcePolicy(items);
  const analysisFallbackMode = registerContractsArtifactFallbackMode(options);
  const filePolicies = effectiveFilePolicies(
    loaded.sourceTexts.keys(),
    options,
    sourcePolicy,
    analysisFallbackMode,
  );
  const isAnalyzedFile = (sourceName: string): boolean =>
    (filePolicies.get(sourceName) ??
      policyModeForFile(sourceName, options.policy ?? {}, options.mode, sourcePolicy)) !== 'off';
  const program = buildRegisterContractsProgramModel(items);
  const artifactRoutines = program.routines.filter((routine) => isAnalyzedFile(routine.span.file));
  const allRoutineIdentities = new Set(
    program.routines.map((routine) => routine.identity ?? routine.name),
  );
  const artifactRoutineIdentities = new Set(
    artifactRoutines.map((routine) => routine.identity ?? routine.name),
  );
  const publicRoutineIdentities = new Map(
    program.routines.map((routine) => [
      routine.identity ?? routine.name,
      publicRoutineIdentity(loaded.program.entryFile, routine),
    ]),
  );
  const interfaceRoutineIdentities = new Set(
    artifactRoutines
      .filter(
        (routine) => routine.span.sourceUnitRelation !== 'import' || routine.isExported === true,
      )
      .map((routine) => routine.identity ?? routine.name),
  );
  const isArtifactSummary = (summary: RoutineSummary): boolean => {
    const identity = summary.identity ?? summary.name;
    return !allRoutineIdentities.has(identity) || artifactRoutineIdentities.has(identity);
  };
  const isInterfaceSummary = (summary: RoutineSummary): boolean => {
    const identity = summary.identity ?? summary.name;
    return !allRoutineIdentities.has(identity) || interfaceRoutineIdentities.has(identity);
  };
  const artifactBoundaries = program.directBoundaries.filter((boundary) =>
    isAnalyzedFile(boundary.file),
  );
  const smartComments = registerContractsDirectiveComments(items);
  const suppressions = registerContractsDirectiveSuppressions(items).filter((suppression) =>
    isAnalyzedFile(suppression.file),
  );
  const contractMap = buildDeclaredRoutineContracts(program.routines);
  const interfaceContractMap = new Map<string, RoutineContract>();
  if (options.interfaceContracts !== undefined) {
    for (const contract of options.interfaceContracts) {
      contractMap.set(contract.name, contract);
      interfaceContractMap.set(contract.name, contract);
    }
  }

  const profileSummaries = buildProfileSummaries(options.registerContractsProfile);
  const interfaceServiceRanges = options.interfaceServiceRanges ?? [];
  let summaries = buildSummaries(
    program.routines,
    contractMap,
    profileSummaries,
    interfaceServiceRanges,
  );
  // Body-vs-declaration checks must see callee body effects, not callee declarations
  // that may incorrectly claim preserves.
  const bodyInferredSummariesByName = buildSummaryByName(
    program.routines,
    buildSummaries(
      program.routines,
      interfaceContractMap,
      profileSummaries,
      interfaceServiceRanges,
    ),
    profileSummaries,
  );
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
    options.fixRegisterContracts === true ||
    options.emitInference === true ||
    sourcePolicy.size > 0;

  const outputCandidates = shouldBuildOutputCandidates
    ? findCallerOutputCandidateObservations(program.routines, summariesByName).filter((candidate) =>
        isAnalyzedFile(candidate.file),
      )
    : [];
  const consumedSuppressions = new Set<RegisterContractsSuppression>();
  const outputCandidateSuppressions = matchOutputCandidateSuppressions(
    outputCandidates,
    suppressions,
    consumedSuppressions,
  );
  const suppressedOutputCandidateKeys = new Set(outputCandidateSuppressions.keys());
  const outputCandidatesForPromotion = outputCandidates.filter(
    (candidate) =>
      !suppressedOutputCandidateKeys.has(
        findingKey({
          kind: 'output_candidate',
          file: candidate.file,
          line: candidate.line,
          column: candidate.column,
        }),
      ),
  );
  const autoAcceptedOutputs = autoAcceptedOutputCandidateMap(
    program.routines,
    outputCandidatesForPromotion,
    loaded.sourceTexts,
  );
  if (autoAcceptedOutputs.size > 0) {
    summaries = withAcceptedOutputs(summaries, autoAcceptedOutputs);
    summariesByName = buildSummaryByName(program.routines, summaries, profileSummaries);
  }
  const conflicts = shouldBuildOutputCandidates
    ? program.routines
        .flatMap((routine) =>
          findRegisterContractsConflicts(
            routine,
            summariesByName,
            smartComments,
            interfaceServiceRanges,
          ),
        )
        .filter((conflict) => isAnalyzedFile(conflict.file))
    : [];
  const { outputCandidates: outputCandidatesWithAutoFixability, outputCandidateFixability } =
    outputCandidatesWithFixability(program.routines, outputCandidatesForPromotion);
  const { outputCandidates: allOutputCandidatesWithAutoFixability } =
    outputCandidatesWithFixability(program.routines, outputCandidates);
  const diagnostics: Diagnostic[] = [];

  const unknownFindings = unknownBoundaryFindings(artifactBoundaries, knownRoutines);
  const stackFindings = strictStackFindings(artifactRoutines, summaries);
  const declarationMismatchFindings = declarationContractMismatchFindings(
    artifactRoutines,
    bodyInferredSummariesByName,
  );
  const scopedBoundaryFindings = scopedBoundaryContractFindings({
    directBoundaries: program.directBoundaries,
    routines: program.routines,
    contractMap,
    summariesByName,
    profileSummaryNames: new Set(profileSummaries.map((summary) => summary.name)),
    policy: options.policy,
    sourcePolicy,
    mode: options.mode,
  });
  const findings: RegisterContractsFinding[] =
    options.mode === 'off' && options.policy === undefined && sourcePolicy.size === 0
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
            ...(conflict.routineIdentity !== undefined
              ? { routineIdentity: conflict.routineIdentity }
              : {}),
            carriers: conflict.carriers,
            message: conflict.message,
          })),
          ...unknownFindings,
          ...stackFindings,
          ...declarationMismatchFindings,
          ...outputCandidatesWithAutoFixability.map((candidate): RegisterContractsFinding => {
            return {
              kind: 'output_candidate',
              routine: candidate.routine,
              ...(candidate.routineIdentity !== undefined
                ? { routineIdentity: candidate.routineIdentity }
                : {}),
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
              ...(candidate.autoFixable !== undefined
                ? { autoFixable: candidate.autoFixable }
                : {}),
            };
          }),
          ...scopedBoundaryFindings,
        ].filter((finding) => isAnalyzedFile(finding.file));
  const { activeFindings, suppressedFindings: directlySuppressedFindings } =
    applyRegisterContractsSuppressions(findings, suppressions, consumedSuppressions);
  const suppressedOutputCandidateFindings = allOutputCandidatesWithAutoFixability
    .filter((candidate) =>
      suppressedOutputCandidateKeys.has(
        findingKey({ ...candidate, kind: 'output_candidate' as const }),
      ),
    )
    .map((candidate): RegisterContractsSuppressedFinding | undefined => {
      const suppression = outputCandidateSuppressions.get(
        findingKey({ ...candidate, kind: 'output_candidate' as const }),
      );
      if (suppression === undefined) return undefined;
      return {
        suppression,
        finding: {
          kind: 'output_candidate',
          routine: candidate.routine,
          ...(candidate.routineIdentity !== undefined
            ? { routineIdentity: candidate.routineIdentity }
            : {}),
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
        },
      };
    })
    .filter((item): item is RegisterContractsSuppressedFinding => item !== undefined);
  const suppressedFindings = [...directlySuppressedFindings, ...suppressedOutputCandidateFindings];
  diagnostics.push(
    ...staleSuppressionDiagnostics(
      suppressions.filter((suppression) => !consumedSuppressions.has(suppression)),
      options,
      sourcePolicy,
    ),
  );
  const activeOutputCandidates = outputCandidatesWithAutoFixability.filter(
    (candidate) =>
      !suppressedOutputCandidateKeys.has(
        findingKey({ ...candidate, kind: 'output_candidate' as const }),
      ),
  );
  const activeConflictFindings = activeFindings.filter(
    (finding) =>
      finding.kind === 'definite_contract_violation' ||
      finding.kind === 'declaration_contract_mismatch' ||
      finding.kind === 'flag_lifetime_risk',
  );
  const publicActiveFindings = activeFindings.map((finding) =>
    withPublicRoutineIdentity(finding, publicRoutineIdentities),
  );
  const publicSuppressedFindings = suppressedFindings.map((item) => ({
    ...item,
    finding: withPublicRoutineIdentity(item.finding, publicRoutineIdentities),
  }));
  const publicOutputCandidates = activeOutputCandidates.map((candidate) =>
    withPublicCandidateIdentity(candidate, publicRoutineIdentities),
  );
  const publicSummaries = summaries
    .filter(isArtifactSummary)
    .map((summary) => withPublicSummaryIdentity(summary, publicRoutineIdentities));
  const publicProfileSummaries = profileSummaries.map((summary) => ({
    ...summary,
    identity: `profile:${summary.name}`,
  }));

  if (options.policy !== undefined || sourcePolicy.size > 0) {
    diagnostics.push(
      ...diagnosticsForScopedPolicy(
        activeFindings,
        options.policy ?? {},
        options.mode,
        sourcePolicy,
      ),
    );
  } else if (options.mode === 'strict') {
    diagnostics.push(...diagnosticsForFindings(activeConflictFindings, options.mode));
    diagnostics.push(
      ...diagnosticsForFindings(
        activeFindings.filter(
          (finding) =>
            finding.kind === 'missing_callee_contract' || finding.kind === 'unknown_control_flow',
        ),
        'strict',
      ),
    );
  } else {
    diagnostics.push(...diagnosticsForFindings(activeConflictFindings, options.mode));
  }

  const reportModel: RegisterContractsReportModel = buildRegisterContractsReportModel({
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries: publicSummaries,
    profileSummaries: publicProfileSummaries,
    filePolicies: Object.fromEntries([...filePolicies.entries()]),
    findings: publicActiveFindings,
    ...(publicSuppressedFindings.length > 0
      ? { suppressedFindings: publicSuppressedFindings }
      : {}),
    conflicts: conflicts
      .filter((conflict) =>
        activeConflictFindings.some(
          (finding) =>
            finding.file === conflict.file &&
            finding.line === conflict.line &&
            finding.column === conflict.column &&
            'callTarget' in finding &&
            finding.callTarget === conflict.callTarget,
        ),
      )
      .map((conflict) => withPublicRoutineIdentity(conflict, publicRoutineIdentities)),
    outputCandidates: publicOutputCandidates,
    profile: options.registerContractsProfile,
    directBoundaries: artifactBoundaries,
    knownRoutines,
  });
  if (options.baselineReport !== undefined) {
    const currentJson = buildRegisterContractsJsonReport(reportModel);
    const baselineReport = filterBaselineForAnalyzedFiles(options.baselineReport, isAnalyzedFile);
    const ratchet = compareRegisterContractsBaseline(
      currentJson,
      baselineReport,
      options.baselineFile,
    );
    reportModel.ratchet = ratchet;
    if (options.ratchet === true) {
      for (const entry of ratchet.newFindings) {
        diagnostics.push({
          severity: 'error',
          code: 'AZMN_REGISTER_CONTRACTS',
          sourceName: entry.finding.location.file,
          line: entry.finding.location.line,
          column: entry.finding.location.column,
          message: `Register contract ratchet found new ${entry.finding.kind}: ${entry.finding.message}`,
        });
      }
      for (const entry of ratchet.changedFindings) {
        diagnostics.push({
          severity: 'error',
          code: 'AZMN_REGISTER_CONTRACTS',
          sourceName: entry.current.location.file,
          line: entry.current.location.line,
          column: entry.current.location.column,
          message: `Register contract ratchet found changed ${entry.current.kind}: ${entry.current.message}`,
        });
      }
    }
  }

  const summariesForAnnotationsByName = summariesForAnnotations(
    summariesByName,
    activeOutputCandidates,
  );

  const annotations = options.emitAnnotations
    ? buildAnnotations(
        loaded,
        artifactRoutines,
        summariesForAnnotationsByName,
        activeOutputCandidates,
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
  const canonicalSummariesByName = new Map(
    publicSummaries.map((summary) => [summary.identity ?? summary.name, summary]),
  );
  const summariesForInference = summariesForAnnotations(
    canonicalSummariesByName,
    publicOutputCandidates,
  );
  const inferenceModel = options.emitInference
    ? buildRegisterContractsInference([...summariesForInference.values()])
    : undefined;
  const inferenceFormat = options.inferenceFormat ?? 'json';

  return {
    diagnostics,
    ...(publicActiveFindings.length > 0 ? { findings: publicActiveFindings } : {}),
    outputCandidates: publicOutputCandidates,
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
      ? {
          interfaceText: renderRegisterContractsInterface(
            summaries
              .filter(isInterfaceSummary)
              .map((summary) => withPublicSummaryIdentity(summary, publicRoutineIdentities)),
          ),
        }
      : {}),
    ...(inferenceModel !== undefined
      ? inferenceFormat === 'markdown'
        ? {
            inferenceText: renderRegisterContractsInferenceMarkdown(inferenceModel),
            inferenceJson: inferenceModel,
            inferenceFormat,
          }
        : {
            inferenceText: `${JSON.stringify(inferenceModel, null, 2)}\n`,
            inferenceJson: inferenceModel,
            inferenceFormat,
          }
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
  sourcePolicy: ReadonlyMap<string, RegisterContractsPolicyMode>;
  mode: AnalyzeRegisterContractsOptions['mode'];
}): RegisterContractsFinding[] {
  if (input.policy === undefined && input.sourcePolicy.size === 0) return [];
  const routinesByLabel = routinesByBoundaryLabel(input.routines);
  const out: RegisterContractsFinding[] = [];
  for (const boundary of input.directBoundaries) {
    const targetIdentity = boundary.targetIdentity ?? boundary.target;
    const callerMode = policyModeForFile(
      boundary.file,
      input.policy ?? {},
      input.mode,
      input.sourcePolicy,
    );
    if (callerMode !== 'strict') continue;
    const targetRoutine = routinesByLabel.get(targetIdentity);
    if (targetRoutine === undefined) continue;
    const targetMode = policyModeForFile(
      targetRoutine.span.file,
      input.policy ?? {},
      input.mode,
      input.sourcePolicy,
    );
    if (targetMode === 'strict') continue;
    if (
      hasExplicitBoundaryContract(
        targetIdentity,
        input.contractMap,
        input.summariesByName,
        input.profileSummaryNames,
      )
    ) {
      continue;
    }
    const routine = routineForBoundary(boundary.file, boundary.line, input.routines);
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
      ...(routine !== undefined
        ? {
            routine: routine.name,
            routineIdentity: routine.identity ?? routine.name,
          }
        : {}),
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
    out.set(routine.identity ?? routine.name, routine);
    if (routine.span.sourceUnitRelation !== 'import') {
      for (const label of routine.entryLabels) out.set(label, routine);
    }
    for (const label of routine.exportedEntryLabels ?? []) out.set(label, routine);
  }
  return out;
}

function routineForBoundary(
  file: string,
  line: number,
  routines: readonly RegisterContractsRoutine[],
): RegisterContractsRoutine | undefined {
  return routines.find(
    (routine) =>
      routine.span.file === file &&
      routine.span.start.line <= line &&
      routine.span.end.line >= line,
  );
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
  return (
    contractMap.has(summary.name) ||
    profileSummaryNames.has(target) ||
    profileSummaryNames.has(summary.name)
  );
}

function diagnosticsForScopedPolicy(
  findings: readonly RegisterContractsFinding[],
  policy: RegisterContractsPolicy,
  fallbackMode: AnalyzeRegisterContractsOptions['mode'],
  sourcePolicy: ReadonlyMap<string, RegisterContractsPolicyMode>,
): Diagnostic[] {
  return findings
    .filter(
      (finding) => policyModeForFile(finding.file, policy, fallbackMode, sourcePolicy) === 'strict',
    )
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
  sourcePolicy: ReadonlyMap<string, RegisterContractsPolicyMode> = new Map(),
): RegisterContractsPolicyMode {
  return registerContractsPolicyModeForFile(file, policy, fallbackMode, sourcePolicy.get(file));
}

function registerContractsSourcePolicy(
  items: readonly SourceItem[],
): ReadonlyMap<string, RegisterContractsPolicyMode> {
  const out = new Map<string, RegisterContractsPolicyMode>();
  for (const item of items) {
    if (item.kind === 'contracts-policy') out.set(item.span.sourceName, item.mode);
  }
  return out;
}

function registerContractsPolicyModeDescription(mode: RegisterContractsPolicyMode): string {
  return mode === 'off' ? 'disabled' : `${mode}ed`;
}
