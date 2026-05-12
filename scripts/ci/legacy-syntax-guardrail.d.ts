export type LegacySyntaxViolation = {
  file: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
};

export declare const FORBIDDEN_RULES: ReadonlyArray<{
  id: string;
  pattern: RegExp;
  message: string;
}>;

export declare const DEFAULT_SCAN_ROOTS: ReadonlyArray<string>;
export declare const FIXTURE_ALLOWLIST: ReadonlySet<string>;

export declare function scanForbiddenLegacySyntax(options?: {
  repoRoot?: string;
  roots?: string[];
  filePaths?: string[];
}): {
  violations: LegacySyntaxViolation[];
};
