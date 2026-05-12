import type { EaExprNode, SourceSpan } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { ValueMaterializationContext } from './valueMaterializationContext.js';
import {
  createExactSizeIndexScaling,
  tryPushRegIndexedArrayAddressWhenUnresolvedEa,
} from './valueMaterializationIndexing.js';
import { createRuntimeAddressBaseMaterialization } from './valueMaterializationBase.js';
import { createRuntimeComposedEaMaterialization } from './valueMaterializationRuntimeEa.js';
import { createHlWordTransport } from './valueMaterializationTransport.js';

export function createValueMaterializationHelpers(ctx: ValueMaterializationContext) {
  const { emitExactScaleInHl } = createExactSizeIndexScaling(ctx);
  const { emitLoadWordFromHlAddress, emitStoreWordToHlAddress } = createHlWordTransport(ctx);
  const {
    fieldOffsetInBaseType,
    materializeResolvedAddressToHL,
    materializeRuntimeAddressBaseToHL,
  } = createRuntimeAddressBaseMaterialization(ctx);

  let pushEaAddress: (ea: EaExprNode, span: SourceSpan) => boolean;

  const emitStoreSavedHlToEa = (ea: EaExprNode, span: SourceSpan): boolean => {
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (!pushEaAddress(ea, span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!emitStoreWordToHlAddress('DE', span)) return false;
    return ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span);
  };

  function pushMemValue(ea: EaExprNode, want: 'byte' | 'word', span: SourceSpan): boolean {
    if (want === 'word') {
      const r = ctx.resolveEa(ea, span);
      if (ctx.emitScalarWordLoad('HL', r, span)) {
        return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
      }
      if (r?.kind === 'abs') {
        ctx.emitAbs16Fixup(0x2a, r.baseLower, r.addend, span);
        return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
      }
      const pipe = ctx.buildEaWordPipeline(ea, span);
      if (pipe) {
        if (!ctx.emitStepPipeline(ctx.TEMPLATE_LW_DE(pipe), span)) return false;
        return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span);
      }
      if (!pushEaAddress(ea, span)) return false;
      if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
      ctx.emitRawCodeBytes(
        Uint8Array.of(0x5e, 0x23, 0x56, 0xeb),
        span.file,
        'ld e, (hl) ; inc hl ; ld d, (hl) ; ex de, hl',
      );
      return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
    }

    const r = ctx.resolveEa(ea, span);
    if (r?.kind === 'abs') {
      ctx.emitAbs16Fixup(0x3a, r.baseLower, r.addend, span);
      return ctx.pushZeroExtendedReg8('A', span);
    }
    if (r?.kind === 'stack' && r.ixDisp >= -128 && r.ixDisp <= 127) {
      const d = r.ixDisp & 0xff;
      ctx.emitRawCodeBytes(
        Uint8Array.of(0xdd, 0x5e, d),
        span.file,
        `ld e, (ix${ctx.formatIxDisp(r.ixDisp)})`,
      );
      return ctx.pushZeroExtendedReg8('E', span);
    }

    const eaPipe = ctx.buildEaBytePipeline(ea, span);
    if (eaPipe) {
      const templated = ctx.TEMPLATE_L_ABC('A', eaPipe);
      return ctx.emitStepPipeline(templated, span) && ctx.pushZeroExtendedReg8('A', span);
    }

    if (!pushEaAddress(ea, span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (
      !ctx.emitInstr(
        'ld',
        [{ kind: 'Reg', span, name: 'A' }, { kind: 'Mem', span, expr: { kind: 'EaName', span, name: 'HL' } }],
        span,
      )
    ) {
      return false;
    }
    return ctx.pushZeroExtendedReg8('A', span);
  }

  const { pushUnresolvedComposedEaAddress } = createRuntimeComposedEaMaterialization(ctx, {
    pushEaAddress: (ea, span) => pushEaAddress(ea, span),
    pushMemValue,
    emitExactScaleInHl,
    fieldOffsetInBaseType,
    materializeRuntimeAddressBaseToHL,
    materializeResolvedAddressToHL,
  });

  const pushResolvedEaAddress = (r: EaResolution, span: SourceSpan): boolean => {
    if (!materializeResolvedAddressToHL(r, span)) return false;
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  pushEaAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    const regIndexedFast = tryPushRegIndexedArrayAddressWhenUnresolvedEa(ctx, ea, span, emitExactScaleInHl);
    if (regIndexedFast !== null) return regIndexedFast;

    const r = ctx.resolveEa(ea, span);
    if (!r) return pushUnresolvedComposedEaAddress(ea, span);

    return pushResolvedEaAddress(r, span);
  };

  return {
    emitLoadWordFromHlAddress,
    emitStoreSavedHlToEa,
    emitStoreWordToHlAddress,
    pushEaAddress,
    pushMemValue,
  };
}
