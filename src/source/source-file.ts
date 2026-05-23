export interface SourceFile {
  readonly name: string;
  readonly text: string;
}

export function createSourceFile(name: string, text: string): SourceFile {
  return { name, text };
}
