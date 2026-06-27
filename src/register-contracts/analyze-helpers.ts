import type { Diagnostic } from '../model/diagnostic.js';
import { autoFixableCandidateKeys, findExpectOutFixesForCandidates } from './fix.js';
import {
  buildOutputCandidateFixability,
  buildProfileSummaryLookup,
  outputCandidateKey,
  routineNames,
  unknownCallList,
} from './summaries.js';
import type {
  AnalyzeRegisterContractsOptions,
  RegisterContractsDirectCall,
  RegisterContractsFinding,
  RegisterContractsOutputCandidate,
  RegisterContractsReportModel,
  RegisterContractsRoutine,
  RegisterContractsUnit,
  RoutineSummary,
} from './types.js';

export function candidateMessageWithFixability(
  candidate: RegisterContractsOutputCandidate,
  autoFixable: boolean,
): string {
  const carriers = candidate.carriers.join(',');
  const expectation = candidate.carriers.length === 1 ? candidate.carriers[0]! : `{${carriers}}`;
  const base = `CALL ${candidate.routine} writes ${carriers} and caller reads it later`;
  return autoFixable
    ? `${base}; generated contracts promote this to \`out ${expectation}\` automatically.`
    : `${base}; manual review required before adding \`; expects out ${expectation}\` because the later read is not a simple direct continuation.`;
}

export function knownRoutineNames(
  routines: readonly RegisterContractsRoutine[],
  contractNames: Iterable<string>,
  profile: AnalyzeRegisterContractsOptions['registerContractsProfile'],
): Set<string> {
  const known = new Set(routineNames(routines));
  for (const name of contractNames) known.add(name);
  for (const name of buildProfileSummaryLookup(profile).keys()) known.add(name);
  return known;
}

export function outputCandidatesWithFixability(
  routines: readonly RegisterContractsRoutine[],
  outputCandidates: readonly RegisterContractsOutputCandidate[],
): {
  outputCandidates: RegisterContractsOutputCandidate[];
  outputCandidateFixability: ReadonlyMap<string, boolean>;
} {
  const outputCandidateFixability = buildOutputCandidateFixability(
    routines,
    outputCandidates,
    autoFixableCandidateKeys,
  );
  return {
    outputCandidateFixability,
    outputCandidates: outputCandidates.map((candidate) => {
      const autoFixable =
        outputCandidateFixability.get(
          outputCandidateKey(candidate.file, candidate.line, candidate.column),
        ) ?? false;
      return {
        ...candidate,
        kind: 'output_candidate',
        autoFixable,
        message: candidateMessageWithFixability(candidate, autoFixable),
      };
    }),
  };
}

export function diagnosticsForConflicts(
  conflicts: readonly { file: string; line: number; column: number; message: string }[],
  mode: AnalyzeRegisterContractsOptions['mode'],
): Diagnostic[] {
  if (mode === 'audit') return [];
  return conflicts.map((conflict) => ({
    severity: mode === 'error' || mode === 'strict' ? 'error' : 'warning',
    code: 'AZMN_REGISTER_CONTRACTS',
    sourceName: conflict.file,
    line: conflict.line,
    column: conflict.column,
    message: conflict.message,
  }));
}

export function strictStackDiagnostics(
  routines: readonly RegisterContractsRoutine[],
  summaries: readonly RoutineSummary[],
): Diagnostic[] {
  const routinesByName = new Map(routines.map((routine) => [routine.name, routine]));
  const diagnostics: Diagnostic[] = [];

  for (const summary of summaries) {
    const routine = routinesByName.get(summary.name);
    if (routine === undefined) continue;
    const stackIssues = strictStackIssueText(summary);
    if (stackIssues === undefined) continue;
    diagnostics.push({
      severity: 'error',
      code: 'AZMN_REGISTER_CONTRACTS',
      sourceName: routine.span.file,
      line: routine.span.start.line,
      column: routine.span.start.column,
      message: `Register contracts cannot prove stack discipline for ${summary.name}: ${stackIssues}. Keep PUSH/POP pairs and stack-changing exits inside one @ routine boundary, or split the code into explicit callable routines.`,
    });
  }

  return diagnostics;
}

export function strictStackFindings(
  routines: readonly RegisterContractsRoutine[],
  summaries: readonly RoutineSummary[],
): RegisterContractsFinding[] {
  const routinesByName = new Map(routines.map((routine) => [routine.name, routine]));
  const findings: RegisterContractsFinding[] = [];

  for (const summary of summaries) {
    const routine = routinesByName.get(summary.name);
    if (routine === undefined) continue;
    const stackIssues = strictStackIssueText(summary);
    if (stackIssues === undefined) continue;
    findings.push({
      kind: 'unknown_control_flow',
      routine: summary.name,
      stackBalanced: summary.stackBalanced,
      ...(summary.hasUnknownStackEffect !== undefined
        ? { hasUnknownStackEffect: summary.hasUnknownStackEffect }
        : {}),
      file: routine.span.file,
      line: routine.span.start.line,
      column: routine.span.start.column,
      message: `Register contracts cannot prove stack discipline for ${summary.name}: ${stackIssues}. Keep PUSH/POP pairs and stack-changing exits inside one @ routine boundary, or split the code into explicit callable routines.`,
    });
  }

  return findings;
}

