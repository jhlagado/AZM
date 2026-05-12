import type { EmittedSourceSegment } from '../formats/types.js';
import type { PendingSymbol, SourceSegmentTag } from './loweringTypes.js';
import type {
  NonBankedSectionKeyCollection,
  SectionAnchorRecord,
  SectionContributionRecord,
} from '../sectionKeys.js';

export type AbsoluteFixupRecord = {
  /** Byte offset of the patched word. */
  offset: number;
  /** Target symbol (lowercased). */
  baseLower: string;
  /** Addend in bytes. */
  addend: number;
  /** Owning source file. */
  file: string;
};

export type Rel8FixupRecord = {
  /** Patch site offset. */
  offset: number;
  /** Branch origin for range validation. */
  origin: number;
  /** Target symbol (lowercased). */
  baseLower: string;
  /** Addend to target. */
  addend: number;
  /** Owning source file. */
  file: string;
  /** Mnemonic for diagnostics. */
  mnemonic: string;
};

export type StartupInitAction =
  | {
      /** Copy region into named section bytes. */
      kind: 'copy';
      /** Destination offset within the section. */
      offset: number;
      /** Length in bytes. */
      length: number;
    }
  | {
      /** Zero-fill region. */
      kind: 'zero';
      /** Destination offset within the section. */
      offset: number;
      /** Length in bytes. */
      length: number;
    };

export type NamedSectionContributionSink = {
  /** Contribution metadata (order, key). */
  contribution: SectionContributionRecord;
  /** Anchor placement record for this section. */
  anchor: SectionAnchorRecord;
  /** Emitted bytes for this contribution. */
  bytes: Map<number, number>;
  /** Current write cursor within `bytes`. */
  offset: number;
  /** Symbols defined in this block not yet finalized. */
  pendingSymbols: PendingSymbol[];
  /** Queued abs16 fixups for this sink. */
  fixups: AbsoluteFixupRecord[];
  /** Queued rel8 fixups. */
  rel8Fixups: Rel8FixupRecord[];
  /** Source segments for listings. */
  sourceSegments: EmittedSourceSegment[];
  /** Active listing tag; `undefined` when not in a tagged region. */
  currentSourceTag: SourceSegmentTag | undefined;
  /** Recorded init/copy actions for startup glue. */
  startupInitActions: StartupInitAction[];
};

export function createNamedSectionContributionSinks(
  collected: NonBankedSectionKeyCollection,
): NamedSectionContributionSink[] {
  const sinks: NamedSectionContributionSink[] = [];

  for (const contribution of collected.orderedContributions) {
    const anchor = collected.anchorsByKey.get(contribution.keyId);
    if (!anchor) continue;
    sinks.push({
      contribution,
      anchor,
      bytes: new Map(),
      offset: 0,
      pendingSymbols: [],
      fixups: [],
      rel8Fixups: [],
      sourceSegments: [],
      currentSourceTag: undefined,
      startupInitActions: [],
    });
  }

  return sinks;
}
