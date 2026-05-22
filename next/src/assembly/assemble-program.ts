import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { Fixup } from '../model/fixup.js';
import type { SourceItem } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { SourceSpan } from '../source/source-span.js';
import { diagnostic, evaluateExpression, type EquateRecord } from './expression-evaluation.js';
import {
  emitAbs16Expression,
  emitInstruction,
  instructionSize,
  patchFixups,
} from './fixup-emission.js';

export interface AssemblyResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: SymbolTable;
  readonly origin: number;
  readonly bytes: Uint8Array;
}

export function assembleProgram(items: readonly SourceItem[]): AssemblyResult {
  const diagnostics: Diagnostic[] = [];
  const addressState = buildAddressState(items, diagnostics);
  const { labels, equates, origin } = addressState;

  const symbols = resolveSymbols(labels, equates, diagnostics);
  if (diagnostics.length > 0) {
    return { diagnostics, symbols, origin, bytes: new Uint8Array() };
  }

  const bytes: number[] = [];
  const fixups: Fixup[] = [];
  let currentAddress = 0;

  for (const item of items) {
    switch (item.kind) {
      case 'org': {
        const value = evaluateExpression(item.expression, labels, equates, item.span, diagnostics, {
          currentLocation: currentAddress,
        });
        if (value !== undefined) {
          currentAddress = value;
        }
        break;
      }
      case 'equ':
      case 'label':
        break;
      case 'db':
        for (const expression of item.values) {
          const value = evaluateExpression(expression, labels, equates, item.span, diagnostics, {
            currentLocation: currentAddress,
          });
          if (value !== undefined) {
            bytes.push(value & 0xff);
            currentAddress += 1;
          }
        }
        break;
      case 'dw':
        for (const expression of item.values) {
          if (
            emitAbs16Expression(
              expression,
              item.span,
              currentAddress,
              labels,
              equates,
              diagnostics,
              bytes,
              fixups,
            )
          ) {
            currentAddress += 2;
          }
        }
        break;
      case 'ds': {
        const size = evaluateExpression(item.size, labels, equates, item.span, diagnostics, {
          currentLocation: currentAddress,
        });
        if (size !== undefined) {
          for (let index = 0; index < size; index += 1) {
            bytes.push(0);
          }
          currentAddress += size;
        }
        break;
      }
      case 'string-data':
        for (const value of stringDirectiveBytes(item.directive, item.value)) {
          bytes.push(value);
          currentAddress += 1;
        }
        break;
      case 'instruction':
        currentAddress += emitInstruction(
          item.instruction,
          item.span,
          currentAddress,
          labels,
          equates,
          diagnostics,
          bytes,
          fixups,
        );
        break;
    }
  }

  patchFixups(fixups, symbols, bytes, diagnostics);

  return {
    diagnostics,
    symbols,
    origin,
    bytes: diagnostics.length > 0 ? new Uint8Array() : Uint8Array.from(bytes),
  };
}

function buildAddressState(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
): {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
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
    | { readonly labels: Record<string, number>; readonly equates: Map<string, EquateRecord> }
    | undefined,
  reportUnknown: boolean,
): {
  readonly labels: Record<string, number>;
  readonly equates: Map<string, EquateRecord>;
  readonly origin: number;
} {
  const labels: Record<string, number> = {};
  const equates = new Map<string, EquateRecord>();
  let origin = 0;
  let originSet = false;
  let currentAddress = 0;

  const lookupLabels = previous?.labels ?? labels;
  const lookupEquates = previous?.equates ?? equates;

  for (const item of items) {
    switch (item.kind) {
      case 'org': {
        const value = evaluateExpression(
          item.expression,
          lookupLabels,
          lookupEquates,
          item.span,
          diagnostics,
          {
            currentLocation: currentAddress,
            reportUnknown,
          },
        );
        if (value !== undefined) {
          if (!originSet) {
            origin = value;
            originSet = true;
          }
          currentAddress = value;
        }
        break;
      }
      case 'equ':
        defineEquate(
          equates,
          labels,
          item.name,
          item.expression,
          item.span,
          currentAddress,
          diagnostics,
        );
        break;
      case 'label':
        defineLabel(labels, equates, item.name, currentAddress, item.span, diagnostics);
        break;
      case 'db':
        currentAddress += item.values.length;
        break;
      case 'dw':
        currentAddress += item.values.length * 2;
        break;
      case 'ds': {
        const size = evaluateExpression(
          item.size,
          lookupLabels,
          lookupEquates,
          item.span,
          diagnostics,
          {
            currentLocation: currentAddress,
            reportUnknown,
          },
        );
        if (size !== undefined) {
          currentAddress += size;
        }
        break;
      }
      case 'string-data':
        currentAddress += stringDirectiveBytes(item.directive, item.value).length;
        break;
      case 'instruction':
        currentAddress += instructionSize(item.instruction);
        break;
    }
  }

  return { labels, equates, origin };
}

function stringDirectiveBytes(
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

function addressStateSignature(state: {
  readonly labels: Record<string, number>;
  readonly equates: ReadonlyMap<string, EquateRecord>;
  readonly origin: number;
}): string {
  return JSON.stringify({
    labels: state.labels,
    equates: [...state.equates].map(([name, record]) => [name, record.currentLocation]),
    origin: state.origin,
  });
}

function defineLabel(
  labels: Record<string, number>,
  equates: ReadonlyMap<string, EquateRecord>,
  name: string,
  address: number,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): void {
  if (labels[name] !== undefined || equates.has(name)) {
    diagnostics.push(diagnostic(span, `duplicate symbol: ${name}`));
    return;
  }
  labels[name] = address;
}

function defineEquate(
  equates: Map<string, EquateRecord>,
  labels: Readonly<Record<string, number>>,
  name: string,
  expression: Expression,
  span: SourceSpan,
  currentLocation: number,
  diagnostics: Diagnostic[],
): void {
  if (labels[name] !== undefined || equates.has(name)) {
    diagnostics.push(diagnostic(span, `duplicate symbol: ${name}`));
    return;
  }
  equates.set(name, { expression, span, currentLocation });
}

function resolveSymbols(
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  diagnostics: Diagnostic[],
): SymbolTable {
  const symbols: Record<string, number> = { ...labels };
  for (const [name, record] of equates) {
    const value = evaluateExpression(record.expression, labels, equates, record.span, diagnostics, {
      currentLocation: record.currentLocation,
      visiting: new Set([name]),
    });
    if (value !== undefined) {
      symbols[name] = value;
    }
  }
  return symbols;
}
