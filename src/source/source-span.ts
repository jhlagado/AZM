export interface SourceSpan {
  readonly sourceName: string;
  readonly line: number;
  readonly column: number;
  readonly sourceUnit?: string;
  readonly sourceRelation?: 'entry' | 'include' | 'import';
}
