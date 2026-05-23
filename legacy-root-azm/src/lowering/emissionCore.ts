type EmissionCoreContext = {
  /** Current code emission offset. */
  getCodeOffset: () => number;
  /** Sets absolute code offset cursor. */
  setCodeOffset: (value: number) => void;
  /** Writes one byte into the code map. */
  setCodeByte: (offset: number, value: number) => void;
  /** Extends source range map for listings. */
  recordCodeSourceRange: (start: number, end: number) => void;
  /** Optional trace hook for emitted bytes. */
  traceInstruction: (start: number, bytes: Uint8Array, traceText: string) => void;
};

export function createEmissionCoreHelpers(ctx: EmissionCoreContext) {
  const emitCodeBytes = (bs: Uint8Array, _file: string): number => {
    const start = ctx.getCodeOffset();
    let codeOffset = start;
    for (const b of bs) {
      ctx.setCodeByte(codeOffset, b);
      codeOffset++;
    }
    ctx.setCodeOffset(codeOffset);
    ctx.recordCodeSourceRange(start, codeOffset);
    return start;
  };

  const emitRawCodeBytes = (bs: Uint8Array, _file: string, traceText: string): void => {
    const start = emitCodeBytes(bs, _file);
    ctx.traceInstruction(start, bs, traceText);
  };

  return {
    emitCodeBytes,
    emitRawCodeBytes,
  };
}
