import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type {
  AnalyzeRegisterCareOptions,
  RegisterCareAnnotationFile,
  RegisterCareOutputCandidate,
  RegisterCareReportModel,
  RegisterCareUnit,
} from './types.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';
import { autoFixableCandidateKeys } from './fix.js';
import {
  findCallerOutputCandidateObservations,
  findRegisterCareConflicts,
} from './liveness.js';
import { buildAnnotations } from './annotations.js';
import {
  buildOutputCandidateFixability,
  buildProfileSummaries,
  buildProfileSummaryLookup,
  buildSummaries,
  buildSummaryByName,
  outputCandidateKey,
  routineNames,
  unknownBoundaryDiagnostics,
  unknownCallList,
  withAcceptedOutputs,
} from './summaries.js';

interface AnalyzeRegisterCareResult {
  diagnostics: Diagnostic[];
  outputCandidates?: RegisterCareOutputCandidate[];
  reportText?: string;
  interfaceText?: string;
  annotations?: readonly RegisterCareAnnotationFile[];
  unknownCalls?: string[];
}

function candidateMessageWithFixability(
  candidate: RegisterCareOutputCandidate,
  autoFixable: boolean,
): string {
  const carriers = candidate.carriers.join(',');
  const expectation = candidate.carriers.length === 1 ? candidate.carriers[0]! : `{${carriers}}`;
  const base = `CALL ${candidate.routine} writes ${carriers} and caller reads it later`;
  return autoFixable
    ? `${base}; generated contracts promote this to \`out ${expectation}\` automatically.`
    : `${base}; manual review required before adding \`; expects out ${expectation}\` because the later read is not a simple direct continuation.`;
}

export function analyzeRegisterCare(
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
  options: AnalyzeRegisterCareOptions,
): AnalyzeRegisterCareResult {
  const file = loaded.program.files[0];
  const items = file?.items ?? [];
  const program = buildRegisterCareProgramModel(items);
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const contractMap = buildRoutineContracts(smartComments, program.routines, loaded.sourceTexts);
  if (options.interfaceContracts !== undefined) {
    for (const contract of options.interfaceContracts) {
      contractMap.set(contract.name, contract);
    }
  }

  const profileSummaries = buildProfileSummaries(options.registerCareProfile);
  let summaries = buildSummaries(program.routines, contractMap, profileSummaries);
  summaries = withAcceptedOutputs(summaries, options.acceptedOutputCandidates);

  const allSummaries = [...summaries, ...profileSummaries];
  const summariesByName = buildSummaryByName(program.routines, summaries, profileSummaries);
  const knownRoutines = new Set(routineNames(program.routines));
  for (const [name] of contractMap) {
    knownRoutines.add(name);
  }
  for (const name of buildProfileSummaryLookup(options.registerCareProfile).keys()) {
    knownRoutines.add(name);
  }

  const diagnostics: Diagnostic[] = [];
  const shouldBuildOutputCandidates =
    options.mode !== 'off' ||
    options.emitAnnotations === true ||
    options.fixRegisterContracts === true;

  const analyzed = shouldBuildOutputCandidates
    ? {
        conflicts: program.routines.flatMap((routine) =>
          findRegisterCareConflicts(routine, summariesByName, smartComments),
        ),
        outputCandidates: findCallerOutputCandidateObservations(program.routines, summariesByName),
      }
    : { conflicts: [], outputCandidates: [] };
  const conflicts = analyzed.conflicts;
  const outputCandidates = analyzed.outputCandidates;
  const outputCandidateFixability = buildOutputCandidateFixability(
    program.routines,
    outputCandidates,
    autoFixableCandidateKeys,
  );
  const outputCandidatesWithFixability = outputCandidates.map((candidate) => {
    const autoFixable =
      outputCandidateFixability.get(
        outputCandidateKey(candidate.file, candidate.line, candidate.column),
      ) ?? false;
    return {
      ...candidate,
      autoFixable,
      message: candidateMessageWithFixability(candidate, autoFixable),
    };
  });
  if (options.mode !== 'audit') {
    for (const conflict of conflicts) {
      diagnostics.push({
        severity: options.mode === 'error' ? 'error' : 'warning',
        code: 'AZMN_REGISTER_CARE',
        sourceName: conflict.file,
        line: conflict.line,
        column: conflict.column,
        message: conflict.message,
      });
    }
  }

  if (options.mode === 'strict') {
    diagnostics.push(...unknownBoundaryDiagnostics(program.directBoundaries, knownRoutines));
  }

  const reportModel: RegisterCareReportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries: allSummaries,
    conflicts,
    outputCandidates: outputCandidatesWithFixability,
    ...(options.registerCareProfile !== undefined ? { profile: options.registerCareProfile } : {}),
    unknownCalls:
      options.mode === 'off' ? [] : unknownCallList(program.directBoundaries, knownRoutines),
  };

  const summariesForAnnotations = new Map(summariesByName);
  const outputCandidatesByRoutine = new Map<string, RegisterCareUnit[]>();
  for (const candidate of outputCandidatesWithFixability) {
    const existing = outputCandidatesByRoutine.get(candidate.routine) ?? [];
    for (const unit of candidate.carriers) {
      if (!existing.includes(unit)) existing.push(unit);
    }
    outputCandidatesByRoutine.set(candidate.routine, existing);
  }
  for (const [name, summary] of summariesForAnnotations) {
    const candidates = outputCandidatesByRoutine.get(name);
    if (candidates !== undefined && candidates.length > 0) {
      summariesForAnnotations.set(name, { ...summary, outputCandidates: candidates });
    }
  }

  const annotations = options.emitAnnotations
    ? buildAnnotations(loaded, program.routines, summariesForAnnotations, outputCandidatesWithFixability, {
        fixOutputCandidates: options.fixRegisterContracts === true,
        outputCandidateFixability,
        outputCandidateKey,
      })
    : [];

  return {
    diagnostics,
    outputCandidates: outputCandidatesWithFixability,
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(reportModel.unknownCalls.length > 0 ? { unknownCalls: reportModel.unknownCalls } : {}),
  };
}
