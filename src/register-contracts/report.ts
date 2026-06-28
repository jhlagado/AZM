import type {
  RegisterContractsFinding,
  RegisterContractsJsonFinding,
  RegisterContractsJsonLocation,
  RegisterContractsJsonRemediation,
  RegisterContractsJsonReportModel,
  RegisterContractsReportModel,
  RegisterContractsUnit,
  RoutineSummary,
} from './types.js';

function list(units: RegisterContractsUnit[]): string {
  return units.length === 0 ? '-' : units.join(',');
}

const FLAG_UNITS = new Set<RegisterContractsUnit>(['carry', 'zero', 'sign', 'parity', 'halfCarry']);
const FLAG_UNIT_LIST: RegisterContractsUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

const CONTRACT_CARRIER_PAIRS: Array<{
  label: string;
  hi: RegisterContractsUnit;
  lo: RegisterContractsUnit;
}> = [
  { label: 'BC', hi: 'B', lo: 'C' },
  { label: 'DE', hi: 'D', lo: 'E' },
  { label: 'HL', hi: 'H', lo: 'L' },
  { label: 'IX', hi: 'IXH', lo: 'IXL' },
  { label: 'IY', hi: 'IYH', lo: 'IYL' },
  { label: 'SP', hi: 'SPH', lo: 'SPL' },
];

export function contractCarrierList(units: RegisterContractsUnit[]): string {
  const unique = [...new Set(units)];
  const unitSet = new Set(unique);
  const emitted = new Set<RegisterContractsUnit>();
  const parts: string[] = [];

  for (const unit of unique) {
    if (emitted.has(unit)) continue;
    const pair = CONTRACT_CARRIER_PAIRS.find(
      (candidate) =>
        (candidate.hi === unit || candidate.lo === unit) &&
        unitSet.has(candidate.hi) &&
        unitSet.has(candidate.lo),
    );
    if (pair) {
      parts.push(pair.label);
      emitted.add(pair.hi);
      emitted.add(pair.lo);
      continue;
    }
    parts.push(unit);
    emitted.add(unit);
  }

  return parts.length === 0 ? '-' : parts.join(',');
}

function sourceContractCarrierList(units: RegisterContractsUnit[]): string {
  const unique = [...new Set(units)];
  const hasAllFlags = FLAG_UNIT_LIST.every((unit) => unique.includes(unit));
  const compacted = hasAllFlags
    ? unique.filter((unit) => !FLAG_UNITS.has(unit)).concat('F' as RegisterContractsUnit)
    : unique;
  return contractCarrierList(compacted);
}

type ContractEntry = {
  keyword: 'in' | 'out' | 'maybe-out' | 'clobbers';
  carriers: string;
};

function relationOutputUnits(relations: RoutineSummary['valueRelations']): RegisterContractsUnit[] {
  return relations.flatMap((rel) => rel.out);
}

function contractEntries(summary: RoutineSummary): ContractEntry[] {
  const out: ContractEntry[] = [];
  if (summary.mayRead.length > 0)
    out.push({ keyword: 'in', carriers: contractCarrierList(summary.mayRead) });
  const outputUnits = relationOutputUnits(summary.valueRelations);
  if (outputUnits.length > 0)
    out.push({ keyword: 'out', carriers: contractCarrierList(outputUnits) });
  const relationOut = relationOutUnits(summary);
  const clobbers = summary.mayWrite.filter((unit) => !relationOut.has(unit));
  if (clobbers.length > 0)
    out.push({ keyword: 'clobbers', carriers: contractCarrierList(clobbers) });
  return out;
}

