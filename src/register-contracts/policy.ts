import type {
  RegisterContractsMode,
  RegisterContractsPolicy,
  RegisterContractsPolicyMode,
} from './types.js';

const POLICY_MODE_PRIORITY: Record<RegisterContractsPolicyMode, number> = {
  strict: 3,
  audit: 2,
  off: 1,
};

interface PolicyMatch {
  mode: RegisterContractsPolicyMode;
  specificity: number;
}

export function registerContractsPolicyModeForFile(
  file: string,
  policy: RegisterContractsPolicy,
  fallbackMode: RegisterContractsMode | undefined,
): RegisterContractsPolicyMode {
  const normalized = normalizePolicyPath(file);
  const matches = [
    ...policyMatchesForMode(normalized, policy.strict, 'strict'),
    ...policyMatchesForMode(normalized, policy.audit, 'audit'),
    ...policyMatchesForMode(normalized, policy.off, 'off'),
  ].sort(comparePolicyMatches);

  return matches[0]?.mode ?? fallbackPolicyMode(fallbackMode);
}

function policyMatchesForMode(
  file: string,
  patterns: readonly string[] | undefined,
  mode: RegisterContractsPolicyMode,
): PolicyMatch[] {
  return (
    patterns
      ?.map((pattern): PolicyMatch | undefined => {
        const normalized = normalizePolicyPath(pattern);
        if (!matchPolicyPattern(file, normalized)) return undefined;
        return { mode, specificity: policyPatternSpecificity(normalized) };
      })
      .filter((match): match is PolicyMatch => match !== undefined) ?? []
  );
}

function comparePolicyMatches(left: PolicyMatch, right: PolicyMatch): number {
  return (
    right.specificity - left.specificity ||
    POLICY_MODE_PRIORITY[right.mode] - POLICY_MODE_PRIORITY[left.mode]
  );
}

function fallbackPolicyMode(
  fallbackMode: RegisterContractsMode | undefined,
): RegisterContractsPolicyMode {
  return fallbackMode === 'strict' || fallbackMode === 'error' || fallbackMode === 'warn'
    ? 'strict'
    : fallbackMode === 'off'
      ? 'off'
      : 'audit';
}

function normalizePolicyPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function policyPatternSpecificity(pattern: string): number {
  return pattern.replace(/\*/g, '').length;
}

function matchPolicyPattern(file: string, pattern: string): boolean {
  if (pattern === file) return true;
  if (!pattern.includes('*')) return false;
  const globStar = '\u0000';
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, globStar)
    .replace(/\*/g, '[^/]*')
    .replaceAll(globStar, '.*');
  return new RegExp(`^${escaped}$`).test(file);
}
