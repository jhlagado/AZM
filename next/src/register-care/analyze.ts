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
  RegisterCareConflict,
  LocatedSmartComment,
} from './types.js';
import type { Z80Instruction } from '../z80/instruction.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';

const FLAG_UNITS: RegisterCareUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

interface AnalyzeRegisterCareResult {
  diagnostics: Diagnostic[];
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

function addAll(target: Set<RegisterCareUnit>, units: readonly RegisterCareUnit[]): void {
  for (const unit of units) target.add(unit);
}

function reg8Units(raw: string): RegisterCareUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'a') return ['A'];
  if (reg === 'b') return ['B'];
  if (reg === 'c') return ['C'];
  if (reg === 'd') return ['D'];
  if (reg === 'e') return ['E'];
  if (reg === 'h') return ['H'];
  if (reg === 'l') return ['L'];
  return [];
}

function reg16Units(raw: string): RegisterCareUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'bc') return ['B', 'C'];
  if (reg === 'de') return ['D', 'E'];
  if (reg === 'hl') return ['H', 'L'];
  if (reg === 'sp') return ['SPH', 'SPL'];
  if (reg === 'ix') return ['IXH', 'IXL'];
  if (reg === 'iy') return ['IYH', 'IYL'];
  return [];
}

function regHalfUnits(raw: string): RegisterCareUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'ixh') return ['IXH'];
  if (reg === 'ixl') return ['IXL'];
  if (reg === 'iyh') return ['IYH'];
  if (reg === 'iyl') return ['IYL'];
  return [];
}

function withFlags(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return unique([...units, ...FLAG_UNITS]);
}

