import type { Diagnostic } from '../model/diagnostic.js';
import type { DataValue, SourceItem } from '../model/source-item.js';
import {
  diagnostic,
  evaluateExpression,
  lookupEquateRecord,
  type EquateRecord,
  type LayoutRecord,
  validateLayouts,
} from '../semantics/expression-evaluation.js';
import { instructionSize } from './fixup-emission.js';
import {
  advanceCodePlacement,
  advancePlacement,
  applyOrg,
  createPlacementState,
  placementAddress,
  placementForOrg,
} from './placement.js';
export { resolveSymbols } from './address-symbols.js';
import {
  defineEnumMembers,
  defineEquate,
  defineLabel,
  defineLayout,
  defineTypeAlias,
} from './address-symbols.js';

export interface AddressState {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly layouts: Map<string, LayoutRecord>;
  readonly origin: number;
}

interface AddressBuildContext {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly layouts: Map<string, LayoutRecord>;
  readonly enumNames: Set<string>;
  readonly enumNamesLower: Set<string>;
  readonly diagnostics: Diagnostic[];
  readonly lookupLabels: Record<string, number>;
  readonly lookupEquates: Map<string, EquateRecord>;
  readonly lookupLayouts: Map<string, LayoutRecord>;
  readonly reportUnknown: boolean;
  readonly placement: ReturnType<typeof createPlacementState>;
  origin: number;
  originSet: boolean;
}

type AddressItemHandler = (
  context: AddressBuildContext,
  item: SourceItem,
  items: readonly SourceItem[],
  itemIndex: number,
) => boolean | void;

const ADDRESS_ITEM_HANDLERS: Record<SourceItem['kind'], AddressItemHandler> = {
  org: (context, item, items, itemIndex) =>
    applyAddressOrg(context, items, itemIndex, item as Extract<SourceItem, { readonly kind: 'org' }>),
  type: (context, item) =>
    defineAddressLayout(context, item as Extract<SourceItem, { readonly kind: 'type' }>),
  'type-alias': (context, item) =>
    defineAddressTypeAlias(context, item as Extract<SourceItem, { readonly kind: 'type-alias' }>),
  equ: (context, item) =>
    defineAddressEquate(context, item as Extract<SourceItem, { readonly kind: 'equ' }>),
  enum: (context, item) =>
    defineAddressEnum(context, item as Extract<SourceItem, { readonly kind: 'enum' }>),
  comment: () => undefined,
  label: (context, item) =>
    defineAddressLabel(context, item as Extract<SourceItem, { readonly kind: 'label' }>),
  db: (context, item) =>
    advancePlacement(
      context.placement,
      dbSize(item as Extract<SourceItem, { readonly kind: 'db' }>, context.lookupEquates),
    ),
  dw: (context, item) =>
    advancePlacement(
      context.placement,
      (item as Extract<SourceItem, { readonly kind: 'dw' }>).values.length * 2,
    ),
  ds: (context, item) =>
    advanceStorage(context, item as Extract<SourceItem, { readonly kind: 'ds' }>),
  align: (context, item) =>
    advanceAlignment(context, item as Extract<SourceItem, { readonly kind: 'align' }>),
  end: () => true,
  binfrom: () => undefined,
  binto: () => undefined,
  'string-data': (context, item) => {
    const stringItem = item as Extract<SourceItem, { readonly kind: 'string-data' }>;
    advancePlacement(
      context.placement,
      stringDirectiveBytes(stringItem.directive, stringItem.value).length,
    );
  },
  instruction: (context, item) =>
    advanceInstruction(context, item as Extract<SourceItem, { readonly kind: 'instruction' }>),
};

export function buildAddressState(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
): {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly layouts: Map<string, LayoutRecord>;
  readonly origin: number;
} {
  let state = buildAddressStateOnce(items, [], undefined, false);
  let previousSignature = '';

  for (let index = 0; index < Math.max(4, items.length + 1); index += 1) {
    state = buildAddressStateOnce(items, [], state, false);
    const signature = addressStateSignature(state);
    if (signature === previousSignature) {
      break;
    }
    previousSignature = signature;
  }

  return buildAddressStateOnce(items, diagnostics, state, true);
}

