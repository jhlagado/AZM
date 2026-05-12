export const GENERATED_START_MARKER: string;
export const GENERATED_END_MARKER: string;
export function renderGeneratedGrammarAtomSection(): Promise<string>;
export function syncGrammarAtomsDoc(docText: string): Promise<string>;
export function regenerateGrammarAtomsDoc(
  grammarDocPath?: string,
): Promise<{ updated: string; changed: boolean }>;
