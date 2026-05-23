import type { Diagnostic } from '../model/diagnostic.js';
import type {
  AnalyzeRegisterCareOptions,
  RegisterCareDirectCall,
  RegisterCareRoutine,
  RoutineContract,
  RoutineSummary,
  RegisterCareUnit,
  RegisterCareOutputCandidate,
} from './types.js';
import { getRegisterCareProfile } from './profiles.js';
import { getZ80InstructionEffect } from '../z80/effects.js';

function unique<T>(values: T[]): T[] {
  const out: T[] = [];
  for (const value of values) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function inferRoutineSummary(routine: RegisterCareRoutine): RoutineSummary {
  const reads = new Set<RegisterCareUnit>();
  const writes = new Set<RegisterCareUnit>();
  for (const instruction of routine.instructions) {
    const effect = getZ80InstructionEffect(instruction.instruction);
    for (const unit of effect.reads) reads.add(unit);
    for (const unit of effect.writes) writes.add(unit);
  }
  return {
    name: routine.name,
    mayRead: Array.from(reads),
    mayWrite: Array.from(writes),
    preserved: [],
  };
}

export function buildProfileSummaries(
  profileName: AnalyzeRegisterCareOptions['registerCareProfile'],
): RoutineSummary[] {
  const profile = getRegisterCareProfile(profileName);
  if (profile === undefined) {
    return [];
  }
  return [...profile.rst.values(), ...profile.rstServices.values()];
}

export function buildProfileSummaryLookup(
  profileName: AnalyzeRegisterCareOptions['registerCareProfile'],
): Map<string, RoutineSummary> {
  const profile = getRegisterCareProfile(profileName);
  const out = new Map<string, RoutineSummary>();
  if (profile === undefined) return out;
  for (const summary of profile.rst.values()) {
    out.set(summary.name, summary);
  }
  for (const summary of profile.rstServices.values()) {
    out.set(summary.name, summary);
  }
  return out;
}

export function routineNames(routines: readonly RegisterCareRoutine[]): string[] {
  return routines.flatMap((routine) =>
    routine.entryLabels.length > 0 ? routine.entryLabels : [routine.name],
  );
}

function entryContract(
  routine: RegisterCareRoutine,
  contractMap: ReadonlyMap<string, RoutineContract>,
): RoutineContract | undefined {
  for (const label of routine.entryLabels.length > 0 ? routine.entryLabels : [routine.name]) {
    const contract = contractMap.get(label);
    if (contract !== undefined) return contract;
  }
  return contractMap.get(routine.name);
}

export function buildSummaries(
  routines: readonly RegisterCareRoutine[],
  contractMap: Map<string, RoutineContract>,
): RoutineSummary[] {
  const out: RoutineSummary[] = [];
  const written = new Set<string>();

  for (const routine of routines) {
    const inferred = inferRoutineSummary(routine);
    const contract = entryContract(routine, contractMap);
    out.push({
      name: routine.name,
      mayRead: unique([...inferred.mayRead, ...(contract?.in ?? [])]),
      mayWrite: unique([
        ...inferred.mayWrite,
        ...(contract?.out ?? []),
        ...(contract?.clobbers ?? []),
      ]),
      preserved: unique([...inferred.preserved, ...(contract?.preserves ?? [])]),
    });
    written.add(routine.name);
    for (const alias of routine.entryLabels) written.add(alias);
  }

  for (const [name, contract] of contractMap) {
    if (written.has(name)) continue;
    out.push({
      name,
      mayRead: [...contract.in],
      mayWrite: [...contract.out, ...contract.clobbers],
      preserved: [...contract.preserves],
    });
    written.add(name);
  }
  return out;
}

export function buildSummaryByName(
  routines: readonly RegisterCareRoutine[],
  summaries: readonly RoutineSummary[],
  profileSummaries: readonly RoutineSummary[] = [],
): Map<string, RoutineSummary> {
  const out = new Map<string, RoutineSummary>();
  const byRoutine = new Map<string, RoutineSummary>();
  for (const summary of summaries) {
    byRoutine.set(summary.name, summary);
    out.set(summary.name, summary);
  }
  for (const summary of profileSummaries) {
    out.set(summary.name, summary);
  }
  for (const routine of routines) {
    const routineSummary = byRoutine.get(routine.name);
    if (routineSummary === undefined) continue;
    for (const alias of routine.entryLabels.length > 0 ? routine.entryLabels : [routine.name]) {
      out.set(alias, routineSummary);
    }
  }
  return out;
}

export function withAcceptedOutputs(
  summaries: readonly RoutineSummary[],
  acceptedOutputCandidates: ReadonlyMap<string, RegisterCareUnit[]> | undefined,
): RoutineSummary[] {
  if (!acceptedOutputCandidates || acceptedOutputCandidates.size === 0) {
    return [...summaries];
  }
  return summaries.map((summary) => {
    const accepted = acceptedOutputCandidates.get(summary.name);
    if (!accepted || accepted.length === 0) {
      return summary;
    }
    const merged = unique([...summary.mayWrite, ...accepted]);
    return {
      ...summary,
      mayWrite: merged,
      mayOutput: unique([...accepted]),
    };
  });
}

export function unknownBoundaryDiagnostics(
  directCalls: readonly RegisterCareDirectCall[],
  knownRoutines: ReadonlySet<string>,
): Diagnostic[] {
  return directCalls
    .filter((call) => !knownRoutines.has(call.target))
    .map((call) => ({
      severity: 'warning',
      code: 'AZMN_REGISTER_CARE',
      message: `Register-care cannot prove ${call.target}; add a routine body or .asmi extern contract.`,
      sourceName: call.file,
      line: call.line,
      column: call.column,
    }));
}

export function unknownCallList(
  directCalls: readonly RegisterCareDirectCall[],
  knownRoutines: ReadonlySet<string>,
): string[] {
  return unique(
    directCalls.filter((call) => !knownRoutines.has(call.target)).map((call) => call.target),
  ).sort();
}

export function buildOutputCandidateFixability(
  routines: readonly RegisterCareRoutine[],
  outputCandidates: readonly RegisterCareOutputCandidate[],
  autoFixableCandidateKeys: (
    routines: RegisterCareRoutine[],
    outputCandidates: RegisterCareOutputCandidate[],
  ) => ReadonlySet<string>,
): ReadonlyMap<string, boolean> {
  const autoFixable = autoFixableCandidateKeys([...routines], [...outputCandidates]);
  const out = new Map<string, boolean>();
  for (const candidate of outputCandidates) {
    out.set(
      outputCandidateKey(candidate.file, candidate.line, candidate.column),
      autoFixable.has(outputCandidateKey(candidate.file, candidate.line, candidate.column)),
    );
  }
  return out;
}

export function outputCandidateKey(file: string, line: number, column: number): string {
  return `${file}:${line}:${column}`;
}
