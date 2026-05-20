import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import type { LoadedProgram } from '../sourceLoader.js';
import { annotateRegisterCareContracts, type RegisterCareAnnotatedFile } from './annotate.js';
import { expandCarrierList } from './carriers.js';
import {
  diagnosticsForRegisterCareConflicts,
  findAcceptedOutputCandidatesFromHints,
  findCallerOutputCandidates,
  findCallerOutputCandidateObservations,
  findRegisterCareConflicts,
} from './liveness.js';
import { applyExpectOutFixesToSource, findExpectOutFixes } from './fix.js';
import { getRegisterCareProfile, type RegisterCareProfileName } from './profiles.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { applyRoutineContract, inferRoutineSummary } from './summary.js';
import type {
  RegisterCareDirectCall,
  RegisterCareMode,
  RegisterCareRoutine,
  RegisterCareReportModel,
  RegisterCareUnit,
  RegisterCareUnknownBoundary,
  RoutineContract,
  RoutineSummary,
} from './types.js';

export interface AnalyzeRegisterCareOptions {
  mode: RegisterCareMode;
  emitReport: boolean;
  emitInterface: boolean;
  emitAnnotations?: boolean;
  fixRegisterContracts?: boolean;
  acceptOutputCandidates?: string[];
  profile?: RegisterCareProfileName;
  interfaceContracts?: RoutineContract[];
}

export interface AnalyzeRegisterCareResult {
  diagnostics: Diagnostic[];
  outputCandidates?: RegisterCareReportModel['outputCandidates'];
  reportText?: string;
  interfaceText?: string;
  annotatedFiles?: RegisterCareAnnotatedFile[];
}

function emptyRoutineSummary(name: string): RoutineSummary {
  return {
    name,
    mayRead: [],
    mayWrite: [],
    preserved: [],
    valueRelations: [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
}

function unknownBoundaryForCall(call: RegisterCareDirectCall): RegisterCareUnknownBoundary {
  return {
    ...call,
    message: `Register-care cannot prove ${call.subject}; add a routine body or @extern contract.`,
  };
}

function uniqueSortedTargets(boundaries: RegisterCareUnknownBoundary[]): string[] {
  return Array.from(new Set(boundaries.map((boundary) => boundary.target))).sort();
}

function diagnosticsForUnknownBoundaries(boundaries: RegisterCareUnknownBoundary[]): Diagnostic[] {
  return boundaries.map((boundary) => ({
    id: DiagnosticIds.RegisterCareUnknownBoundary,
    severity: 'warning',
    message: boundary.message,
    file: boundary.file,
    line: boundary.line,
    column: boundary.column,
  }));
}

function isLocalLabel(name: string): boolean {
  return name.startsWith('.');
}

function nonLocalLabels(labels: string[]): string[] {
  return labels.filter((label) => !isLocalLabel(label));
}

function boundaryLabels(routine: RegisterCareRoutine): string[] {
  return routine.entryLabels ?? nonLocalLabels(routine.labels);
}

function contractForRoutine(
  routine: RegisterCareRoutine,
  contracts: Map<string, RoutineContract>,
): RoutineContract | undefined {
  return boundaryLabels(routine)
    .map((label) => contracts.get(label))
    .find((contract) => contract !== undefined);
}

function summariesWithExternalContracts(
  summaries: RoutineSummary[],
  contracts: Map<string, RoutineContract>,
  routineNames: Set<string>,
): RoutineSummary[] {
  const out = [...summaries];
  for (const contract of contracts.values()) {
    if (!routineNames.has(contract.name)) {
      out.push(applyRoutineContract(emptyRoutineSummary(contract.name), contract));
    }
  }
  return out;
}

function externalContractsOnly(
  contracts: Map<string, RoutineContract>,
  routineNames: Set<string>,
): Map<string, RoutineContract> {
  return new Map([...contracts].filter(([name]) => !routineNames.has(name)));
}

function buildBoundarySummaryMap(
  summaries: RoutineSummary[],
  routineSummaries: Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }>,
  profileSummaries: RoutineSummary[],
): Map<string, RoutineSummary> {
  const boundarySummaryMap = new Map(profileSummaries.map((summary) => [summary.name, summary]));
  for (const summary of summaries) {
    boundarySummaryMap.set(summary.name, summary);
  }
  for (const { routine, summary } of routineSummaries) {
    for (const label of boundaryLabels(routine)) {
      boundarySummaryMap.set(label, summary);
    }
  }
  return boundarySummaryMap;
}

function summarizeRoutines(
  routines: RegisterCareRoutine[],
  contracts: Map<string, RoutineContract>,
  boundarySummaryMap: ReadonlyMap<string, RoutineSummary> = new Map(),
): Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }> {
  return routines.map((routine) => {
    const inferred = inferRoutineSummary(routine, boundarySummaryMap);
    const contract = contractForRoutine(routine, contracts);
    return { routine, summary: contract ? applyRoutineContract(inferred, contract) : inferred };
  });
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function summaryFingerprint(summary: RoutineSummary): string {
  const relations = summary.valueRelations
    .map((relation) => `${relation.out.join(',')}<-${relation.from.join(',')}`)
    .sort();
  return JSON.stringify({
    name: summary.name,
    mayRead: sortedUnique(summary.mayRead),
    mayWrite: sortedUnique(summary.mayWrite),
    preserved: sortedUnique(summary.preserved),
    relations,
    stackBalanced: summary.stackBalanced,
    hasUnknownStackEffect: summary.hasUnknownStackEffect,
  });
}

function routineSummariesFingerprint(
  routineSummaries: Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }>,
): string {
  return routineSummaries.map((item) => summaryFingerprint(item.summary)).join('\n');
}

