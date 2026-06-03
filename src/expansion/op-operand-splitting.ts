interface OperandSplitState {
  depth: number;
  quote: string | undefined;
  escaped: boolean;
  start: number;
  values: string[];
}

export function splitOperands(text: string): string[] {
  const state: OperandSplitState = {
    depth: 0,
    quote: undefined,
    escaped: false,
    start: 0,
    values: [],
  };
  for (let index = 0; index < text.length; index += 1) {
    advanceOperandSplitState(state, text, index);
  }
  state.values.push(text.slice(state.start).trim());
  return state.values;
}

function advanceOperandSplitState(
  state: OperandSplitState,
  text: string,
  index: number,
): void {
  const char = text[index];
  if (state.escaped) {
    state.escaped = false;
    return;
  }
  if (char === '\\' && state.quote) {
    state.escaped = true;
    return;
  }
  if (char === '"' || char === "'") {
    state.quote = state.quote === char ? undefined : (state.quote ?? char);
    return;
  }
  if (state.quote) return;
  updateOperandSplitDepthOrValue(state, text, index, char);
}

function updateOperandSplitDepthOrValue(
  state: OperandSplitState,
  text: string,
  index: number,
  char: string | undefined,
): void {
  if (char === '(') {
    state.depth += 1;
  } else if (char === ')') {
    state.depth -= 1;
  } else if (char === ',' && state.depth === 0) {
    state.values.push(text.slice(state.start, index).trim());
    state.start = index + 1;
  }
}
