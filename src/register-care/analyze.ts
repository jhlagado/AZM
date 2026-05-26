import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type {
  AnalyzeRegisterCareOptions,
  RegisterCareAnnotationFile,
  RegisterCareOutputCandidate,
  RegisterCareRoutine,
  RegisterCareReportModel,
  RegisterCareUnit,
} from './types.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';
import { autoFixableCandidateKeys, findExpectOutFixesForCandidates } from './fix.js';
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
  let summariesByName = buildSummaryByName(program.routines, summaries, profileSummaries);
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
  const allSummaries = [...summaries, ...profileSummaries];
  const conflicts = shouldBuildOutputCandidates
    ? program.routines.flatMap((routine) =>
        findRegisterCareConflicts(routine, summariesByName, smartComments),
      )
    : [];
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

function autoAcceptedOutputCandidateMap(
  routines: readonly RegisterCareRoutine[],
  outputCandidates: readonly RegisterCareOutputCandidate[],
  sourceTexts: ReadonlyMap<string, string>,
): ReadonlyMap<string, RegisterCareUnit[]> {
  const out = new Map<string, RegisterCareUnit[]>();
  const sourceMaybeOut = sourceMaybeOutByRoutine(routines, sourceTexts);
  for (const fix of findExpectOutFixesForCandidates([...routines], [...outputCandidates])) {
    const declaredMaybeOut = sourceMaybeOut.get(fix.routine) ?? [];
    const eligibleCarriers = fix.carriers.filter((carrier) => declaredMaybeOut.includes(carrier));
    if (eligibleCarriers.length === 0) continue;
    const carriers = out.get(fix.routine) ?? [];
    for (const carrier of eligibleCarriers) {
      if (!carriers.includes(carrier)) carriers.push(carrier);
    }
    out.set(fix.routine, carriers);
  }
  return out;
}

function sourceMaybeOutByRoutine(
  routines: readonly RegisterCareRoutine[],
  sourceTexts: ReadonlyMap<string, string>,
): ReadonlyMap<string, RegisterCareUnit[]> {
  const out = new Map<string, RegisterCareUnit[]>();
  for (const routine of routines) {
    const source = sourceTexts.get(routine.span.file);
    if (source === undefined) continue;
    const lines = source.split(/\r?\n/);
    const units: RegisterCareUnit[] = [];
    for (let index = routine.span.start.line - 2; index >= 0; index -= 1) {
      const text = lines[index] ?? '';
      if (!/^\s*;/.test(text)) break;
      const match = /^\s*;\s*!\s*maybe-out\s+(.+)$/i.exec(text);
      if (!match) continue;
      for (const token of match[1]!.split(',')) {
        const unit = token.trim() as RegisterCareUnit;
        if (unit.length > 0 && !units.includes(unit)) units.push(unit);
      }
    }
    if (units.length === 0) continue;
    out.set(routine.name, units);
    for (const label of routine.labels) out.set(label, units);
    for (const label of routine.entryLabels) out.set(label, units);
  }
  return out;
}