function inferRoutineSummariesToFixedPoint(
  routines: RegisterCareRoutine[],
  contracts: Map<string, RoutineContract>,
  routineNames: Set<string>,
  profileSummaries: RoutineSummary[],
): Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }> {
  let routineSummaries = summarizeRoutines(routines, contracts);
  const maxPasses = Math.max(2, routines.length + 2);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const summaries = summariesWithExternalContracts(
      routineSummaries.map((item) => item.summary),
      contracts,
      routineNames,
    );
    const boundarySummaryMap = buildBoundarySummaryMap(
      summaries,
      routineSummaries,
      profileSummaries,
    );
    const nextRoutineSummaries = summarizeRoutines(routines, contracts, boundarySummaryMap);
    if (
      routineSummariesFingerprint(nextRoutineSummaries) ===
      routineSummariesFingerprint(routineSummaries)
    ) {
      return nextRoutineSummaries;
    }
    routineSummaries = nextRoutineSummaries;
  }

  return routineSummaries;
}

function withCallerOutputCandidates(
  routineSummaries: Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }>,
  boundarySummaryMap: ReadonlyMap<string, RoutineSummary>,
  acceptOutputCandidates: ReadonlyMap<string, RegisterCareUnit[]> = new Map(),
): Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }> {
  const candidates = findCallerOutputCandidates(
    routineSummaries.map((item) => item.routine),
    new Map(boundarySummaryMap),
  );

  return routineSummaries.map((item) => {
    const outputCandidates = candidates.get(item.summary.name);
    const written = new Set(item.summary.mayWrite);
    const accepted = (acceptOutputCandidates.get(item.summary.name) ?? []).filter((unit) =>
      written.has(unit),
    );
    const acceptedSet = new Set(accepted);
    const valueRelations = [...item.summary.valueRelations];
    for (const unit of accepted) {
      if (!valueRelations.some((relation) => relation.out.includes(unit))) {
        valueRelations.push({ out: [unit], from: [] });
      }
    }
    const remainingCandidates = outputCandidates?.filter((unit) => !acceptedSet.has(unit));
    return outputCandidates && outputCandidates.length > 0
      ? {
          ...item,
          summary: {
            ...item.summary,
            valueRelations,
            ...(remainingCandidates && remainingCandidates.length > 0
              ? { outputCandidates: remainingCandidates }
              : {}),
          },
        }
      : item;
  });
}

function autoAcceptedOutputCandidates(
  fixes: ReturnType<typeof findExpectOutFixes>,
): Map<string, RegisterCareUnit[]> {
  const out = new Map<string, RegisterCareUnit[]>();
  for (const fix of fixes) {
    const existing = out.get(fix.routine) ?? [];
    for (const unit of fix.carriers) {
      if (!existing.includes(unit)) existing.push(unit);
    }
    out.set(fix.routine, existing);
  }
  return out;
}

