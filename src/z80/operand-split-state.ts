export interface OperandSplitState {
  depth: number;
  quote: string | undefined;
  escaped: boolean;
  start: number;
}

export function createOperandSplitState(): OperandSplitState {
  return { depth: 0, quote: undefined, escaped: false, start: 0 };
}

export function scanInstructionOperandSeparator(
  text: string,
  index: number,
  state: OperandSplitState,
): boolean {
  const char = text[index];
  if (consumeEscapedOperandChar(state)) return false;
  if (beginOperandEscape(char, state)) return false;
  if (toggleOperandQuote(text, index, char, state)) return false;
  if (state.quote) return false;
  updateOperandParenDepth(char, state);
  return char === ',' && state.depth === 0;
}

function consumeEscapedOperandChar(state: OperandSplitState): boolean {
  if (!state.escaped) return false;
  state.escaped = false;
  return true;
}

function beginOperandEscape(char: string | undefined, state: OperandSplitState): boolean {
  if (char !== '\\' || !state.quote) return false;
  state.escaped = true;
  return true;
}

function toggleOperandQuote(
  text: string,
  index: number,
  char: string | undefined,
  state: OperandSplitState,
): boolean {
  if (!isOperandQuoteStart(text, index, char, state.quote)) return false;
  state.quote = state.quote === char ? undefined : (state.quote ?? char);
  return true;
}

function isOperandQuoteStart(
  text: string,
  index: number,
  char: string | undefined,
  quote: string | undefined,
): char is '"' | "'" {
  return (
    (char === '"' || char === "'") &&
    !(char === "'" && quote === undefined && /[A-Za-z0-9_]/.test(text[index - 1] ?? ''))
  );
}

function updateOperandParenDepth(char: string | undefined, state: OperandSplitState): void {
  if (char === '(') {
    state.depth += 1;
  } else if (char === ')') {
    state.depth -= 1;
  }
}
