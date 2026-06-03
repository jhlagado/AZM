import { annotateRegisterContractsContracts } from './annotate.js';
import { applyExpectOutFixesToSource, findExpectOutFixesForCandidates } from './fix.js';
import type {
  RegisterContractsAnnotationFile,
  RegisterContractsOutputCandidate,
  RegisterContractsRoutine,
  RoutineSummary,
} from './types.js';

export function buildAnnotations(
  loaded: {
    sourceTexts: ReadonlyMap<string, string>;
  },
  programRoutines: readonly RegisterContractsRoutine[],
  summariesByName: ReadonlyMap<string, RoutineSummary>,
  outputCandidates: readonly RegisterContractsOutputCandidate[],
  options: {
    fixOutputCandidates: boolean;
    outputCandidateFixability: ReadonlyMap<string, boolean>;
    outputCandidateKey: (file: string, line: number, column: number) => string;
  },
): readonly RegisterContractsAnnotationFile[] {
  const routines = programRoutines
    .filter((routine) => summariesByName.has(routine.name))
    .map((routine) => ({
      routine,
      summary: summariesByName.get(routine.name)!,
    }));

  const annotated = annotateRegisterContractsContracts(loaded.sourceTexts, routines);
  if (!options.fixOutputCandidates) {
    return annotated.map((file) => ({ path: file.path, text: file.text }));
  }

  const autoFixableCandidates = outputCandidates.filter(
    (candidate) =>
      options.outputCandidateFixability.get(
        options.outputCandidateKey(candidate.file, candidate.line, candidate.column),
      ) === true,
  );
  const fixes = findExpectOutFixesForCandidates([...programRoutines], autoFixableCandidates);
  if (fixes.length === 0) {
    return annotated.map((file) => ({ path: file.path, text: file.text }));
  }

  const workingTexts = new Map(loaded.sourceTexts);
  for (const file of annotated) {
    workingTexts.set(file.path, file.text);
  }

  const out: RegisterContractsAnnotationFile[] = [];
  const fixesByFile = new Map<string, ReturnType<typeof findExpectOutFixesForCandidates>>();
  for (const fix of fixes) {
    const items = fixesByFile.get(fix.file) ?? [];
    items.push(fix);
    fixesByFile.set(fix.file, items);
  }

  for (const [path, text] of workingTexts) {
    const reference = loaded.sourceTexts.get(path);
    if (reference === undefined) continue;
    const fileFixes = fixesByFile.get(path) ?? [];
    const nextText =
      fileFixes.length > 0 ? applyExpectOutFixesToSource(text, fileFixes, reference) : text;
    if (nextText !== reference) {
      out.push({ path, text: nextText });
    }
  }

  return out.sort((left, right) => left.path.localeCompare(right.path));
}