function sourceContractEntries(summary: RoutineSummary): ContractEntry[] {
  const out: ContractEntry[] = [];
  if (summary.mayRead.length > 0)
    out.push({ keyword: 'in', carriers: contractCarrierList(summary.mayRead) });
  const relationOut = relationOutUnits(summary);
  const candidates = (summary.outputCandidates ?? []).filter((unit) => !relationOut.has(unit));
  if (candidates.length > 0)
    out.push({ keyword: 'maybe-out', carriers: contractCarrierList(candidates) });
  const outputUnits = relationOutputUnits(summary.valueRelations);
  if (outputUnits.length > 0)
    out.push({ keyword: 'out', carriers: contractCarrierList(outputUnits) });
  const clobbers = summary.mayWrite.filter((unit) => !relationOut.has(unit));
  if (clobbers.length > 0)
    out.push({ keyword: 'clobbers', carriers: sourceContractCarrierList(clobbers) });
  return out;
}

function stackStatus(summary: RoutineSummary): string {
  const balance = summary.stackBalanced ? 'balanced' : 'unbalanced';
  return summary.hasUnknownStackEffect ? `${balance}, unknown effect` : balance;
}

function relationOutUnits(summary: RoutineSummary): Set<RegisterContractsUnit> {
  return new Set(summary.valueRelations.flatMap((rel) => rel.out));
}

export function renderRegisterContractsReport(model: RegisterContractsReportModel): string {
  const lines = [
    'AZM Register Contracts Report',
    `Entry: ${model.entryFile}`,
    `Mode: ${model.mode}`,
  ];
  if (model.profile) lines.push(`Profile: ${model.profile}`);
  lines.push('');

  appendRoutineSummaries(lines, model);
  appendFindings(lines, model);
  appendConflicts(lines, model);
  appendOutputCandidates(lines, model);
  appendUnknownCalls(lines, model);

  return `${lines.join('\n')}\n`;
}

export function buildRegisterContractsJsonReport(
  model: RegisterContractsReportModel,
): RegisterContractsJsonReportModel {
  return {
    format: 'azm-register-contracts-report',
    version: 1,
    entryFile: model.entryFile,
    mode: model.mode,
    ...(model.profile !== undefined ? { profile: model.profile } : {}),
    summaries: model.summaries,
    findings: (model.findings ?? []).map(jsonFinding),
    unknownCalls: model.unknownCalls,
  };
}

export function renderRegisterContractsJsonReport(
  model: RegisterContractsReportModel,
): { json: RegisterContractsJsonReportModel; text: string } {
  const json = buildRegisterContractsJsonReport(model);
  return { json, text: `${JSON.stringify(json, null, 2)}\n` };
}

function jsonFinding(finding: RegisterContractsFinding): RegisterContractsJsonFinding {
  return {
    kind: finding.kind,
    location: jsonLocation(finding),
    message: finding.message,
    ...('routine' in finding && finding.routine !== undefined ? { routine: finding.routine } : {}),
    ...('callTarget' in finding ? { callTarget: finding.callTarget } : {}),
    ...('subject' in finding ? { subject: finding.subject } : {}),
    ...(finding.carriers !== undefined ? { carriers: finding.carriers } : {}),
    ...('stackBalanced' in finding ? { stackBalanced: finding.stackBalanced } : {}),
    ...('hasUnknownStackEffect' in finding && finding.hasUnknownStackEffect !== undefined
      ? { hasUnknownStackEffect: finding.hasUnknownStackEffect }
      : {}),
    ...('autoFixable' in finding && finding.autoFixable !== undefined
      ? { autoFixable: finding.autoFixable }
      : {}),
    remediation: remediationForFinding(finding),
  };
}

function jsonLocation(finding: RegisterContractsFinding): RegisterContractsJsonLocation {
  return {
    file: finding.file,
    line: finding.line,
    column: finding.column,
    ...(finding.sourceUnit !== undefined ? { sourceUnit: finding.sourceUnit } : {}),
    ...(finding.sourceRelation !== undefined ? { sourceRelation: finding.sourceRelation } : {}),
    ...(finding.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: finding.sourceUnitRelation }
      : {}),
  };
}

