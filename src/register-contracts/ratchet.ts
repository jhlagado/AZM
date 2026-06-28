import type {
  RegisterContractsJsonFinding,
  RegisterContractsJsonReportModel,
  RegisterContractsRatchetEntry,
  RegisterContractsRatchetResult,
} from './types.js';

function carriersKey(finding: RegisterContractsJsonFinding): string {
  return [...(finding.carriers ?? [])].sort().join(',');
}

export function registerContractsFindingIdentity(
  finding: RegisterContractsJsonFinding,
): string {
  const target = finding.callTarget ?? finding.routine ?? finding.subject ?? '';
  return [
    finding.kind,
    target,
    carriersKey(finding),
  ].join('|');
}

function displayIdentity(finding: RegisterContractsJsonFinding): string {
  return [
    registerContractsFindingIdentity(finding),
    finding.location.file,
    finding.location.line,
    finding.location.column,
  ].join('|');
}

function ratchetEntries(
  findings: readonly RegisterContractsJsonFinding[],
): Map<string, RegisterContractsRatchetEntry[]> {
  const out = new Map<string, RegisterContractsRatchetEntry[]>();
  for (const finding of findings) {
    const identity = registerContractsFindingIdentity(finding);
    const entries = out.get(identity) ?? [];
    entries.push({ identity: displayIdentity(finding), finding });
    out.set(identity, entries);
  }
  return out;
}

function findingFingerprint(finding: RegisterContractsJsonFinding): string {
  return JSON.stringify({
    location: finding.location,
    message: finding.message,
    remediationCategory: finding.remediation.category,
    remediationHint: finding.remediation.hint,
  });
}

export function compareRegisterContractsBaseline(
  current: RegisterContractsJsonReportModel,
  baseline: RegisterContractsJsonReportModel,
  baselineFile: string | undefined,
): RegisterContractsRatchetResult {
  const currentEntries = ratchetEntries(current.findings);
  const baselineEntries = ratchetEntries(baseline.findings);
  const identities = new Set([...currentEntries.keys(), ...baselineEntries.keys()]);
  const newFindings: RegisterContractsRatchetEntry[] = [];
  const removedFindings: RegisterContractsRatchetEntry[] = [];
  const changedFindings: RegisterContractsRatchetResult['changedFindings'] = [];

  for (const identity of identities) {
    const currentGroup = [...(currentEntries.get(identity) ?? [])];
    const baselineGroup = [...(baselineEntries.get(identity) ?? [])];
    const matchedBaseline = new Set<number>();
    const matchedCurrent = new Set<number>();

    for (const [currentIndex, currentEntry] of currentGroup.entries()) {
      const exactIndex = baselineGroup.findIndex(
        (baselineEntry, baselineIndex) =>
          !matchedBaseline.has(baselineIndex) &&
          findingFingerprint(baselineEntry.finding) === findingFingerprint(currentEntry.finding),
      );
      if (exactIndex === -1) continue;
      matchedCurrent.add(currentIndex);
      matchedBaseline.add(exactIndex);
    }

    for (const [currentIndex, currentEntry] of currentGroup.entries()) {
      if (matchedCurrent.has(currentIndex)) continue;
      const changedIndex = baselineGroup.findIndex(
        (_baselineEntry, baselineIndex) => !matchedBaseline.has(baselineIndex),
      );
      if (changedIndex === -1) continue;
      const baselineEntry = baselineGroup[changedIndex]!;
      matchedCurrent.add(currentIndex);
      matchedBaseline.add(changedIndex);
      changedFindings.push({
        identity,
        baseline: baselineEntry.finding,
        current: currentEntry.finding,
      });
    }

    for (const [currentIndex, currentEntry] of currentGroup.entries()) {
      if (!matchedCurrent.has(currentIndex)) newFindings.push(currentEntry);
    }
    for (const [baselineIndex, baselineEntry] of baselineGroup.entries()) {
      if (!matchedBaseline.has(baselineIndex)) removedFindings.push(baselineEntry);
    }
  }
  return {
    ...(baselineFile !== undefined ? { baselineFile } : {}),
    newFindings,
    removedFindings,
    changedFindings,
  };
}