function inferInstructionEffect(instruction: Z80Instruction): {
  reads: RegisterCareUnit[];
  writes: RegisterCareUnit[];
} {
  const reads = new Set<RegisterCareUnit>();
  const writes = new Set<RegisterCareUnit>();

  switch (instruction.mnemonic) {
    case 'ld-a-imm': {
      addAll(writes, ['A']);
      break;
    }

    case 'ld': {
      const target = instruction.target;
      const source = instruction.source;
      if (target.kind === 'reg8') {
        addAll(writes, reg8Units(target.register));
        if (source.kind === 'reg8') addAll(reads, reg8Units(source.register));
        if (source.kind === 'reg-indirect') addAll(reads, reg16Units(source.register));
        if (source.kind === 'indexed') addAll(reads, reg16Units(source.register));
      } else if (target.kind === 'reg16' || target.kind === 'reg-index16') {
        addAll(writes, reg16Units(target.register));
        if (source.kind === 'reg16' || source.kind === 'reg-index16') {
          addAll(reads, reg16Units(source.register));
        }
        if (source.kind === 'reg-indirect') addAll(reads, reg16Units(source.register));
        if (source.kind === 'indexed') addAll(reads, reg16Units(source.register));
      } else if (target.kind === 'reg-half-index') {
        addAll(writes, regHalfUnits(target.register));
        if (source.kind === 'reg8') addAll(reads, reg8Units(source.register));
        if (source.kind === 'reg-indirect') addAll(reads, ['H', 'L']);
        if (source.kind === 'indexed') addAll(reads, reg16Units(source.register));
      } else if (target.kind === 'reg-indirect') {
        addAll(reads, reg16Units(target.register));
        if (source.kind === 'reg8') addAll(reads, reg8Units(source.register));
      } else if (target.kind === 'indexed') {
        addAll(reads, reg16Units(target.register));
        if (source.kind === 'reg8') addAll(reads, reg8Units(source.register));
      } else if (target.kind === 'mem-abs') {
        if (source.kind === 'reg8') addAll(reads, reg8Units(source.register));
      }
      break;
    }

    case 'ldir':
    case 'ldi':
    case 'ldd':
    case 'lddr':
    case 'inc':
    case 'dec':
    case 'add':
    case 'adc':
    case 'sbc':
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
    case 'in':
    case 'out':
    case 'push':
    case 'pop':
      break;
  }

  if (instruction.mnemonic === 'inc' || instruction.mnemonic === 'dec') {
    const operand = instruction.operand;
    if (operand.kind === 'reg8') {
      addAll(reads, reg8Units(operand.register));
      addAll(writes, reg8Units(operand.register));
      addAll(writes, FLAG_UNITS);
      addAll(reads, FLAG_UNITS);
    } else if (operand.kind === 'reg16') {
      addAll(reads, reg16Units(operand.register));
      addAll(writes, reg16Units(operand.register));
      addAll(writes, FLAG_UNITS);
      addAll(reads, FLAG_UNITS);
    } else if (operand.kind === 'reg-half-index') {
      addAll(reads, regHalfUnits(operand.register));
      addAll(writes, regHalfUnits(operand.register));
      addAll(writes, FLAG_UNITS);
      addAll(reads, FLAG_UNITS);
    } else if (operand.kind === 'reg-indirect' || operand.kind === 'indexed') {
      // treat as implicit HL/IX/IY touch for memory addressing
      addAll(reads, operand.kind === 'reg-indirect' ? reg16Units(operand.register) : reg16Units(operand.register));
    }
  }

  if (instruction.mnemonic === 'add' || instruction.mnemonic === 'adc' || instruction.mnemonic === 'sbc') {
    if ('target' in instruction) {
      addAll(reads, reg16Units(instruction.target.register));
      addAll(writes, reg16Units(instruction.target.register));
      addAll(reads, reg16Units(instruction.source.register));
      return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
    }

    addAll(reads, ['A']);
    addAll(writes, withFlags(['A']));
    if (instruction.source.kind === 'reg8') addAll(reads, reg8Units(instruction.source.register));
    return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
  }

  if (instruction.mnemonic === 'sub' || instruction.mnemonic === 'and' || instruction.mnemonic === 'or' || instruction.mnemonic === 'xor' || instruction.mnemonic === 'cp') {
    addAll(reads, ['A']);
    addAll(reads, instruction.source.kind === 'reg8' ? reg8Units(instruction.source.register) : []);
    if (instruction.mnemonic === 'cp') {
      addAll(writes, FLAG_UNITS);
    } else {
      addAll(writes, withFlags(['A']));
    }
    return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
  }

  if (instruction.mnemonic === 'in') {
    if (instruction.target?.kind === 'reg8') addAll(writes, reg8Units(instruction.target.register));
    if (instruction.port.kind === 'c') addAll(reads, ['C']);
    return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
  }

  if (instruction.mnemonic === 'out') {
    if (instruction.source.kind === 'reg8') addAll(reads, reg8Units(instruction.source.register));
    if (instruction.port.kind === 'c') addAll(reads, ['C']);
    return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
  }

  if (instruction.mnemonic === 'push') {
    addAll(reads, reg16Units(instruction.register));
    return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
  }

  if (instruction.mnemonic === 'pop') {
    addAll(writes, reg16Units(instruction.register));
    return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
  }

  if (instruction.mnemonic === 'call' || instruction.mnemonic === 'call-cc') {
    // Treat call as a boundary with a conventional stack effect.
    addAll(reads, ['SPH', 'SPL']);
    addAll(writes, ['SPH', 'SPL']);
    return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
  }

  return { reads: unique(Array.from(reads)), writes: unique(Array.from(writes)) };
}

