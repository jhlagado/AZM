export interface ChangeClassification {
  docsOnly: boolean;
  runFull: boolean;
  docsPaths: string[];
  nonDocPaths: string[];
}

export function isDocsOnlyPath(path: string): boolean;
export function classifyChangedPaths(paths: string[]): ChangeClassification;
