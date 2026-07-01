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
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
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
  const program = buildRegisterContractsProgramModel(items);
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const suppressionSyntaxDiagnostics = malformedSuppressionDiagnostics(
    loaded.sourceLineComments,
    options.mode,
    options.policy,
  );
  const suppressions = registerContractsSuppressions(smartComments);
  const contractMap = buildRoutineContracts(smartComments, program.routines, loaded.sourceTexts);
  if (options.interfaceContracts !== undefined) {
    for (const contract of options.interfaceContracts) {
      contractMap.set(contract.name, contract);
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
    options.emitInference === true;

  const outputCandidates = shouldBuildOutputCandidates
    ? findCallerOutputCandidateObservations(program.routines, summariesByName)
    : [];
  const suppressedOutputCandidateKeys = new Set(
    outputCandidates
      .filter((candidate) => isSuppressedFinding(candidate, 'output_candidate', suppressions))
      .map((candidate) =>
        findingKey({
          kind: 'output_candidate',
          file: candidate.file,
          line: candidate.line,
          column: candidate.column,
        }),
      ),
  );
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
    ? program.routines.flatMap((routine) =>
        findRegisterContractsConflicts(
          routine,
          summariesByName,
          smartComments,
          interfaceServiceRanges,
        ),
      )
    : [];
  const { outputCandidates: outputCandidatesWithAutoFixability, outputCandidateFixability } =
    outputCandidatesWithFixability(program.routines, outputCandidatesForPromotion);
  const { outputCandidates: allOutputCandidatesWithAutoFixability } =
    outputCandidatesWithFixability(program.routines, outputCandidates);
  const diagnostics = [...suppressionSyntaxDiagnostics];

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
  const { activeFindings, suppressedFindings: directlySuppressedFindings } = applyRegisterContractsSuppressions(
    findings,
    suppressions,
  );
  const suppressedOutputCandidateFindings = allOutputCandidatesWithAutoFixability
    .filter((candidate) =>
      suppressedOutputCandidateKeys.has(
        findingKey({ ...candidate, kind: 'output_candidate' as const }),
      ),
    )
    .map((candidate): RegisterContractsSuppressedFinding | undefined => {
      const suppression = suppressions.find(
        (item) =>
          item.file === candidate.file &&
          item.line === candidate.line &&
          item.findingKind === 'output_candidate',
      );
      if (suppression === undefined) return undefined;
      return {
        suppression,
        finding: {
          kind: 'output_candidate',
          routine: candidate.routine,
          file: candidate.file,
          line: candidate.line,
          column: candidate.column,
          ...(candidate.sourceUnit !== undefined ? { sourceUnit: candidate.sourceUnit } : {}),
          ...(candidate.sourceRelation !== undefined ? { sourceRelation: candidate.sourceRelation } : {}),
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
  const suppressedFindings = [
    ...directlySuppressedFindings,
    ...suppressedOutputCandidateFindings,
  ];
  const activeOutputCandidates = outputCandidatesWithAutoFixability.filter(
    (candidate) =>
      !suppressedOutputCandidateKeys.has(
        findingKey({ ...candidate, kind: 'output_candidate' as const }),
      ),
  );
  const activeConflictFindings = activeFindings.filter(
    (finding) =>
      finding.kind === 'definite_contract_violation' || finding.kind === 'flag_lifetime_risk',
  );

  if (options.policy !== undefined) {
    diagnostics.push(...diagnosticsForScopedPolicy(activeFindings, options.policy, options.mode));
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
    summaries,
    profileSummaries,
    findings: activeFindings,
    ...(suppressedFindings.length > 0 ? { suppressedFindings } : {}),
    conflicts: conflicts.filter((conflict) =>
      activeConflictFindings.some(
        (finding) =>
          finding.file === conflict.file &&
          finding.line === conflict.line &&
          finding.column === conflict.column &&
          'callTarget' in finding &&
          finding.callTarget === conflict.callTarget,
      ),
    ),
    outputCandidates: activeOutputCandidates,
    profile: options.registerContractsProfile,
    directBoundaries: program.directBoundaries,
    knownRoutines,
  });
  if (options.baselineReport !== undefined) {
    const currentJson = buildRegisterContractsJsonReport(reportModel);
    const ratchet = compareRegisterContractsBaseline(
      currentJson,
      options.baselineReport,
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
        program.routines,
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
  const canonicalSummariesByName = new Map(summaries.map((summary) => [summary.name, summary]));
  const activeOutputCandidatesForInference = activeOutputCandidates.map((candidate) => {
    const canonicalName = summariesByName.get(candidate.routine)?.name;
    return canonicalName === undefined || canonicalName === candidate.routine
      ? candidate
      : { ...candidate, routine: canonicalName };
  });
  const summariesForInference = summariesForAnnotations(
    canonicalSummariesByName,
    activeOutputCandidatesForInference,
  );
  const inferenceModel = options.emitInference
    ? buildRegisterContractsInference([...summariesForInference.values()])
    : undefined;
  const inferenceFormat = options.inferenceFormat ?? 'json';

  return {
    diagnostics,
    ...(activeFindings.length > 0 ? { findings: activeFindings } : {}),
    outputCandidates: activeOutputCandidates,
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

function isSuppressedFinding(
  finding: { file: string; line: number; kind?: string },
  kind: string,
  suppressions: readonly RegisterContractsSuppression[],
): boolean {
  return suppressions.some(
    (item) =>
      item.file === finding.file &&
      item.line === finding.line &&
      item.findingKind === kind,
  );
}

function registerContractsSuppressions(
  comments: ReturnType<typeof parseSmartComments>,
): RegisterContractsSuppression[] {
  return comments
    .filter((item) => item.comment.kind === 'rcIgnoreNext')
    .map((item) => {
      if (item.comment.kind !== 'rcIgnoreNext') {
        throw new Error('unreachable');
      }
      return {
        file: item.file,
        line: item.line + 1,
        column: 1,
        findingKind: item.comment.findingKind,
        reason: item.comment.reason,
      };
    });
}

function applyRegisterContractsSuppressions(
  findings: readonly RegisterContractsFinding[],
  suppressions: readonly RegisterContractsSuppression[],
): {
  activeFindings: RegisterContractsFinding[];
  suppressedFindings: RegisterContractsSuppressedFinding[];
} {
  const suppressedFindings: RegisterContractsSuppressedFinding[] = [];
  const activeFindings: RegisterContractsFinding[] = [];
  for (const finding of findings) {
    const suppression = suppressions.find(
      (item) =>
        item.file === finding.file &&
        item.line === finding.line &&
        item.findingKind === finding.kind,
    );
    if (suppression === undefined) {
      activeFindings.push(finding);
    } else {
      suppressedFindings.push({ finding, suppression });
    }
  }
  return { activeFindings, suppressedFindings };
}

function malformedSuppressionDiagnostics(
  sourceLineComments: ReadonlyMap<string, ReadonlyMap<number, string>>,
  mode: AnalyzeRegisterContractsOptions['mode'],
  policy: RegisterContractsPolicy | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [file, comments] of sourceLineComments) {
    for (const [line, text] of comments) {
      const commentText = `;${text}`;
      if (!/^;?\s*!\s*rc-ignore-next\b/iu.test(commentText)) continue;
      if (!isStrictSuppressionContext(file, mode, policy)) continue;
      const parsed = parseSmartComments(new Map([[file, new Map([[line, text]])]]));
      if (parsed.some((item) => item.comment.kind === 'rcIgnoreNext')) continue;
      diagnostics.push({
        severity: 'error',
        code: 'AZMN_REGISTER_CONTRACTS',
        sourceName: file,
        line,
        column: 1,
        message:
          'Malformed register-contract suppression; use `;! rc-ignore-next <finding-kind>: <reason>`.',
      });
    }
  }
  return diagnostics;
}

function isStrictSuppressionContext(
  file: string,
  mode: AnalyzeRegisterContractsOptions['mode'],
  policy: RegisterContractsPolicy | undefined,
): boolean {
  if (policy !== undefined) {
    return registerContractsPolicyModeForFile(file, policy, mode) === 'strict';
  }
  return mode === 'strict' || mode === 'error';
}

function findingKey(finding: { file: string; line: number; column: number; kind?: string }): string {
  return `${finding.kind ?? ''}:${finding.file}:${finding.line}:${finding.column}`;
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