export function unknownBoundaryFindings(
  directBoundaries: readonly RegisterContractsDirectCall[],
  knownRoutines: ReadonlySet<string>,
): RegisterContractsFinding[] {
  return directBoundaries
    .filter((boundary) => !knownRoutines.has(boundary.target))
    .map((boundary) => ({
      kind: 'missing_callee_contract',
      callTarget: boundary.target,
      subject: boundary.subject,
      file: boundary.file,
      line: boundary.line,
      column: boundary.column,
      message: `Register contracts cannot prove ${boundary.subject}; add a routine body or .asmi extern contract.`,
    }));
}

export function diagnosticsForFindings(
  findings: readonly RegisterContractsFinding[],
  mode: AnalyzeRegisterContractsOptions['mode'],
): Diagnostic[] {
  if (mode === 'audit') return [];
  return findings.map((finding) => ({
    severity: mode === 'error' || mode === 'strict' ? 'error' : 'warning',
    code: 'AZMN_REGISTER_CONTRACTS',
    sourceName: finding.file,
    line: finding.line,
    column: finding.column,
    message: finding.message,
  }));
}

function strictStackIssueText(summary: RoutineSummary): string | undefined {
  const issues: string[] = [];
  if (!summary.stackBalanced) issues.push('stack is unbalanced');
  if (summary.hasUnknownStackEffect === true) issues.push('stack effect is unknown');
  return issues.length > 0 ? issues.join('; ') : undefined;
}

export function summariesForAnnotations(
  summariesByName: ReadonlyMap<string, RoutineSummary>,
  outputCandidates: readonly RegisterContractsOutputCandidate[],
): Map<string, RoutineSummary> {
  const summariesForAnnotations = new Map(summariesByName);
  const outputCandidatesByRoutine = outputCandidateUnitsByRoutine(outputCandidates);
  for (const [name, summary] of summariesForAnnotations) {
    const candidates = outputCandidatesByRoutine.get(name);
    if (candidates !== undefined && candidates.length > 0) {
      summariesForAnnotations.set(name, { ...summary, outputCandidates: candidates });
    }
  }
  return summariesForAnnotations;
}

function outputCandidateUnitsByRoutine(
  outputCandidates: readonly RegisterContractsOutputCandidate[],
): Map<string, RegisterContractsUnit[]> {
  const out = new Map<string, RegisterContractsUnit[]>();
  for (const candidate of outputCandidates) {
    const existing = out.get(candidate.routine) ?? [];
    for (const unit of candidate.carriers) {
      if (!existing.includes(unit)) existing.push(unit);
    }
    out.set(candidate.routine, existing);
  }
  return out;
}

export function buildRegisterContractsReportModel(input: {
  entryFile: string;
  mode: AnalyzeRegisterContractsOptions['mode'];
  summaries: readonly RoutineSummary[];
  profileSummaries: readonly RoutineSummary[];
  findings: readonly RegisterContractsFinding[];
  conflicts: RegisterContractsReportModel['conflicts'];
  outputCandidates: readonly RegisterContractsOutputCandidate[];
  profile: AnalyzeRegisterContractsOptions['registerContractsProfile'];
  directBoundaries: Parameters<typeof unknownCallList>[0];
  knownRoutines: ReadonlySet<string>;
}): RegisterContractsReportModel {
  return {
    entryFile: input.entryFile,
    mode: input.mode,
    summaries: [...input.summaries, ...input.profileSummaries],
    findings: [...input.findings],
    conflicts: [...input.conflicts],
    outputCandidates: [...input.outputCandidates],
    ...(input.profile !== undefined ? { profile: input.profile } : {}),
    unknownCalls:
      input.mode === 'off' ? [] : unknownCallList(input.directBoundaries, input.knownRoutines),
  };
}

export function autoAcceptedOutputCandidateMap(
  routines: readonly RegisterContractsRoutine[],
  outputCandidates: readonly RegisterContractsOutputCandidate[],
  sourceTexts: ReadonlyMap<string, string>,
): ReadonlyMap<string, RegisterContractsUnit[]> {
  const out = new Map<string, RegisterContractsUnit[]>();
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
  routines: readonly RegisterContractsRoutine[],
  sourceTexts: ReadonlyMap<string, string>,
): ReadonlyMap<string, RegisterContractsUnit[]> {
  const out = new Map<string, RegisterContractsUnit[]>();
  for (const routine of routines) {
    const maybeOutUnits = sourceMaybeOutUnits(routine, sourceTexts);
    if (maybeOutUnits.length === 0) continue;
    out.set(routine.name, maybeOutUnits);
    for (const label of routine.labels) out.set(label, maybeOutUnits);
    for (const label of routine.entryLabels) out.set(label, maybeOutUnits);
  }
  return out;
}

function sourceMaybeOutUnits(
  routine: RegisterContractsRoutine,
  sourceTexts: ReadonlyMap<string, string>,
): RegisterContractsUnit[] {
  const source = sourceTexts.get(routine.span.file);
  if (source === undefined) return [];
  const lines = source.split(/\r?\n/);
  const units: RegisterContractsUnit[] = [];
  for (let index = routine.span.start.line - 2; index >= 0; index -= 1) {
    const text = lines[index] ?? '';
    if (!/^\s*;/.test(text)) break;
    const match = /^\s*;\s*!\s*maybe-out\s+(.+)$/i.exec(text);
    if (!match) continue;
    addUnits(units, match[1]!);
  }
  return units;
}

function addUnits(out: RegisterContractsUnit[], text: string): void {
  for (const token of text.split(',')) {
    const unit = token.trim() as RegisterContractsUnit;
    if (unit.length > 0 && !out.includes(unit)) out.push(unit);
  }
}
