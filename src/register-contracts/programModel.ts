import type { SourceItem } from '../model/source-item.js';
import { collectConstants } from './constants.js';
import { collectDirectTailJumps, collectFilesWithEntryLabels } from './programModel-boundaries.js';
import { buildRoutinesAndDirectCalls } from './programModel-routines.js';
import type { RegisterContractsProgramModel } from './types.js';

export function buildRegisterContractsProgramModel(
  items: readonly SourceItem[],
): RegisterContractsProgramModel {
  const constants = collectConstants(items);
  const filesWithEntryLabels = collectFilesWithEntryLabels(items);
  const { routines, directCalls } = buildRoutinesAndDirectCalls(
    items,
    constants,
    filesWithEntryLabels,
  );
  const directTailJumps = collectDirectTailJumps(items, filesWithEntryLabels);

  return {
    routines,
    directCalls,
    directBoundaries: [...directCalls, ...directTailJumps],
  };
}
