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
} from './types.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';

interface AnalyzeRegisterCareResult {
  diagnostics: Diagnostic[];
  reportText?: string;
  interfaceText?: string;
  annotations?: readonly RegisterCareAnnotationFile[];
}

function buildSummaries(
  routines: readonly RegisterCareRoutine[],
  contractMap: Map<string, RoutineContract>,
): RoutineSummary[] {
  const out: RoutineSummary[] = [];
  for (const routine of routines) {
    const contract = contractMap.get(routine.name);
    out.push({
      name: routine.name,
      mayRead: contract?.in ?? [],
      mayWrite: [...new Set([...(contract?.out ?? []), ...(contract?.clobbers ?? [])])],
      preserved: contract?.preserves ?? [],
    });
  }
  return out;
}

function routineNames(routines: readonly RegisterCareRoutine[]): string[] {
  return routines.flatMap((routine) => routine.name);
}

function withAcceptedOutputs(
  summaries: readonly RoutineSummary[],
  acceptedOutputCandidates: ReadonlyMap<string, readonly RegisterCareUnit[]> | undefined,
): RoutineSummary[] {
  if (!acceptedOutputCandidates || acceptedOutputCandidates.size === 0) {
    return Array.from(summaries);
  }
  return summaries.map((summary) => {
    const accepted = acceptedOutputCandidates.get(summary.name);
    if (!accepted || accepted.length === 0) {
      return summary;
    }
    const merged = new Set(summary.mayWrite);
    for (const unit of accepted) {
      merged.add(unit);
    }
    return {
      ...summary,
      mayWrite: Array.from(merged),
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
      message: `Register-care cannot prove boundary "${call.target}"`,
      sourceName: call.file,
      line: call.line,
      column: call.column,
    }));
}

function formatCarrierLine(tag: 'in' | 'out' | 'clobbers' | 'preserves', units: readonly string[]): string {
  return `;!      ${tag.padEnd(10)}${units.join(',')}`;
}

function isGeneratedRegisterContractLine(line: string): boolean {
  return /^\s*;!\s*(in|out|clobbers|preserves)\b/i.test(line);
}

function normalizeLineEnding(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function splitSourceLines(text: string): string[] {
  return normalizeLineEnding(text).split('\n');
}

function annotateSourceFile(
  sourceText: string,
  routines: readonly RegisterCareRoutine[],
  summariesByName: ReadonlyMap<string, RoutineSummary>,
): RegisterCareAnnotationFile | undefined {
  const routineLines = Array.from(routines)
    .filter((routine) => summariesByName.has(routine.name))
    .sort((left, right) => right.span.start.line - left.span.start.line);

  if (routineLines.length === 0) {
    return undefined;
  }

  const lines = splitSourceLines(sourceText);
  let changed = false;

  for (const routine of routineLines) {
    const summary = summariesByName.get(routine.name);
    if (!summary) {
      continue;
    }
    const insertLine = routine.span.start.line - 1;
    if (insertLine < 0 || insertLine > lines.length) {
      continue;
    }

    const generatedLines = [
      ...(summary.mayRead.length > 0 ? [formatCarrierLine('in', summary.mayRead)] : []),
      ...(summary.mayWrite.length > 0 ? [formatCarrierLine('out', summary.mayWrite)] : []),
      ...(summary.preserved.length > 0 ? [formatCarrierLine('preserves', summary.preserved)] : []),
    ];
    if (generatedLines.length === 0) {
      continue;
    }

    let start = insertLine;
    for (
      let index = insertLine - 1;
      index >= 0 && isGeneratedRegisterContractLine(lines[index] ?? '');
      index -= 1
    ) {
      start = index;
    }
    if (start === insertLine || lines.slice(start, insertLine).some((line) => line.trim().length === 0)) {
      start = insertLine;
    }

    const existing = lines.slice(start, insertLine);
    if (
      existing.length !== generatedLines.length ||
      existing.some((line, index) => line !== generatedLines[index])
    ) {
      changed = true;
      lines.splice(start, insertLine - start, ...generatedLines);
    }
  }

  if (!changed) {
    return undefined;
  }
  return { path: routineLines[0]!.span.file, text: lines.join('\n') };
}

function buildAnnotations(
  loaded: {
    sourceTexts: ReadonlyMap<string, string>;
  },
  programRoutines: readonly RegisterCareRoutine[],
  summariesByName: ReadonlyMap<string, RoutineSummary>,
): readonly RegisterCareAnnotationFile[] {
  const byFile = new Map<string, RegisterCareRoutine[]>();
  for (const routine of programRoutines) {
    if (!summariesByName.has(routine.name)) {
      continue;
    }
    const fileRoutines = byFile.get(routine.span.file);
    if (fileRoutines === undefined) {
      byFile.set(routine.span.file, [routine]);
      continue;
    }
    fileRoutines.push(routine);
  }

  const out: RegisterCareAnnotationFile[] = [];
  for (const [path, routines] of byFile) {
    const sourceText = loaded.sourceTexts.get(path);
    if (sourceText === undefined) {
      continue;
    }
    const annotation = annotateSourceFile(sourceText, routines, summariesByName);
    if (annotation !== undefined) {
      out.push({ ...annotation, path });
    }
  }
  return out;
}

export function analyzeRegisterCare(
  loaded: {
    program: {
      files: readonly [{ readonly kind: 'SourceFile'; readonly name: string; readonly items: readonly SourceItem[] }];
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
  summaries = withAcceptedOutputs(summaries, options.acceptedOutputCandidates);
  const summariesByName = new Map(summaries.map((summary) => [summary.name, summary]));

  const knownRoutines = new Set(routineNames(program.routines));
  const diagnostics: Diagnostic[] = [];
  if (options.mode === 'strict') {
    diagnostics.push(...unknownBoundaryDiagnostics(program.directCalls, knownRoutines));
  }

  const reportModel: RegisterCareReportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries,
    conflicts: [],
  };

  const annotations = options.emitAnnotations
    ? buildAnnotations(loaded, program.routines, summariesByName)
    : [];

  return {
    diagnostics,
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
  };
}