function buildAddressStateOnce(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
  previous:
    | {
        readonly labels: Record<string, number>;
        readonly equates: Map<string, EquateRecord>;
        readonly layouts: Map<string, LayoutRecord>;
      }
    | undefined,
  reportUnknown: boolean,
): {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly layouts: Map<string, LayoutRecord>;
  readonly origin: number;
} {
  const context = createAddressBuildContext(previous, diagnostics, reportUnknown);
  let ended = false;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (shouldSkipAfterEnd(ended, item)) {
      continue;
    }
    ended = ADDRESS_ITEM_HANDLERS[item.kind](context, item, items, itemIndex) === true || ended;
  }

  if (context.reportUnknown) {
    validateLayouts(context.layouts, diagnostics);
  }

  return {
    labels: context.labels,
    equates: context.equates,
    layouts: context.layouts,
    origin: context.origin,
  };
}

function shouldSkipAfterEnd(ended: boolean, item: SourceItem): boolean {
  return ended && item.kind !== 'binfrom' && item.kind !== 'binto';
}

function createAddressBuildContext(
  previous:
    | {
        readonly labels: Record<string, number>;
        readonly equates: Map<string, EquateRecord>;
        readonly layouts: Map<string, LayoutRecord>;
      }
    | undefined,
  diagnostics: Diagnostic[],
  reportUnknown: boolean,
): AddressBuildContext {
  const labels: Record<string, number> = {};
  const equates = new Map<string, EquateRecord>();
  const layouts = new Map<string, LayoutRecord>();
  return {
    labels,
    equates,
    layouts,
    enumNames: new Set<string>(),
    enumNamesLower: new Set<string>(),
    diagnostics,
    lookupLabels: previous?.labels ?? labels,
    lookupEquates: previous?.equates ?? equates,
    lookupLayouts: previous?.layouts ?? layouts,
    reportUnknown,
    placement: createPlacementState(),
    origin: 0,
    originSet: false,
  };
}

function applyAddressOrg(
  context: AddressBuildContext,
  items: readonly SourceItem[],
  itemIndex: number,
  item: Extract<SourceItem, { readonly kind: 'org' }>,
): void {
  context.placement.activePlacement = placementForOrg(items, itemIndex);
  const value = evaluateAddressExpression(context, item.expression, item.span);
  if (value === undefined) {
    return;
  }
  if (!context.originSet) {
    context.origin = value;
    context.originSet = true;
  }
  applyOrg(context.placement, value);
}

function defineAddressLayout(
  context: AddressBuildContext,
  item: Extract<SourceItem, { readonly kind: 'type' }>,
): void {
  defineLayout(
    context.layouts,
    context.labels,
    context.equates,
    context.enumNamesLower,
    item.name,
    item.layoutKind,
    item.fields,
    item.span,
    context.diagnostics,
  );
}

function defineAddressTypeAlias(
  context: AddressBuildContext,
  item: Extract<SourceItem, { readonly kind: 'type-alias' }>,
): void {
  defineTypeAlias(
    context.layouts,
    context.labels,
    context.equates,
    context.enumNamesLower,
    item.name,
    item.typeExpr,
    item.span,
    context.diagnostics,
  );
}

function defineAddressEquate(
  context: AddressBuildContext,
  item: Extract<SourceItem, { readonly kind: 'equ' }>,
): void {
  defineEquate(
    context.equates,
    context.labels,
    context.layouts,
    context.enumNames,
    context.enumNamesLower,
    item.name,
    item.expression,
    item.span,
    placementAddress(context.placement),
    context.diagnostics,
    item.stringValue,
  );
}

function defineAddressEnum(
  context: AddressBuildContext,
  item: Extract<SourceItem, { readonly kind: 'enum' }>,
): void {
  defineEnumMembers(
    context.equates,
    context.labels,
    context.layouts,
    context.enumNames,
    context.enumNamesLower,
    item.name,
    item.members,
    item.span,
    context.diagnostics,
  );
}

