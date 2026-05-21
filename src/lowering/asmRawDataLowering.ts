import type { ImmExprNode, SourceSpan } from '../frontend/ast.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import type { Context } from './programLowering.js';
import {
  containsCurrentLocation,
  evalAsmImmAtCurrent,
  placementAddressAtOffset,
  publishAsmAddressConst,
} from './asmDirectiveTraversal.js';

type RawValueLike =
  | ImmExprNode
  | string
  | {
      kind: string;
      value?: unknown;
    };

export type RawDataLike = {
  span: SourceSpan;
  name?: string;
  directive: 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr';
  values?: RawValueLike[];
  size?: ImmExprNode;
  fill?: ImmExprNode;
};

function rawStringValue(value: RawValueLike): string | undefined {
  if (typeof value === 'string') return value;
  if (!('kind' in value)) return undefined;
  if (value.kind === 'AsmString') {
    return typeof value.value === 'string' ? value.value : undefined;
  }
  return undefined;
}

function rawImmValue(value: RawValueLike): ImmExprNode | undefined {
  if (typeof value === 'string') return undefined;
  if (!('kind' in value)) return undefined;
  return value.kind.startsWith('Imm') ? (value as ImmExprNode) : undefined;
}

function evalRawDataSize(ctx: Context, size: ImmExprNode): number | undefined {
  if (size.kind === 'ImmName') {
    const constValue = ctx.env.equates.get(size.name) ?? ctx.env.equates.get(size.name.toLowerCase());
    const enumValue = ctx.env.enums.get(size.name);
    if (constValue === undefined && enumValue === undefined) {
      const typeExpr = { kind: 'TypeName' as const, span: size.span, name: size.name };
      const typeSize = sizeOfTypeExpr(typeExpr, ctx.env, undefined);
      if (typeSize !== undefined) return typeSize;
    }
  }
  return ctx.evalImmExpr(size, ctx.env, ctx.diagnostics);
}

