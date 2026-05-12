import type { ImmExprNode, NamedSectionNode, SourceSpan } from '../frontend/ast.js';
import type { NamedSectionContributionSink } from './sectionContributions.js';
import type { Context } from './programLowering.js';
import type { SectionKind } from './loweringTypes.js';
import {
  containsCurrentLocation,
  evalClassicImmAtCurrent,
  sectionAddressAtOffset,
} from './classicTraversalHelpers.js';

export type NamedSectionTarget = { node: NamedSectionNode; sink: NamedSectionContributionSink };
export type RawValueLike =
  | ImmExprNode
  | string
  | {
      kind: string;
      value?: unknown;
      text?: unknown;
    };

export type RawDataLike = {
  span: SourceSpan;
  name?: string;
  directive: 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr';
  values?: RawValueLike[];
  size?: ImmExprNode;
  fill?: ImmExprNode;
};

type SymbolicTargetResolver = (
  expr: ImmExprNode,
) => { baseLower: string; addend: number } | undefined;

function rawStringValue(value: RawValueLike): string | undefined {
  if (typeof value === 'string') return value;
  if (!('kind' in value)) return undefined;
  if (
    value.kind === 'ClassicString' ||
    value.kind === 'StringLiteral' ||
    value.kind === 'RawString'
  ) {
    return typeof value.value === 'string'
      ? value.value
      : typeof value.text === 'string'
        ? value.text
        : undefined;
  }
  return undefined;
}

function rawImmValue(value: RawValueLike): ImmExprNode | undefined {
  if (typeof value === 'string') return undefined;
  if (!('kind' in value)) return undefined;
  return value.kind.startsWith('Imm') ? (value as ImmExprNode) : undefined;
}

function publishClassicAddressConst(
  ctx: Context,
  name: string,
  activeSection: SectionKind,
  offset: number,
): void {
  const baseExpr = activeSection === 'code' ? ctx.baseExprs.code : ctx.baseExprs.data;
  const base = baseExpr ? ctx.evalImmExpr(baseExpr, ctx.env, ctx.diagnostics) : 0;
  if (base === undefined) return;
  const address = base + offset;
  ctx.env.consts.set(name, address);
  ctx.env.consts.set(name.toLowerCase(), address);
}

export function createClassicRawDataLowerer(
  ctx: Context,
  symbolicTargetFromExpr: SymbolicTargetResolver,
): (decl: RawDataLike, namedSection?: NamedSectionTarget) => void {
  return (decl: RawDataLike, namedSection?: NamedSectionTarget): void => {
    const activeSection = namedSection?.node.section ?? ctx.activeSectionRef.current;
    if (activeSection === 'var') {
      ctx.diag(
        ctx.diagnostics,
        decl.span.file,
        `Raw data declarations cannot target section "var".`,
      );
      return;
    }

    const name = decl.name ?? '';
    if (name.length > 0) {
      const lower = name.toLowerCase();
      if (ctx.taken.has(lower)) {
        const alreadyPending = ctx.pending.some((symbol) => symbol.name.toLowerCase() === lower);
        if (!alreadyPending) ctx.diag(ctx.diagnostics, decl.span.file, `Duplicate symbol name "${name}".`);
      } else {
        ctx.taken.add(lower);
        const offset =
          namedSection?.sink.offset ??
          (activeSection === 'code' ? ctx.codeOffsetRef.current : ctx.dataOffsetRef.current);
        publishClassicAddressConst(ctx, name, activeSection, offset);
        const pending = {
          kind: 'label' as const,
          name,
          section: activeSection,
          offset,
          file: decl.span.file,
          line: decl.span.start.line,
          scope: 'global' as const,
        };
        if (namedSection) namedSection.sink.pendingSymbols.push(pending);
        else ctx.pending.push(pending);
        ctx.recordLoweredAsmItem({ kind: 'label', name }, decl.span);
      }
    }

    const writeByte = (value: number): void => {
      if (namedSection) {
        namedSection.sink.bytes.set(namedSection.sink.offset++, value & 0xff);
        return;
      }
      if (activeSection === 'code') {
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
      const offset =
        namedSection?.sink.offset ??
        (activeSection === 'code' ? ctx.codeOffsetRef.current : ctx.dataOffsetRef.current);
      if (namedSection) return namedSection.sink.anchor.node.anchor ? undefined : offset;
      return sectionAddressAtOffset(ctx, activeSection, offset);
    };

    if (decl.directive === 'ds') {
      if (!decl.size) {
        ctx.diag(ctx.diagnostics, decl.span.file, `Raw data size is missing for "${name}".`);
        return;
      }
      const size = ctx.evalImmExpr(decl.size, ctx.env, ctx.diagnostics);
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
          size: ctx.lowerImmExprForLoweredAsm(decl.size),
          ...(decl.fill ? { fill: ctx.lowerImmExprForLoweredAsm(decl.fill) } : {}),
        },
        decl.span,
      );
      if (fill === undefined) {
        if (namedSection) {
          namedSection.sink.offset += size;
        } else if (activeSection === 'code') {
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
          : evalClassicImmAtCurrent(ctx, imm, current);
      loweredValues.push(
        evaluated === undefined ? ctx.lowerImmExprForLoweredAsm(imm) : { kind: 'literal', value: evaluated },
      );
      if (evaluated !== undefined) {
        if (decl.directive === 'db') writeByte(evaluated);
        else writeWord(evaluated);
        continue;
      }

      const symbolic = symbolicTargetFromExpr(imm);
      if (decl.directive === 'dw' && symbolic && namedSection) {
        namedSection.sink.fixups.push({
          offset: namedSection.sink.offset,
          baseLower: symbolic.baseLower,
          addend: symbolic.addend,
          file: decl.span.file,
        });
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
