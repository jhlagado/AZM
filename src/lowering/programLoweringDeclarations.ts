import type { Context } from './programLowering.js';
import {
  createAsmRawDataLowerer,
  type RawDataLike,
} from './asmRawDataLowering.js';

export function createProgramLoweringDeclarationHelpers(ctx: Context): {
  lowerAsmRawDataDirective: (decl: RawDataLike) => void;
} {
  const lowerAsmRawDataDirective = createAsmRawDataLowerer(ctx);

  return { lowerAsmRawDataDirective };
}
