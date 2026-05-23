/**
 * Severity level for a diagnostic.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A compiler diagnostic (error/warning/info) with an optional source location.
 *
 * Diagnostics use stable `code` values so downstream tooling can rely on them.
 */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  /** Stable diagnostic identifier (e.g. `AZM400` or `AZMN_PARSE`). */
  readonly code: string;
  readonly message: string;
  readonly sourceName?: string;
  /** 1-based line number, when known. */
  readonly line?: number;
  /** 1-based column number, when known. */
  readonly column?: number;
}

/**
 * Known diagnostic IDs for the public tooling surface.
 *
 * Runtime diagnostics may also use AZM Next-specific codes (`AZMN_*`); this
 * catalog preserves stable AZM-branded IDs for semver-sensitive consumers.
 */
export const DiagnosticIds = {
  Unknown: 'AZM000',
  IoReadFailed: 'AZM001',
  InternalParseError: 'AZM002',
  IncludeNotFound: 'AZM003',
  ParseError: 'AZM100',
  EncodeError: 'AZM200',
  EmitError: 'AZM300',
  EmitWarning: 'AZM301',
  OpArityMismatch: 'AZM310',
  OpNoMatchingOverload: 'AZM311',
  OpAmbiguousOverload: 'AZM312',
  OpExpansionCycle: 'AZM313',
  OpInvalidExpansion: 'AZM314',
  SemanticsError: 'AZM400',
  ImmDivideByZero: 'AZM401',
  ImmModuloByZero: 'AZM402',
  TypeError: 'AZM403',
  CaseStyleLint: 'AZM500',
  IndexParenRedundant: 'AZM501',
  RegisterCareConflict: 'AZM600',
  RegisterCareUnknownBoundary: 'AZM601',
} as const;

export type DiagnosticId = (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
