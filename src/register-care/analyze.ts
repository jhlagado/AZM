import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type {
  AnalyzeRegisterCareOptions,
  RegisterCareAnnotationFile,
  RegisterCareDirectCall,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineContract,
  RoutineSummary,
  RegisterCareReportModel,
  RegisterCareOutputCandidate,
} from './types.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';
import { getRegisterCareProfile } from './profiles.js';
import { getZ80InstructionEffect } from '../z80/effects.js';
import { autoFixableCandidateKeys } from './fix.js';
import {
  findCallerOutputCandidateObservations,
  findRegisterCareConflicts,
} from './liveness.js';

interface AnalyzeRegisterCareResult {
  diagnostics: Diagnostic[];
  outputCandidates?: RegisterCareOutputCandidate[];
  reportText?: string;
  interfaceText?: string;
  annotations?: readonly RegisterCareAnnotationFile[];
  unknownCalls?: string[];
}

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

function buildProfileSummaries(
  profileName: AnalyzeRegisterCareOptions['registerCareProfile'],
): RoutineSummary[] {
  const profile = getRegisterCareProfile(profileName);
  if (profile === undefined) {
    return [];
  }
  return [...profile.rst.values(), ...profile.rstServices.values()];
}

function buildProfileSummaryLookup(
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

function routineNames(routines: readonly RegisterCareRoutine[]): string[] {
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

function buildSummaries(
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

function buildSummaryByName(
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

function withAcceptedOutputs(
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

function unknownBoundaryDiagnostics(
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

function unknownCallList(
  directCalls: readonly RegisterCareDirectCall[],
  knownRoutines: ReadonlySet<string>,
): string[] {
  return unique(
    directCalls.filter((call) => !knownRoutines.has(call.target)).map((call) => call.target),
  ).sort();
}

function formatCarrierLine(
  tag: 'in' | 'out' | 'clobbers' | 'preserves' | 'maybe-out',
  units: readonly string[],
): string {
  return `;!      ${tag.padEnd(10)}${units.join(',')}`;
}

function formatCandidateUnits(units: readonly RegisterCareUnit[]): string {
  return units.length === 1 ? units[0]! : `{${units.join(',')}}`;
}

function formatCarrierLineWithExpectOut(
  indentation: string,
  units: readonly RegisterCareUnit[],
): string {
  return `${indentation}; expects out ${formatCandidateUnits(units)}`;
}

function formatCarrierLineWithMaybeOut(
  indentation: string,
  units: readonly RegisterCareUnit[],
): string {
  return `${indentation};!      ${'maybe-out'.padEnd(10)}${formatCandidateUnits(units)}`;
}

function isGeneratedRegisterContractLine(line: string): boolean {
  return /^\s*;!\s*(in|out|clobbers|preserves|maybe-out)\b/i.test(line);
}

function outputCandidateKey(file: string, line: number, column: number): string {
  return `${file}:${line}:${column}`;
}

function isOutputCandidateHintLine(line: string): boolean {
  return /^\s*;\s*expects\s+out\b/i.test(line) || /^\s*;\s*!\s*maybe-out\b/i.test(line);
}

function buildOutputCandidateFixability(
  routines: readonly RegisterCareRoutine[],
  outputCandidates: readonly RegisterCareOutputCandidate[],
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

function normalizeLineEnding(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function splitSourceLines(text: string): string[] {
  return normalizeLineEnding(text).split('\n');
}

function lineDeltaForCandidate(
  line: number,
  deltas: readonly { anchorLine: number; delta: number }[],
): number {
  let shift = 0;
  for (const delta of deltas) {
    if (delta.anchorLine < line) {
      shift += delta.delta;
    }
  }
  return shift;
}

function applyOutputCandidateHints(
  sourceText: string,
  outputCandidates: readonly RegisterCareOutputCandidate[],
  candidateFixability: ReadonlyMap<string, boolean>,
  deltas: readonly { anchorLine: number; delta: number }[],
): string {
  const lines = splitSourceLines(sourceText);
  const grouped = new Map<
    number,
    {
      carriers: RegisterCareUnit[];
      autoFixable: boolean;
    }
  >();

  for (const candidate of outputCandidates) {
    const adjustedLine = candidate.line + lineDeltaForCandidate(candidate.line, deltas);
    const existing = grouped.get(adjustedLine);
    const autoFixable =
      candidateFixability.get(
        outputCandidateKey(candidate.file, candidate.line, candidate.column),
      ) ?? false;
    if (existing === undefined) {
      grouped.set(adjustedLine, { carriers: [...candidate.carriers], autoFixable });
      continue;
    }
    const carriers = existing.carriers;
    for (const carrier of candidate.carriers) {
      if (!carriers.includes(carrier)) {
        carriers.push(carrier);
      }
    }
    existing.autoFixable = existing.autoFixable && autoFixable;
  }

  const candidates = [...grouped.entries()]
    .map(([line, entry]) => ({ line, ...entry }))
    .sort((left, right) => right.line - left.line);

  for (const candidate of candidates) {
    const index = candidate.line - 1;
    if (index < 0 || index > lines.length) continue;
    if (index > 0 && isOutputCandidateHintLine(lines[index - 1] ?? '')) continue;
    const indentation = lines[index]?.match(/^\s*/)?.[0] ?? '';
    const hint = candidate.autoFixable
      ? formatCarrierLineWithExpectOut(indentation, candidate.carriers)
      : formatCarrierLineWithMaybeOut(indentation, candidate.carriers);
    lines.splice(index, 0, hint);
  }

  return lines.join('\n');
}

interface RoutineAnnotationResult {
  text: string;
  deltas: { anchorLine: number; delta: number }[];
}

function annotateSourceFile(
  sourceText: string,
  routines: readonly RegisterCareRoutine[],
  summariesByName: ReadonlyMap<string, RoutineSummary>,
): RoutineAnnotationResult | undefined {
  const routineLines = Array.from(routines)
    .filter((routine) => summariesByName.has(routine.name))
    .sort((left, right) => right.span.start.line - left.span.start.line);

  if (routineLines.length === 0) return undefined;

  const lines = splitSourceLines(sourceText);
  let changed = false;
  const deltas: { anchorLine: number; delta: number }[] = [];

  for (const routine of routineLines) {
    const summary = summariesByName.get(routine.name);
    if (!summary) continue;

    const insertLine = routine.span.start.line - 1;
    if (insertLine < 0 || insertLine > lines.length) continue;

    const generatedLines = [
      ...(summary.mayRead.length > 0 ? [formatCarrierLine('in', summary.mayRead)] : []),
      ...(summary.mayWrite.length > 0 ? [formatCarrierLine('out', summary.mayWrite)] : []),
      ...(summary.preserved.length > 0 ? [formatCarrierLine('preserves', summary.preserved)] : []),
    ];
    if (generatedLines.length === 0) continue;

    let start = insertLine;
    for (
      let index = insertLine - 1;
      index >= 0 && isGeneratedRegisterContractLine(lines[index] ?? '');
      index -= 1
    ) {
      start = index;
    }
    if (
      start === insertLine ||
      lines.slice(start, insertLine).some((line) => line.trim().length === 0)
    ) {
      start = insertLine;
    }

    const existing = lines.slice(start, insertLine);
    if (
      existing.length !== generatedLines.length ||
      existing.some((line, index) => line !== generatedLines[index])
    ) {
      changed = true;
      deltas.push({
        anchorLine: routine.span.start.line,
        delta: generatedLines.length - (insertLine - start),
      });
      lines.splice(start, insertLine - start, ...generatedLines);
    }
  }

  if (!changed) return undefined;
  return {
    text: lines.join('\n'),
    deltas,
  };
}

function buildAnnotations(
  loaded: {
    sourceTexts: ReadonlyMap<string, string>;
  },
  programRoutines: readonly RegisterCareRoutine[],
  summariesByName: ReadonlyMap<string, RoutineSummary>,
  outputCandidates: readonly RegisterCareOutputCandidate[],
  options: {
    fixOutputCandidates: boolean;
    outputCandidateFixability: ReadonlyMap<string, boolean>;
  },
): readonly RegisterCareAnnotationFile[] {
  const byFile = new Map<string, RegisterCareRoutine[]>();
  for (const routine of programRoutines) {
    if (!summariesByName.has(routine.name)) continue;
    const file = byFile.get(routine.span.file);
    if (file === undefined) {
      byFile.set(routine.span.file, [routine]);
    } else {
      file.push(routine);
    }
  }

  const out: RegisterCareAnnotationFile[] = [];
  for (const [path, routines] of byFile) {
    const sourceText = loaded.sourceTexts.get(path);
    if (sourceText === undefined) continue;
    let text = sourceText;
    let deltas: { anchorLine: number; delta: number }[] = [];
    const annotation = annotateSourceFile(sourceText, routines, summariesByName);
    if (annotation !== undefined) {
      text = annotation.text;
      deltas = annotation.deltas;
    }

    if (options.fixOutputCandidates) {
      const candidatesForFile = outputCandidates.filter((candidate) => candidate.file === path);
      if (candidatesForFile.length > 0) {
        text = applyOutputCandidateHints(
          text,
          candidatesForFile,
          options.outputCandidateFixability,
          deltas,
        );
      }
    }

    if (text !== sourceText) out.push({ path, text });
  }
  return out;
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

  let summaries = buildSummaries(program.routines, contractMap);
  const profileSummaries = buildProfileSummaries(options.registerCareProfile);
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
  );
  const outputCandidatesWithFixability = outputCandidates.map((candidate) => ({
    ...candidate,
    autoFixable:
      outputCandidateFixability.get(
        outputCandidateKey(candidate.file, candidate.line, candidate.column),
      ) ?? false,
  }));
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
    diagnostics.push(...unknownBoundaryDiagnostics(program.directCalls, knownRoutines));
  }

  const reportModel: RegisterCareReportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries: allSummaries,
    conflicts,
    outputCandidates: outputCandidatesWithFixability,
    ...(options.registerCareProfile !== undefined ? { profile: options.registerCareProfile } : {}),
    unknownCalls: options.mode === 'off' ? [] : unknownCallList(program.directCalls, knownRoutines),
  };

  const annotations = options.emitAnnotations
    ? buildAnnotations(loaded, program.routines, summariesByName, outputCandidatesWithFixability, {
        fixOutputCandidates: options.fixRegisterContracts === true,
        outputCandidateFixability,
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
