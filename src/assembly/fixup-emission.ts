import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { Fixup, FixupTarget } from '../model/fixup.js';
import type { Instruction } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';
import {
  diagnostic,
  evaluateExpression,
  lookupSymbolValue,
  type EquateRecord,
  type LayoutRecord,
} from '../semantics/expression-evaluation.js';
import {
  applyBinaryOperator,
  applyUnaryOperator,
} from '../semantics/constant-operators.js';
import { encodeZ80Instruction } from '../z80/encode.js';
import type { EncodedZ80Fragment } from '../z80/instruction.js';

export function emitInstruction(
  instruction: Instruction,
  span: SourceSpan,
  currentAddress: number,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  diagnostics: Diagnostic[],
  bytes: number[],
  fixups: Fixup[],
  layouts?: ReadonlyMap<string, LayoutRecord>,
): number {
  const encoded = encodeZ80Instruction(instruction);
  for (const fragment of encoded.fragments) {
    emitZ80Fragment(
      fragment,
      span,
      currentAddress,
      encoded.size,
      labels,
      equates,
      diagnostics,
      bytes,
      fixups,
      layouts,
    );
  }
  return encoded.size;
}

export function emitAbs16Expression(
  expression: Expression,
  span: SourceSpan,
  currentAddress: number,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  diagnostics: Diagnostic[],
  bytes: number[],
  fixups: Fixup[],
  layouts?: ReadonlyMap<string, LayoutRecord>,
): boolean {
  const target = fixupTargetFromExpression(expression);
  if (target) {
    fixups.push({ kind: 'abs16', offset: bytes.length, target, span });
    bytes.push(0, 0);
    return true;
  }

  const value = evaluateExpression(expression, labels, equates, span, diagnostics, {
    currentLocation: currentAddress,
    layouts,
  });
  if (value === undefined) {
    return false;
  }
  if (!isAbs16Value(value)) {
    diagnostics.push(diagnostic(span, `16-bit value out of range: ${value}.`));
    bytes.push(0, 0);
    return true;
  }
  bytes.push(value & 0xff, (value >> 8) & 0xff);
  return true;
}

export function patchFixups(
  fixups: readonly Fixup[],
  symbols: Readonly<Record<string, number>>,
  bytes: number[],
  diagnostics: Diagnostic[],
): void {
  for (const fixup of fixups) {
    const base = lookupSymbolValue(symbols, fixup.target.symbol);
    if (base === undefined) {
      const context = fixup.kind === 'rel8' ? `rel8 ${fixup.mnemonic} fixup` : '16-bit fixup';
      diagnostics.push(
        diagnostic(fixup.span, `Unresolved symbol "${fixup.target.symbol}" in ${context}.`),
      );
      continue;
    }

    const target = base + fixup.target.addend;
    if (fixup.kind === 'abs16') {
      patchAbs16(fixup, target, bytes, diagnostics);
    } else {
      emitRel8Displacement(
        target,
        fixup.origin,
        fixup.mnemonic,
        bytes,
        diagnostics,
        fixup.span,
        fixup.offset,
      );
    }
  }
}

export function instructionSize(instruction: Instruction): number {
  return encodeZ80Instruction(instruction).size;
}

function emitZ80Fragment(
  fragment: EncodedZ80Fragment,
  span: SourceSpan,
  currentAddress: number,
  instructionSize: number,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  diagnostics: Diagnostic[],
  bytes: number[],
  fixups: Fixup[],
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
): void {
  switch (fragment.kind) {
    case 'bytes':
      bytes.push(...fragment.bytes);
      return;
    case 'imm8':
      emitImm8Expression(
        fragment.expression,
        fragment.failureMessage,
        span,
        currentAddress,
        labels,
        equates,
        diagnostics,
        bytes,
        layouts,
      );
      return;
    case 'port8':
      emitPort8Expression(
        fragment.expression,
        fragment.message,
        span,
        currentAddress,
        labels,
        equates,
        diagnostics,
        bytes,
        layouts,
      );
      return;
    case 'disp8':
      emitDisp8Expression(
        fragment.expression,
        fragment.message,
        span,
        currentAddress,
        labels,
        equates,
        diagnostics,
        bytes,
        layouts,
      );
      return;
    case 'abs16':
      emitAbs16Expression(
        fragment.expression,
        span,
        currentAddress,
        labels,
        equates,
        diagnostics,
        bytes,
        fixups,
        layouts,
      );
      return;
    case 'rel8':
      emitRel8Expression(
        fragment.expression,
        fragment.mnemonic,
        span,
        currentAddress + instructionSize,
        currentAddress,
        labels,
        equates,
        diagnostics,
        bytes,
        fixups,
        layouts,
      );
      return;
  }
}

function emitPort8Expression(
  expression: Expression,
  message: string,
  span: SourceSpan,
  currentAddress: number,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  diagnostics: Diagnostic[],
  bytes: number[],
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
): void {
  const value = evaluateExpression(expression, labels, equates, span, diagnostics, {
    currentLocation: currentAddress,
    layouts,
  });
  if (value === undefined) {
    return;
  }
  if (!isImm8Value(value)) {
    diagnostics.push(diagnostic(span, message));
    bytes.push(0);
    return;
  }
  bytes.push(value & 0xff);
}