function defineAddressLabel(
  context: AddressBuildContext,
  item: Extract<SourceItem, { readonly kind: 'label' }>,
): void {
  defineLabel(
    context.labels,
    context.equates,
    context.layouts,
    context.enumNamesLower,
    item.name,
    placementAddress(context.placement),
    item.span,
    context.diagnostics,
  );
}

function advanceStorage(
  context: AddressBuildContext,
  item: Extract<SourceItem, { readonly kind: 'ds' }>,
): void {
  const size = evaluateAddressExpression(context, item.size, item.span);
  if (size !== undefined) {
    advancePlacement(context.placement, size);
  }
}

function advanceAlignment(
  context: AddressBuildContext,
  item: Extract<SourceItem, { readonly kind: 'align' }>,
): void {
  const alignment = evaluateAddressExpression(context, item.alignment, item.span);
  if (alignment === undefined) {
    return;
  }
  if (alignment <= 0) {
    if (context.reportUnknown) {
      context.diagnostics.push(
        diagnostic(item.span, `.align value must be positive: ${alignment}.`),
      );
    }
    return;
  }
  advancePlacement(
    context.placement,
    alignmentPadding(placementAddress(context.placement), alignment),
  );
}

function advanceInstruction(
  context: AddressBuildContext,
  item: Extract<SourceItem, { readonly kind: 'instruction' }>,
): void {
  const instructionBytes = instructionSize(item.instruction);
  advanceCodePlacement(context.placement, instructionBytes);
  if (context.placement.activePlacement === 'data') {
    advancePlacement(context.placement, instructionBytes);
  }
}

function evaluateAddressExpression(
  context: AddressBuildContext,
  expression: Parameters<typeof evaluateExpression>[0],
  span: Parameters<typeof evaluateExpression>[3],
): number | undefined {
  return evaluateExpression(
    expression,
    context.lookupLabels,
    context.lookupEquates,
    span,
    context.diagnostics,
    {
      currentLocation: placementAddress(context.placement),
      layouts: context.lookupLayouts,
      reportUnknown: context.reportUnknown,
    },
  );
}

function dbSize(
  item: Extract<SourceItem, { readonly kind: 'db' }>,
  lookupEquates: ReadonlyMap<string, EquateRecord>,
): number {
  return item.values.reduce((size, value) => size + dataValueSize(value, lookupEquates), 0);
}

export function stringDirectiveBytes(
  directive: 'cstr' | 'pstr' | 'istr',
  value: string,
): readonly number[] {
  const bytes = [...value].map((char) => char.codePointAt(0) ?? 0);
  switch (directive) {
    case 'cstr':
      return [...bytes.map(toByte), 0];
    case 'pstr':
      return [bytes.length & 0xff, ...bytes.map(toByte)];
    case 'istr':
      return bytes.map((byte, index) => toByte(byte | (index === bytes.length - 1 ? 0x80 : 0)));
  }
}

function toByte(value: number): number {
  return value & 0xff;
}

function dataValueSize(
  value: DataValue,
  equates: ReadonlyMap<string, EquateRecord>,
): number {
  if (value.kind === 'string-fragment') {
    return [...value.value].length;
  }
  if (value.kind === 'symbol') {
    const equate = lookupEquateRecord(equates, value.name);
    if (equate?.record.stringValue !== undefined) {
      return [...equate.record.stringValue].length;
    }
  }
  return 1;
}

export function alignmentPadding(address: number, alignment: number): number {
  const remainder = address % alignment;
  return remainder === 0 ? 0 : alignment - remainder;
}

function addressStateSignature(state: {
  readonly labels: Record<string, number>;
  readonly equates: ReadonlyMap<string, EquateRecord>;
  readonly layouts: ReadonlyMap<string, LayoutRecord>;
  readonly origin: number;
}): string {
  return JSON.stringify({
    labels: state.labels,
    equates: [...state.equates].map(([name, record]) => [name, record.currentLocation]),
    layouts: [...state.layouts].map(([name, record]) => [
      name,
      record.kind,
      record.kind === 'alias' ? record.typeExpr : record.fields,
    ]),
    origin: state.origin,
  });
}