function parseAcceptedOutputCandidates(items: string[] = []): Map<string, RegisterCareUnit[]> {
  const out = new Map<string, RegisterCareUnit[]>();
  for (const item of items) {
    const sep = item.indexOf(':');
    if (sep <= 0 || sep === item.length - 1) {
      throw new Error(`Invalid --accept-out value "${item}" (expected ROUTINE:carriers)`);
    }
    const name = item.slice(0, sep).trim();
    if (!name) throw new Error(`Invalid --accept-out value "${item}" (missing routine name)`);
    const carrierParts = item.slice(sep + 1).split(',');
    const rawCarriers = carrierParts.map((part) => part.trim());
    if (rawCarriers.length === 0 || rawCarriers.some((part) => part.length === 0)) {
      throw new Error(`Invalid --accept-out value "${item}" (missing carriers)`);
    }
    const carriers = expandCarrierList(rawCarriers);
    if (!carriers) {
      throw new Error(`Invalid --accept-out value "${item}" (unknown carrier)`);
    }
    const existing = out.get(name) ?? [];
    for (const unit of carriers) {
      if (!existing.includes(unit)) existing.push(unit);
    }
    out.set(name, existing);
  }
  return out;
}

function mergeAcceptedOutputCandidates(
  ...maps: ReadonlyMap<string, RegisterCareUnit[]>[]
): Map<string, RegisterCareUnit[]> {
  const out = new Map<string, RegisterCareUnit[]>();
  for (const map of maps) {
    for (const [name, units] of map) {
      const existing = out.get(name) ?? [];
      for (const unit of units) {
        if (!existing.includes(unit)) existing.push(unit);
      }
      out.set(name, existing);
    }
  }
  return out;
}

function fixedSourceTexts(
  referenceSourceTexts: ReadonlyMap<string, string>,
  workingSourceTexts: ReadonlyMap<string, string>,
  fixes: ReturnType<typeof findExpectOutFixes>,
): Map<string, string> {
  const byFile = new Map<string, ReturnType<typeof findExpectOutFixes>>();
  for (const fix of fixes) {
    const items = byFile.get(fix.file) ?? [];
    items.push(fix);
    byFile.set(fix.file, items);
  }

  const out = new Map(workingSourceTexts);
  for (const [file, items] of byFile) {
    const source = workingSourceTexts.get(file);
    const referenceSource = referenceSourceTexts.get(file);
    if (source === undefined) continue;
    out.set(file, applyExpectOutFixesToSource(source, items, referenceSource));
  }
  return out;
}

