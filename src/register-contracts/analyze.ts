import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type {
  AnalyzeRegisterContractsOptions,
  RegisterContractsFinding,
  RegisterContractsAnnotationFile,
  RegisterContractsOutputCandidate,
  RegisterContractsReportModel,
} from './types.js';
import { buildRegisterContractsProgramModel } from './programModel.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { renderRegisterContractsInterface, renderRegisterContractsReport } from './report.js';
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
  const diagnostics = diagnosticsForConflicts(conflicts, options.mode);

  const unknownFindings = unknownBoundaryFindings(program.directBoundaries, knownRoutines);
  const stackFindings = strictStackFindings(program.routines, summaries);
  const findings: RegisterContractsFinding[] =
    options.mode === 'off'
      ? []
      : [
          ...conflicts.map((conflict) => ({
            kind: conflict.kind ?? 'definite_contract_violation',
            callTarget: conflict.callTarget,
            file: conflict.file,
            line: conflict.line,
            column: conflict.column,
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
              carriers: candidate.carriers,
              message: candidate.message,
              ...(candidate.autoFixable !== undefined ? { autoFixable: candidate.autoFixable } : {}),
            };
          }),
        ];

  if (options.mode === 'strict') {
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

  return {
    diagnostics,
    ...(findings.length > 0 ? { findings } : {}),
    outputCandidates: outputCandidatesWithAutoFixability,
    ...(options.emitReport ? { reportText: renderRegisterContractsReport(reportModel) } : {}),
    ...(options.emitInterface
      ? { interfaceText: renderRegisterContractsInterface(summaries) }
      : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(reportModel.unknownCalls.length > 0 ? { unknownCalls: reportModel.unknownCalls } : {}),
  };
}
