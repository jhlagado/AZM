import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type { RegisterCareDirectCall, RegisterCareRoutine } from './types.js';
import type { AnalyzeRegisterCareOptions, RoutineContract, RoutineSummary, RegisterCareReportModel } from './types.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';

interface AnalyzeRegisterCareResult {
  diagnostics: Diagnostic[];
  reportText?: string;
  interfaceText?: string;
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
  const contractMap = buildRoutineContracts(
    smartComments,
    program.routines,
    loaded.sourceTexts,
  );
  if (options.interfaceContracts !== undefined) {
    for (const contract of options.interfaceContracts) {
      contractMap.set(contract.name, contract);
    }
  }

  const summaries = buildSummaries(program.routines, contractMap);
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
  return {
    diagnostics,
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
  };
}