function annotateAndFixRegisterCareContracts(
  sourceTexts: ReadonlyMap<string, string>,
  routines: Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }>,
  fixes: ReturnType<typeof findExpectOutFixes>,
): RegisterCareAnnotatedFile[] {
  const annotated = annotateRegisterCareContracts(sourceTexts, routines);
  if (fixes.length === 0) return annotated;

  const workingTexts = new Map(sourceTexts);
  for (const file of annotated) {
    workingTexts.set(file.path, file.text);
  }

  const fixedTexts = fixedSourceTexts(sourceTexts, workingTexts, fixes);
  const out: RegisterCareAnnotatedFile[] = [];
  for (const [path, text] of fixedTexts) {
    if (text !== sourceTexts.get(path)) out.push({ path, text });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

type OutputCandidate = NonNullable<RegisterCareReportModel['outputCandidates']>[number];

function candidateKey(item: Pick<OutputCandidate, 'file' | 'line' | 'column' | 'routine'>): string {
  return `${item.file}:${item.line}:${item.column}:${item.routine}`;
}

function candidateExpectation(units: RegisterCareUnit[]): string {
  const carriers = units.join(',');
  return units.length === 1 ? units[0]! : `{${carriers}}`;
}

function candidateMessageWithFixability(candidate: OutputCandidate, autoFixable: boolean): string {
  const carriers = candidate.carriers.join(',');
  const expectation = candidateExpectation(candidate.carriers);
  const base = `CALL ${candidate.routine} writes ${carriers} and caller reads it later`;
  return autoFixable
    ? `${base}; generated contracts promote this to \`out ${expectation}\` automatically.`
    : `${base}; manual review required before adding \`; expects out ${expectation}\` because the later read is not a simple direct continuation.`;
}

function withCandidateFixability(
  candidates: OutputCandidate[],
  fixes: ReturnType<typeof findExpectOutFixes>,
): OutputCandidate[] {
  const fixable = new Map(fixes.map((fix) => [candidateKey(fix), new Set(fix.carriers)]));
  return candidates.map((candidate) => {
    const fixableCarriers = fixable.get(candidateKey(candidate));
    const autoFixable =
      fixableCarriers !== undefined &&
      candidate.carriers.every((carrier) => fixableCarriers.has(carrier));
    return {
      ...candidate,
      autoFixable,
      message: candidateMessageWithFixability(candidate, autoFixable),
    };
  });
}

function inferenceOnlyOutputFixes(
  programRoutines: RegisterCareRoutine[],
  routineSummaries: Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }>,
  profileSummaries: RoutineSummary[],
): ReturnType<typeof findExpectOutFixes> {
  const summaries = routineSummaries.map((item) => item.summary);
  const boundarySummaryMap = buildBoundarySummaryMap(summaries, routineSummaries, profileSummaries);
  const candidates = findCallerOutputCandidateObservations(programRoutines, boundarySummaryMap);
  return findExpectOutFixes(programRoutines, candidates);
}

export function analyzeRegisterCare(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareOptions,
): AnalyzeRegisterCareResult {
  const profile = getRegisterCareProfile(options.profile);
  const programModel = buildRegisterCareProgramModel(loaded.program);
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const contracts = buildRoutineContracts(smartComments, programModel.routines, loaded.sourceTexts);
  const cliAcceptedOutputCandidates = parseAcceptedOutputCandidates(options.acceptOutputCandidates);
  for (const contract of options.interfaceContracts ?? []) {
    contracts.set(contract.name, contract);
  }
  const routineNames = new Set(programModel.routines.flatMap((routine) => boundaryLabels(routine)));
  const profileSummaries = profile
    ? [...Array.from(profile.rst.values()), ...Array.from(profile.rstServices.values())]
    : [];
  const routineSummaries = inferRoutineSummariesToFixedPoint(
    programModel.routines,
    contracts,
    routineNames,
    profileSummaries,
  );
  const summaries = routineSummaries.map((item) => item.summary);
  summaries.push(...summariesWithExternalContracts([], contracts, routineNames));
  const boundarySummaryMap = buildBoundarySummaryMap(summaries, routineSummaries, profileSummaries);
  const unknownBoundaries = programModel.directBoundaries
    .filter((boundary) => !boundarySummaryMap.has(boundary.target))
    .map(unknownBoundaryForCall);
  const conflicts = programModel.routines.flatMap((routine) =>
    findRegisterCareConflicts(routine, boundarySummaryMap, smartComments),
  );
  const rawOutputCandidates = findCallerOutputCandidateObservations(
    programModel.routines,
    boundarySummaryMap,
  );
  const possibleExpectOutFixes = findExpectOutFixes(programModel.routines, rawOutputCandidates);
  const outputCandidates = withCandidateFixability(rawOutputCandidates, possibleExpectOutFixes);
  const conflictDiagnostics =
    options.mode === 'warn' || options.mode === 'strict'
      ? diagnosticsForRegisterCareConflicts(conflicts, 'warning')
      : options.mode === 'error'
        ? diagnosticsForRegisterCareConflicts(conflicts, 'error')
        : [];
  const diagnostics =
    options.mode === 'strict'
      ? [...conflictDiagnostics, ...diagnosticsForUnknownBoundaries(unknownBoundaries)]
      : conflictDiagnostics;
  const reportModel: RegisterCareReportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    ...(profile ? { profile: profile.name } : {}),
    summaries,
    conflicts,
    outputCandidates,
    unknownCalls: uniqueSortedTargets(unknownBoundaries),
  };

  return {
    diagnostics,
    outputCandidates,
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
    ...(options.emitAnnotations
      ? (() => {
          const annotationRoutineSummaries = inferRoutineSummariesToFixedPoint(
            programModel.routines,
            externalContractsOnly(contracts, routineNames),
            routineNames,
            profileSummaries,
          );
          const annotationSummaries = annotationRoutineSummaries.map((item) => item.summary);
          const annotationBoundarySummaryMap = buildBoundarySummaryMap(
            annotationSummaries,
            annotationRoutineSummaries,
            profileSummaries,
          );
          const expectOutFixes =
            options.fixRegisterContracts === true
              ? inferenceOnlyOutputFixes(
                  programModel.routines,
                  annotationRoutineSummaries,
                  profileSummaries,
                )
              : [];
          return {
            annotatedFiles: annotateAndFixRegisterCareContracts(
              loaded.sourceTexts,
              withCallerOutputCandidates(
                annotationRoutineSummaries,
                annotationBoundarySummaryMap,
                mergeAcceptedOutputCandidates(
                  cliAcceptedOutputCandidates,
                  findAcceptedOutputCandidatesFromHints(
                    programModel.routines,
                    annotationBoundarySummaryMap,
                    smartComments,
                  ),
                  autoAcceptedOutputCandidates(expectOutFixes),
                ),
              ),
              [],
            ),
          };
        })()
      : {}),
  };
}
