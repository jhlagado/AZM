import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { SourceSpan } from '../source/source-span.js';

interface EquateRecord {
  readonly expression: Expression;
  readonly span: SourceSpan;
  readonly currentLocation: number;
}

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
          const value = evaluateExpression(expression, labels, equates, item.span, diagnostics, {
            currentLocation: currentAddress,
          });
          if (value !== undefined) {
            bytes.push(value & 0xff, (value >> 8) & 0xff);
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
      case 'instruction':
        if (item.instruction.mnemonic === 'nop') {
          bytes.push(0x00);
          currentAddress += 1;
        } else if (item.instruction.mnemonic === 'ret') {
          bytes.push(0xc9);
          currentAddress += 1;
        } else {
          const value = evaluateExpression(
            item.instruction.expression,
            labels,
            equates,
            item.span,
            diagnostics,
            { currentLocation: currentAddress },
          );
          if (value !== undefined) {
            bytes.push(0x3e, value & 0xff);
            currentAddress += 2;
          }
        }
        break;
    }
  }

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
      case 'instruction':
        currentAddress += item.instruction.mnemonic === 'ld-a-imm' ? 2 : 1;
        break;
    }
  }

  return { labels, equates, origin };
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

function evaluateExpression(
  expression: Expression,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: {
    readonly currentLocation: number;
    readonly visiting?: ReadonlySet<string>;
    readonly reportUnknown?: boolean;
  },
): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'current-location':
      return options.currentLocation;
    case 'symbol': {
      const label = labels[expression.name];
      if (label !== undefined) {
        return label;
      }

      const equate = equates.get(expression.name);
      if (equate) {
        if (options.visiting?.has(expression.name)) {
          diagnostics.push(diagnostic(span, `recursive symbol: ${expression.name}`));
          return undefined;
        }
        return evaluateExpression(equate.expression, labels, equates, equate.span, diagnostics, {
          currentLocation: equate.currentLocation,
          visiting: new Set([...(options.visiting ?? []), expression.name]),
        });
      }

      if (options.reportUnknown ?? true) {
        diagnostics.push(diagnostic(span, `unknown symbol: ${expression.name}`));
      }
      return undefined;
    }
    case 'unary': {
      const value = evaluateExpression(
        expression.expression,
        labels,
        equates,
        span,
        diagnostics,
        options,
      );
      if (value === undefined) {
        return undefined;
      }
      switch (expression.operator) {
        case '+':
          return value;
        case '-':
          return -value;
        case '~':
          return ~value;
      }
    }
    case 'binary': {
      const left = evaluateExpression(expression.left, labels, equates, span, diagnostics, options);
      const right = evaluateExpression(
        expression.right,
        labels,
        equates,
        span,
        diagnostics,
        options,
      );
      if (left === undefined || right === undefined) {
        return undefined;
      }
      switch (expression.operator) {
        case '*':
          return left * right;
        case '/':
          if (right === 0) {
            diagnostics.push(diagnostic(span, 'divide by zero in expression'));
            return undefined;
          }
          return Math.trunc(left / right);
        case '%':
          if (right === 0) {
            diagnostics.push(diagnostic(span, 'modulo by zero in expression'));
            return undefined;
          }
          return left % right;
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '&':
          return left & right;
        case '^':
          return left ^ right;
        case '|':
          return left | right;
        case '<<':
          return left << right;
        case '>>':
          return left >> right;
      }
    }
  }
}

function diagnostic(span: SourceSpan, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_SYMBOL',
    message,
    sourceName: span.sourceName,
    line: span.line,
    column: span.column,
  };
}