function inferRoutineSummary(routine: RegisterCareRoutine): RoutineSummary {
  const reads = new Set<RegisterCareUnit>();
  const writes = new Set<RegisterCareUnit>();
  for (const instruction of routine.instructions) {
    const effect = inferInstructionEffect(instruction.instruction);
    addAll(reads, effect.reads);
    addAll(writes, effect.writes);
  }
  return {
    name: routine.name,
    mayRead: Array.from(reads),
    mayWrite: Array.from(writes),
    preserved: [],
  };
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
      mayWrite: unique([...inferred.mayWrite, ...(contract?.out ?? []), ...(contract?.clobbers ?? [])]),
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
): Map<string, RoutineSummary> {
  const out = new Map<string, RoutineSummary>();
  const byRoutine = new Map<string, RoutineSummary>();
  for (const summary of summaries) {
    byRoutine.set(summary.name, summary);
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

function instructionCallTarget(instruction: RegisterCareRoutine['instructions'][number]): string | undefined {
  if (instruction.instruction.mnemonic !== 'call' && instruction.instruction.mnemonic !== 'call-cc') {
    return undefined;
  }
  return instruction.instruction.expression.kind === 'symbol'
    ? instruction.instruction.expression.name
    : undefined;
}

function isCallConditional(instruction: RegisterCareRoutine['instructions'][number]): boolean {
  return instruction.instruction.mnemonic === 'call-cc';
}

function commentExpectedOutputs(
  comments: readonly LocatedSmartComment[],
  instruction: RegisterCareRoutine['instructions'][number],
): RegisterCareUnit[] {
  const prior = comments.find(
    (comment) =>
      comment.file === instruction.file && comment.line === instruction.line - 1 && comment.comment.kind === 'expectOut',
  );
  if (prior === undefined || prior.comment.kind !== 'expectOut') {
    return [];
  }
  return prior.comment.carriers;
}

function conflictMessage(target: string, carriers: RegisterCareUnit[]): string {
  return `CALL ${target} may modify ${carriers.join(',')}, but the pre-call value is used later.`;
}

function buildConflictsForRoutine(
  routine: RegisterCareRoutine,
  summaryByName: ReadonlyMap<string, RoutineSummary>,
  acceptedOutputCandidates: ReadonlyMap<string, readonly RegisterCareUnit[]>,
  smartComments: readonly LocatedSmartComment[],
): RegisterCareConflict[] {
  const conflicts: RegisterCareConflict[] = [];
  const live = new Set<RegisterCareUnit>();

  for (let index = routine.instructions.length - 1; index >= 0; index -= 1) {
    const instruction = routine.instructions[index];
    if (instruction === undefined) continue;

    const target = instructionCallTarget(instruction);
    if (target !== undefined) {
      const targetSummary = summaryByName.get(target);
      if (targetSummary !== undefined) {
        const accepted = new Set<RegisterCareUnit>([
          ...(acceptedOutputCandidates.get(target) ?? []),
          ...commentExpectedOutputs(smartComments, instruction),
        ]);

        const carriedConflict: RegisterCareUnit[] = targetSummary.mayWrite.filter(
          (unit) => live.has(unit) && !accepted.has(unit),
        );
        if (carriedConflict.length > 0) {
          conflicts.push({
            file: instruction.file,
            line: instruction.line,
            column: instruction.column,
            callTarget: target,
            carriers: carriedConflict,
            message: conflictMessage(target, carriedConflict),
          });
        }

        if (!isCallConditional(instruction)) {
          for (const unit of targetSummary.mayWrite) {
            live.delete(unit);
          }
        }
        for (const unit of targetSummary.mayRead) {
          live.add(unit);
        }
      }
    }

    const effect = inferInstructionEffect(instruction.instruction);
    for (const unit of effect.writes) {
      live.delete(unit);
    }
    for (const unit of effect.reads) {
      live.add(unit);
    }
  }

  return conflicts;
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
    directCalls
      .filter((call) => !knownRoutines.has(call.target))
      .map((call) => call.target),
  ).sort();
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

  if (routineLines.length === 0) return undefined;

  const lines = splitSourceLines(sourceText);
  let changed = false;

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
    for (let index = insertLine - 1; index >= 0 && isGeneratedRegisterContractLine(lines[index] ?? ''); index -= 1) {
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

  if (!changed) return undefined;
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
    const annotation = annotateSourceFile(sourceText, routines, summariesByName);
    if (annotation !== undefined) out.push({ ...annotation, path });
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

  const summariesByName = buildSummaryByName(program.routines, summaries);
  const knownRoutines = new Set(routineNames(program.routines));
  for (const [name] of contractMap) {
    knownRoutines.add(name);
  }
  const diagnostics: Diagnostic[] = [];
  const conflicts =
    options.mode === 'warn' || options.mode === 'error' || options.mode === 'strict'
      ? program.routines.flatMap((routine) =>
          buildConflictsForRoutine(
            routine,
            summariesByName,
            options.acceptedOutputCandidates ?? new Map(),
            smartComments,
          ),
        )
      : [];
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

  if (options.mode === 'strict') {
    diagnostics.push(...unknownBoundaryDiagnostics(program.directCalls, knownRoutines));
  }

  const reportModel: RegisterCareReportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries,
    conflicts,
    unknownCalls: options.mode === 'off' ? [] : unknownCallList(program.directCalls, knownRoutines),
  };

  const annotations = options.emitAnnotations
    ? buildAnnotations(loaded, program.routines, summariesByName)
    : [];

  return {
    diagnostics,
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(reportModel.unknownCalls.length > 0 ? { unknownCalls: reportModel.unknownCalls } : {}),
  };
}