export function createAsmRawDataLowerer(ctx: Context): (decl: RawDataLike) => void {
  return (decl: RawDataLike): void => {
    const activePlacement = ctx.activePlacementRef.current;
    const name = decl.name ?? '';
    if (name.length > 0) {
      const lower = name.toLowerCase();
      if (ctx.taken.has(lower)) {
        const alreadyPending = ctx.pending.some((symbol) => symbol.name.toLowerCase() === lower);
        if (!alreadyPending) ctx.diag(ctx.diagnostics, decl.span.file, `Duplicate symbol name "${name}".`);
      } else {
        ctx.taken.add(lower);
        const offset = activePlacement === 'code' ? ctx.codeOffsetRef.current : ctx.dataOffsetRef.current;
        const address = placementAddressAtOffset(ctx, activePlacement, offset);
        if (address !== undefined) publishAsmAddressConst(ctx, name, address);
        const pending = {
          kind: 'label' as const,
          name,
          placement: activePlacement,
          offset,
          file: decl.span.file,
          line: decl.span.start.line,
          scope: 'global' as const,
        };
        ctx.pending.push(pending);
        ctx.recordLoweredAsmItem({ kind: 'label', name }, decl.span);
      }
    }

    const writeByte = (value: number): void => {
      if (activePlacement === 'code') {
        const offset = ctx.codeOffsetRef.current;
        ctx.codeBytes.set(offset, value & 0xff);
        ctx.codeOffsetRef.current = offset + 1;
      } else {
        const offset = ctx.dataOffsetRef.current;
        ctx.dataBytes.set(offset, value & 0xff);
        ctx.dataOffsetRef.current = offset + 1;
      }
    };

    const writeWord = (value: number): void => {
      writeByte(value & 0xff);
      writeByte((value >> 8) & 0xff);
    };

    const currentAddress = (): number | undefined => {
      const offset = activePlacement === 'code' ? ctx.codeOffsetRef.current : ctx.dataOffsetRef.current;
      return placementAddressAtOffset(ctx, activePlacement, offset);
    };

    if (decl.directive === 'ds') {
      if (!decl.size) {
        ctx.diag(ctx.diagnostics, decl.span.file, `Raw data size is missing for "${name}".`);
        return;
      }
      const size = evalRawDataSize(ctx, decl.size);
      if (size === undefined || size < 0) {
        ctx.diag(
          ctx.diagnostics,
          decl.span.file,
          `Failed to evaluate raw data size for "${name}".`,
        );
        return;
      }
      const fill = decl.fill ? ctx.evalImmExpr(decl.fill, ctx.env, ctx.diagnostics) : undefined;
      if (decl.fill && fill === undefined) {
        ctx.diag(ctx.diagnostics, decl.span.file, `Failed to evaluate raw data fill for "${name}".`);
        return;
      }
      ctx.recordLoweredAsmItem(
        {
          kind: 'ds',
          size: { kind: 'literal', value: size },
          ...(decl.fill ? { fill: ctx.lowerImmExprForLoweredAsm(decl.fill) } : {}),
        },
        decl.span,
      );
      if (fill === undefined) {
        if (activePlacement === 'code') {
          ctx.codeOffsetRef.current += size;
        } else {
          ctx.dataOffsetRef.current += size;
        }
        return;
      }
      for (let i = 0; i < size; i++) writeByte(fill);
      return;
    }

    if (decl.directive === 'cstr' || decl.directive === 'pstr' || decl.directive === 'istr') {
      const stringValue = rawStringValue((decl.values ?? [])[0] ?? '');
      if (stringValue === undefined) {
        ctx.diag(ctx.diagnostics, decl.span.file, `"${decl.directive}" expects a string value.`);
        return;
      }
      const bytes = [...stringValue].map((char) => char.codePointAt(0) ?? 0);
      const emittedBytes: number[] = [];
      const writeStringByte = (value: number): void => {
        const byte = value & 0xff;
        writeByte(byte);
        emittedBytes.push(byte);
      };
      if (decl.directive === 'cstr') {
        for (const byte of bytes) writeStringByte(byte);
        writeStringByte(0);
      } else if (decl.directive === 'pstr') {
        writeStringByte(bytes.length);
        for (const byte of bytes) writeStringByte(byte);
      } else if (bytes.length > 0) {
        for (let i = 0; i < bytes.length; i++) {
          const isLast = i === bytes.length - 1;
          writeStringByte(bytes[i]! | (isLast ? 0x80 : 0));
        }
      }
      if (emittedBytes.length > 0) {
        ctx.recordLoweredAsmItem(
          {
            kind: 'db',
            values: emittedBytes.map((value) => ({ kind: 'literal', value })),
          },
          decl.span,
        );
      }
      return;
    }

    const loweredValues: ReturnType<Context['lowerImmExprForLoweredAsm']>[] = [];
    for (const value of decl.values ?? []) {
      const stringValue = rawStringValue(value);
      if (stringValue !== undefined) {
        if (decl.directive !== 'db') {
          ctx.diag(
            ctx.diagnostics,
            decl.span.file,
            `String raw data values are only valid for "db".`,
          );
          continue;
        }
        for (const char of stringValue) {
          const byte = char.codePointAt(0) ?? 0;
          writeByte(byte);
          loweredValues.push({ kind: 'literal', value: byte & 0xff });
        }
        continue;
      }

      const imm = rawImmValue(value);
      if (!imm) {
        ctx.diag(
          ctx.diagnostics,
          decl.span.file,
          `Failed to evaluate raw data value for "${name}".`,
        );
        if (decl.directive === 'db') writeByte(0);
        else writeWord(0);
        continue;
      }

      const usesCurrentLocation = containsCurrentLocation(imm);
      const current = usesCurrentLocation ? currentAddress() : undefined;
      if (usesCurrentLocation && current === undefined) {
        ctx.diag(ctx.diagnostics, decl.span.file, `Failed to evaluate current location.`);
        if (decl.directive === 'db') writeByte(0);
        else writeWord(0);
        continue;
      }
      const evaluated =
        current === undefined
          ? ctx.evalImmExpr(imm, ctx.env, ctx.diagnostics)
          : evalAsmImmAtCurrent(ctx, imm, current);
      loweredValues.push(
        evaluated === undefined ? ctx.lowerImmExprForLoweredAsm(imm) : { kind: 'literal', value: evaluated },
      );
      if (evaluated !== undefined) {
        if (decl.directive === 'db') writeByte(evaluated);
        else writeWord(evaluated);
        continue;
      }

      if (decl.directive === 'db') writeByte(0);
      else writeWord(0);
    }

    ctx.recordLoweredAsmItem(
      decl.directive === 'db'
        ? { kind: 'db', values: loweredValues }
        : { kind: 'dw', values: loweredValues },
      decl.span,
    );
  };
}