function emitImm8Expression(
  expression: Expression,
  failureMessage: string | undefined,
  span: SourceSpan,
  currentAddress: number,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  diagnostics: Diagnostic[],
  bytes: number[],
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
): void {
  const value = evaluateExpression(expression, labels, equates, span, diagnostics, {
    currentLocation: currentAddress,
    layouts,
    reportUnknown: failureMessage === undefined,
  });
  if (value === undefined) {
    if (failureMessage) {
      diagnostics.push(diagnostic(span, failureMessage));
      bytes.push(0);
    }
    return;
  }
  if (!isImm8Value(value)) {
    diagnostics.push(diagnostic(span, `8-bit value out of range: ${value}.`));
    bytes.push(0);
    return;
  }
  bytes.push(value & 0xff);
}

function emitDisp8Expression(
  expression: Expression,
  message: string | undefined,
  span: SourceSpan,
  currentAddress: number,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  diagnostics: Diagnostic[],
  bytes: number[],
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
): void {
  const value = evaluateExpression(expression, labels, equates, span, diagnostics, {
    currentLocation: currentAddress,
    layouts,
  });
  if (value === undefined) {
    return;
  }
  if (value < -128 || value > 127) {
    diagnostics.push(
      diagnostic(span, message ?? `indexed displacement out of range: ${value}.`),
    );
    bytes.push(0);
    return;
  }
  bytes.push(value & 0xff);
}

function emitRel8Expression(
  expression: Expression,
  mnemonic: string,
  span: SourceSpan,
  origin: number,
  currentAddress: number,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  diagnostics: Diagnostic[],
  bytes: number[],
  fixups: Fixup[],
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
): void {
  const target = fixupTargetFromExpression(expression);
  if (target) {
    fixups.push({ kind: 'rel8', offset: bytes.length, origin, target, mnemonic, span });
    bytes.push(0);
    return;
  }

  const value = evaluateExpression(expression, labels, equates, span, diagnostics, {
    currentLocation: currentAddress,
    layouts,
  });
  if (value !== undefined) {
    emitRel8Displacement(value, origin, mnemonic, bytes, diagnostics, span);
  }
}

function patchAbs16(
  fixup: Extract<Fixup, { readonly kind: 'abs16' }>,
  target: number,
  bytes: number[],
  diagnostics: Diagnostic[],
): void {
  if (!isAbs16Value(target)) {
    diagnostics.push(
      diagnostic(
        fixup.span,
        `16-bit fixup address out of range for "${fixup.target.symbol}" with addend ${fixup.target.addend}: ${target}.`,
      ),
    );
    return;
  }
  bytes[fixup.offset] = target & 0xff;
  bytes[fixup.offset + 1] = (target >> 8) & 0xff;
}

function isAbs16Value(value: number): boolean {
  return Number.isInteger(value) && value >= -0x8000 && value <= 0xffff;
}

function isImm8Value(value: number): boolean {
  return value >= -128 && value <= 0xff;
}

function emitRel8Displacement(
  target: number,
  origin: number,
  mnemonic: string,
  bytes: number[],
  diagnostics: Diagnostic[],
  span: SourceSpan,
  offset = bytes.length,
): void {
  const displacement = target - origin;
  if (displacement < -128 || displacement > 127) {
    diagnostics.push(
      diagnostic(
        span,
        `${mnemonic} target out of range for rel8 branch (${displacement}, expected -128..127).`,
      ),
    );
    bytes[offset] = 0;
    if (offset === bytes.length) {
      bytes.push(0);
    }
    return;
  }

  bytes[offset] = displacement & 0xff;
  if (offset === bytes.length) {
    bytes.push(displacement & 0xff);
  }
}

function fixupTargetFromExpression(expression: Expression): FixupTarget | undefined {
  if (expression.kind === 'symbol') {
    return { symbol: expression.name, addend: 0 };
  }
  return expression.kind === 'binary' ? binaryFixupTarget(expression) : undefined;
}

function binaryFixupTarget(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
): FixupTarget | undefined {
  if (expression.operator !== '+' && expression.operator !== '-') return undefined;
  return leftSymbolFixupTarget(expression) ?? rightSymbolFixupTarget(expression);
}

function expressionSymbol(expression: Expression): string | undefined {
  return expression.kind === 'symbol' ? expression.name : undefined;
}

function leftSymbolFixupTarget(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
): FixupTarget | undefined {
  const symbol = expressionSymbol(expression.left);
  const rightConstant = constantExpressionValue(expression.right);
  if (!symbol || rightConstant === undefined) return undefined;
  return {
    symbol,
    addend: expression.operator === '+' ? rightConstant : -rightConstant,
  };
}

function rightSymbolFixupTarget(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
): FixupTarget | undefined {
  if (expression.operator !== '+') return undefined;
  const symbol = expressionSymbol(expression.right);
  const leftConstant = constantExpressionValue(expression.left);
  return symbol && leftConstant !== undefined
    ? { symbol, addend: leftConstant }
    : undefined;
}

function constantExpressionValue(expression: Expression): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'unary':
      return constantUnaryExpressionValue(expression);
    case 'binary':
      return constantBinaryExpressionValue(expression);
    case 'current-location':
    case 'symbol':
      return undefined;
  }
}

function constantUnaryExpressionValue(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
): number | undefined {
  const value = constantExpressionValue(expression.expression);
  if (value === undefined) {
    return undefined;
  }
  return applyUnaryOperator(expression.operator, value);
}

function constantBinaryExpressionValue(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
): number | undefined {
  const left = constantExpressionValue(expression.left);
  const right = constantExpressionValue(expression.right);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  return applyBinaryOperator(expression.operator, left, right);
}
