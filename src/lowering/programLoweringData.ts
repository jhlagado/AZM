import type { DataBlockNode, ImmExprNode } from '../frontend/ast.js';
import type { StartupInitAction } from './sectionContributions.js';
import type { PendingSymbol } from './loweringTypes.js';
import type { Context } from './programLowering.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';

export function lowerDataBlock(
  ctx: Context,
  dataBlock: DataBlockNode,
  target: {
    section: 'code' | 'data';
    bytes: Map<number, number>;
    offsetRef: { current: number };
    pending: PendingSymbol[];
    startupInitActions?: StartupInitAction[];
  } = {
    section: 'data',
    bytes: ctx.dataBytes,
    offsetRef: ctx.dataOffsetRef,
    pending: ctx.pending,
  },
): void {
  for (const decl of dataBlock.decls) {
    const okToDeclareSymbol = !ctx.taken.has(decl.name);
    if (!okToDeclareSymbol) {
      ctx.diag(ctx.diagnostics, decl.span.file, `Duplicate symbol name "${decl.name}".`);
    } else {
      ctx.taken.add(decl.name);
      target.pending.push({
        kind: 'data',
        name: decl.name,
        section: target.section,
        offset: target.offsetRef.current,
        file: decl.span.file,
        line: decl.span.start.line,
        scope: 'global',
      });
      ctx.recordLoweredAsmItem({ kind: 'label', name: decl.name }, decl.span);
    }

    const type = decl.typeExpr;
    const init = decl.initializer;

    const emitByte = (b: number) => {
      target.bytes.set(target.offsetRef.current, b & 0xff);
      target.offsetRef.current++;
      ctx.recordLoweredAsmItem(
        { kind: 'db', values: [{ kind: 'literal', value: b & 0xff }] },
        decl.span,
      );
    };
    const emitWord = (w: number) => {
      target.bytes.set(target.offsetRef.current, w & 0xff);
      target.offsetRef.current++;
      target.bytes.set(target.offsetRef.current, (w >> 8) & 0xff);
      target.offsetRef.current++;
      ctx.recordLoweredAsmItem(
        { kind: 'dw', values: [{ kind: 'literal', value: w & 0xffff }] },
        decl.span,
      );
    };
    const recordStartupInit = (
      kind: 'copy' | 'zero',
      offset: number,
      length: number,
    ) => {
      if (!target.startupInitActions) return;
      if (length <= 0) return;
      target.startupInitActions.push({
        kind,
        offset,
        length,
      });
    };

    const recordType = ctx.resolveAggregateType(type);
    if (recordType?.kind === 'record') {
      if (init.kind === 'InitZero') {
        const zeroStart = target.offsetRef.current;
        const storageBytes = sizeOfTypeExpr(type, ctx.env, ctx.diagnostics);
        if (storageBytes === undefined) continue;
        for (let pad = 0; pad < storageBytes; pad++) emitByte(0);
        recordStartupInit('zero', zeroStart, storageBytes);
        continue;
      }
      if (init.kind === 'InitString') {
        ctx.diag(ctx.diagnostics, decl.span.file, `Record initializer for "${decl.name}" must use aggregate form.`);
        continue;
      }

      const valuesByField = new Map<string, ImmExprNode>();
      let recordInitFailed = false;
      if (init.kind === 'InitRecordNamed') {
        for (const fieldInit of init.fields) {
          const field = recordType.fields.find((f) => f.name === fieldInit.name);
          if (!field) {
            ctx.diag(ctx.diagnostics, decl.span.file, `Unknown record field "${fieldInit.name}" in initializer for "${decl.name}".`);
            recordInitFailed = true;
            continue;
          }
          if (valuesByField.has(field.name)) {
            ctx.diag(ctx.diagnostics, decl.span.file, `Duplicate record field "${field.name}" in initializer for "${decl.name}".`);
            recordInitFailed = true;
            continue;
          }
          valuesByField.set(field.name, fieldInit.value);
        }
        for (const field of recordType.fields) {
          if (valuesByField.has(field.name)) continue;
          ctx.diag(ctx.diagnostics, decl.span.file, `Missing record field "${field.name}" in initializer for "${decl.name}".`);
          recordInitFailed = true;
        }
      } else {
        if (init.elements.length !== recordType.fields.length) {
          ctx.diag(ctx.diagnostics, decl.span.file, `Record initializer field count mismatch for "${decl.name}".`);
          continue;
        }
        for (let index = 0; index < recordType.fields.length; index++) {
          const field = recordType.fields[index]!;
          const element = init.elements[index]!;
          valuesByField.set(field.name, element);
        }
      }
      if (recordInitFailed) continue;

      const encodedFields: Array<{ width: 1 | 2; value: number }> = [];
      for (const field of recordType.fields) {
        const fieldValueExpr = valuesByField.get(field.name);
        if (!fieldValueExpr) continue;
        const scalar = ctx.resolveScalarKind(field.typeExpr);
        if (!scalar) {
          ctx.diag(ctx.diagnostics, decl.span.file, `Unsupported record field type "${field.name}" in initializer for "${decl.name}" (expected byte/word/addr).`);
          recordInitFailed = true;
          continue;
        }
        const value = ctx.evalImmExpr(fieldValueExpr, ctx.env, ctx.diagnostics);
        if (value === undefined) {
          ctx.diag(ctx.diagnostics, decl.span.file, `Failed to evaluate data initializer for "${decl.name}".`);
          recordInitFailed = true;
          continue;
        }
        encodedFields.push({ width: scalar === 'byte' ? 1 : 2, value });
      }
      if (recordInitFailed) continue;

      let emitted = 0;
      const copyStart = target.offsetRef.current;
      for (const encoded of encodedFields) {
        if (encoded.width === 1) {
          emitByte(encoded.value);
          emitted += 1;
        } else {
          emitWord(encoded.value);
          emitted += 2;
        }
      }
      const storageBytes = sizeOfTypeExpr(type, ctx.env, ctx.diagnostics);
      if (storageBytes === undefined) continue;
      recordStartupInit('copy', copyStart, emitted);
      const zeroStart = target.offsetRef.current;
      for (let pad = emitted; pad < storageBytes; pad++) emitByte(0);
      recordStartupInit('zero', zeroStart, storageBytes - emitted);
      continue;
    }

    if (init.kind === 'InitRecordNamed') {
      ctx.diag(ctx.diagnostics, decl.span.file, `Named-field aggregate initializer requires a record type for "${decl.name}".`);
      continue;
    }

    if (init.kind === 'InitZero') {
      const zeroStart = target.offsetRef.current;
      const storageBytes = sizeOfTypeExpr(type, ctx.env, ctx.diagnostics);
      if (storageBytes === undefined) continue;
      for (let pad = 0; pad < storageBytes; pad++) emitByte(0);
      recordStartupInit('zero', zeroStart, storageBytes);
      continue;
    }

    const elementScalar = type.kind === 'ArrayType' ? ctx.resolveScalarKind(type.element) : ctx.resolveScalarKind(type);
    const elementSize = elementScalar === 'word' || elementScalar === 'addr' ? 2 : elementScalar === 'byte' ? 1 : undefined;
    if (!elementSize) {
      ctx.diag(ctx.diagnostics, decl.span.file, `Unsupported data type for "${decl.name}" (expected byte/word/addr or fixed-length arrays of those).`);
      continue;
    }

    const declaredLength = type.kind === 'ArrayType' ? type.length : 1;
    let actualLength = declaredLength ?? 0;

    if (init.kind === 'InitString') {
      if (elementSize !== 1) {
        ctx.diag(ctx.diagnostics, decl.span.file, `String initializer requires byte element type for "${decl.name}".`);
        continue;
      }
      if (declaredLength !== undefined && init.value.length !== declaredLength) {
        ctx.diag(ctx.diagnostics, decl.span.file, `String length mismatch for "${decl.name}".`);
        continue;
      }
      const copyStart = target.offsetRef.current;
      for (let idx = 0; idx < init.value.length; idx++) emitByte(init.value.charCodeAt(idx));
      actualLength = init.value.length;
      recordStartupInit('copy', copyStart, actualLength);
      continue;
    }

    const values: number[] = [];
    for (const e of init.elements) {
      const v = ctx.evalImmExpr(e, ctx.env, ctx.diagnostics);
      if (v === undefined) {
        ctx.diag(ctx.diagnostics, decl.span.file, `Failed to evaluate data initializer for "${decl.name}".`);
        break;
      }
      values.push(v);
    }

    if (declaredLength !== undefined && values.length !== declaredLength) {
      ctx.diag(ctx.diagnostics, decl.span.file, `Initializer length mismatch for "${decl.name}".`);
      continue;
    }

    const copyStart = target.offsetRef.current;
    for (const v of values) {
      if (elementSize === 1) emitByte(v);
      else emitWord(v);
    }
    actualLength = type.kind === 'ArrayType' ? values.length : 1;
    recordStartupInit('copy', copyStart, actualLength * elementSize);
  }
}