function remediationForFinding(
  finding: RegisterContractsFinding,
): RegisterContractsJsonRemediation {
  switch (finding.kind) {
    case 'missing_callee_contract':
      return {
        category: 'add_contract',
        hint: 'Add a routine body or .asmi extern contract for the boundary target.',
      };
    case 'unknown_control_flow':
      return {
        category: 'review_control_flow',
        hint: 'Keep stack-changing paths inside one @ routine boundary or split the flow into explicit routines.',
      };
    case 'output_candidate':
      return {
        category: 'review_output_contract',
        hint:
          finding.autoFixable === true
            ? 'Generated contracts can promote this candidate to an output.'
            : 'Review the caller and callee before marking this carrier as an output.',
      };
    case 'definite_contract_violation':
    case 'flag_lifetime_risk':
      return {
        category: 'fix_call_or_contract',
        hint: 'Fix the caller liveness issue or update the callee contract if the value is an intentional output.',
      };
  }
}

function appendFindings(lines: string[], model: RegisterContractsReportModel): void {
  lines.push('Findings:');
  if (!model.findings || model.findings.length === 0) {
    lines.push('  none');
  } else {
    for (const finding of model.findings) {
      const carriers = finding.carriers ? `: ${list(finding.carriers)}` : '';
      const target = 'callTarget' in finding ? `: ${finding.callTarget}` : '';
      lines.push(
        `  ${finding.file}:${finding.line}:${finding.column}: ${finding.kind}${target}${carriers}: ${finding.message}`,
      );
    }
  }
  lines.push('');
}

function appendRoutineSummaries(lines: string[], model: RegisterContractsReportModel): void {
  if (model.summaries.length === 0) {
    lines.push('Routines: none', '');
    return;
  }

  for (const summary of model.summaries) appendRoutineSummary(lines, summary);
}

function appendRoutineSummary(lines: string[], summary: RoutineSummary): void {
  lines.push(`Routine: ${summary.name}`);
  lines.push(`  reads: ${list(summary.mayRead)}`);
  lines.push(`  writes: ${list(summary.mayWrite)}`);
  lines.push(`  preserves: ${list(summary.preserved)}`);
  lines.push(`  stack: ${stackStatus(summary)}`);
  for (const rel of summary.valueRelations) {
    lines.push(`  relation: ${list(rel.out)} <= ${list(rel.from)}`);
  }
  lines.push('');
}

function appendConflicts(lines: string[], model: RegisterContractsReportModel): void {
  lines.push('Conflicts:');
  if (model.conflicts.length === 0) {
    lines.push('  none');
  } else {
    for (const conflict of model.conflicts) {
      lines.push(
        `  ${conflict.file}:${conflict.line}:${conflict.column}: ${conflict.callTarget}: ${list(
          conflict.carriers,
        )}: ${conflict.message}`,
      );
    }
  }
  lines.push('');
}

function appendOutputCandidates(lines: string[], model: RegisterContractsReportModel): void {
  lines.push('Output candidates:');
  if (!model.outputCandidates || model.outputCandidates.length === 0) {
    lines.push('  none');
  } else {
    for (const candidate of model.outputCandidates) {
      lines.push(
        `  ${candidate.file}:${candidate.line}:${candidate.column}: ${candidate.routine}: ${list(
          candidate.carriers,
        )}: ${candidate.message}`,
      );
    }
  }
  lines.push('');
}

function appendUnknownCalls(lines: string[], model: RegisterContractsReportModel): void {
  lines.push('Unknown calls:');
  if (model.unknownCalls.length === 0) {
    lines.push('  none');
  } else {
    for (const call of model.unknownCalls) lines.push(`  ${call}`);
  }
  lines.push('');
}

export function renderRegisterContractsInterface(summaries: RoutineSummary[]): string {
  const lines: string[] = [];

  for (const summary of summaries) {
    lines.push(`extern ${summary.name}`);
    for (const entry of contractEntries(summary)) {
      lines.push(`${entry.keyword} ${entry.carriers}`);
    }
    lines.push('end', '');
  }

  return `${lines.join('\n')}\n`;
}

export function renderRegisterContractsSourceBlock(summary: RoutineSummary): string[] {
  const entries = sourceContractEntries(summary);
  if (entries.length === 0) return [];
  return [`;! ${entries.map((entry) => `${entry.keyword} ${entry.carriers}`).join('; ')}`];
}
