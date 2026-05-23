import type { SourceItem } from '../model/source-item.js';

export type PlacementKind = 'code' | 'data';

export interface PlacementState {
  activePlacement: PlacementKind;
  codeOffset: number;
  dataOffset: number;
  codeBase: number | undefined;
  dataBase: number | undefined;
}

export function createPlacementState(): PlacementState {
  return {
    activePlacement: 'code',
    codeOffset: 0,
    dataOffset: 0,
    codeBase: undefined,
    dataBase: undefined,
  };
}

/** Mirrors current AZM org lookahead: data org before raw storage, otherwise code. */
export function placementForOrg(items: readonly SourceItem[], index: number): PlacementKind {
  for (let lookahead = index + 1; lookahead < items.length; lookahead += 1) {
    const next = items[lookahead];
    if (!next) {
      continue;
    }
    if (next.kind === 'db' || next.kind === 'dw' || next.kind === 'ds' || next.kind === 'string-data') {
      return 'data';
    }
    if (next.kind === 'label' || next.kind === 'equ') {
      continue;
    }
    return 'code';
  }
  return 'code';
}

function placementOffset(state: PlacementState): number {
  return state.activePlacement === 'data' ? state.dataOffset : state.codeOffset;
}

export function placementAddress(state: PlacementState): number {
  return (placementBase(state, state.activePlacement) ?? 0) + placementOffset(state);
}

function placementBase(state: PlacementState, kind: PlacementKind): number | undefined {
  return kind === 'data' ? state.dataBase : state.codeBase;
}

export function applyOrg(state: PlacementState, target: number): void {
  const kind = state.activePlacement;
  const base = placementBase(state, kind);
  if (base === undefined) {
    if (kind === 'data') {
      state.dataBase = target;
    } else {
      state.codeBase = target;
    }
    return;
  }
  const offset = target - base;
  const offsetRef = kind === 'data' ? 'dataOffset' : 'codeOffset';
  if (offset > state[offsetRef]) {
    state[offsetRef] = offset;
  }
}

export function advancePlacement(state: PlacementState, size: number): void {
  if (state.activePlacement === 'data') {
    state.dataOffset += size;
  } else {
    state.codeOffset += size;
  }
}

export function advanceCodePlacement(state: PlacementState, size: number): void {
  state.codeOffset += size;
}

export function computeResolvedBases(state: PlacementState): {
  readonly codeBase: number;
  readonly dataBase: number;
} {
  const codeBase = state.codeBase ?? 0;
  const dataBase = state.dataBase ?? alignUp(codeBase + state.codeOffset, 2);
  return { codeBase, dataBase };
}

export function absoluteCodeAddress(state: PlacementState, bases: { readonly codeBase: number }): number {
  return bases.codeBase + state.codeOffset;
}

export function absoluteDataAddress(state: PlacementState, bases: { readonly dataBase: number }): number {
  return bases.dataBase + state.dataOffset;
}

function alignUp(value: number, alignment: number): number {
  const remainder = value % alignment;
  return remainder === 0 ? value : value + (alignment - remainder);
}
