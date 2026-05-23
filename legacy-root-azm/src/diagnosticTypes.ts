/**
 * Severity level for a diagnostic.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A compiler diagnostic (error/warning/info) with an optional source location.
 *
 * Diagnostics must have stable IDs so downstream tooling can rely on them.
 */
export interface Diagnostic {
  /** Stable diagnostic identifier (e.g., `AZM001`). */
  id: DiagnosticId;
  severity: DiagnosticSeverity;
  message: string;
  file: string;
  /** 1-based line number, when known. */
  line?: number;
  /** 1-based column number, when known. */
  column?: number;
}

/**
 * Known diagnostic IDs.
 *
 * PR0 started with a minimal set; later PRs should extend this via contract changes.
 */
export const DiagnosticIds = {
  /**
   * Unknown/unclassified diagnostic.
   *
   * Use a more specific ID when possible; this remains for forward compatibility.
   */
  Unknown: 'AZM000',

  /** Failed to read a source file from disk. */
  IoReadFailed: 'AZM001',

  /** Internal error during parsing (unexpected exception). */
  InternalParseError: 'AZM002',

  /** Include could not be resolved on any search path. */
  IncludeNotFound: 'AZM003',

  /** Generic parse error (syntax / unsupported in current PR subset). */
  ParseError: 'AZM100',

  /** Generic instruction encoding error (unsupported mnemonic/operands, out-of-range imm, etc.). */
  EncodeError: 'AZM200',

  /** Generic emission/lowering error (layout/packing/symbol collisions, etc.). */
  EmitError: 'AZM300',
  /** Generic emission/lowering warning. */
  EmitWarning: 'AZM301',

  /** Op invocation arity mismatch against available overload set. */
  OpArityMismatch: 'AZM310',

  /** No overload match for an op invocation with the provided operands. */
  OpNoMatchingOverload: 'AZM311',

  /** Ambiguous overload resolution for an op invocation. */
  OpAmbiguousOverload: 'AZM312',

  /** Cyclic op expansion detected in inline expansion graph. */
  OpExpansionCycle: 'AZM313',

  /** Op expansion produced an invalid concrete instruction after substitution. */
  OpInvalidExpansion: 'AZM314',

  /** Generic semantic evaluation error (env building, imm evaluation, etc.). */
  SemanticsError: 'AZM400',

  /** Divide by zero in an imm expression. */
  ImmDivideByZero: 'AZM401',

  /** Modulo by zero in an imm expression. */
  ImmModuloByZero: 'AZM402',

  /** Type/layout error (unknown type, recursion, missing array length, etc.). */
  TypeError: 'AZM403',

  /** Case-style lint warning for keyword/register casing policy. */
  CaseStyleLint: 'AZM500',

  /** Redundant outer parentheses in a constant-only array index expression. */
  IndexParenRedundant: 'AZM501',

  /** Register-care conflict where a call may destroy a live caller value. */
  RegisterCareConflict: 'AZM600',

  /** Register-care analysis cannot prove an external or indirect call contract. */
  RegisterCareUnknownBoundary: 'AZM601',
} as const;

/**
 * Union type of all defined diagnostic IDs.
 */
export type DiagnosticId = (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
