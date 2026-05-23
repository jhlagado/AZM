type AsmQuoteScanState = {
  inString: boolean;
  inChar: boolean;
  escaped: boolean;
};

export function createAsmQuoteScanState(): AsmQuoteScanState {
  return { inString: false, inChar: false, escaped: false };
}

export function advanceAsmQuoteScan(
  text: string,
  index: number,
  state: AsmQuoteScanState,
  options: {
    singleQuoteStartsCharAt?: (text: string, index: number) => boolean;
  } = {},
): boolean {
  const ch = text[index]!;
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if ((state.inString || state.inChar) && ch === '\\') {
    state.escaped = true;
    return true;
  }
  if (!state.inChar && ch === '"') {
    state.inString = !state.inString;
    return true;
  }
  if (
    !state.inString &&
    ch === "'" &&
    (state.inChar || (options.singleQuoteStartsCharAt?.(text, index) ?? true))
  ) {
    state.inChar = !state.inChar;
    return true;
  }
  return false;
}
