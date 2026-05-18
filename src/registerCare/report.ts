import type { RegisterCareReportModel, RegisterCareUnit, RoutineSummary } from './types.js';

function list(units: RegisterCareUnit[]): string {
  return units.length === 0 ? '-' : units.join(',');
}

export const FLAG_UNITS = new Set<RegisterCareUnit>([
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
]);

const AZMDOC_PAIRS: Array<{
  label: string;
  hi: RegisterCareUnit;
  lo: RegisterCareUnit;
}> = [
  { label: 'BC', hi: 'B', lo: 'C' },
  { label: 'DE', hi: 'D', lo: 'E' },
  { label: 'HL', hi: 'H', lo: 'L' },
  { label: 'IX', hi: 'IXH', lo: 'IXL' },
  { label: 'IY', hi: 'IYH', lo: 'IYL' },
  { label: 'SP', hi: 'SPH', lo: 'SPL' },
];

export function azmDocList(units: RegisterCareUnit[]): string {
  const unique = [...new Set(units)];
  const unitSet = new Set(unique);
  const emitted = new Set<RegisterCareUnit>();
  const parts: string[] = [];

  for (const unit of unique) {
    if (emitted.has(unit)) continue;
    const pair = AZMDOC_PAIRS.find(
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

type ContractEntry = {
  keyword: 'in' | 'out' | 'maybe-out' | 'clobbers';
  carriers: string;
};

function relationOutputUnits(relations: RoutineSummary['valueRelations']): RegisterCareUnit[] {
  return relations.flatMap((rel) => rel.out);
}

function contractEntries(summary: RoutineSummary): ContractEntry[] {
  const out: ContractEntry[] = [];
  if (summary.mayRead.length > 0)
    out.push({ keyword: 'in', carriers: azmDocList(summary.mayRead) });
  const outputUnits = relationOutputUnits(summary.valueRelations);
  if (outputUnits.length > 0) out.push({ keyword: 'out', carriers: azmDocList(outputUnits) });
  const relationOut = relationOutUnits(summary);
  const clobbers = summary.mayWrite.filter(
    (unit) => !relationOut.has(unit) && !FLAG_UNITS.has(unit),
  );
  if (clobbers.length > 0) out.push({ keyword: 'clobbers', carriers: azmDocList(clobbers) });
  return out;
}

function sourceContractEntries(summary: RoutineSummary): ContractEntry[] {
  const out: ContractEntry[] = [];
  if (summary.mayRead.length > 0)
    out.push({ keyword: 'in', carriers: azmDocList(summary.mayRead) });
  const relationOut = relationOutUnits(summary);
  const candidates = (summary.outputCandidates ?? []).filter((unit) => !relationOut.has(unit));
  if (candidates.length > 0) out.push({ keyword: 'maybe-out', carriers: azmDocList(candidates) });
  const outputUnits = relationOutputUnits(summary.valueRelations);
  if (outputUnits.length > 0) out.push({ keyword: 'out', carriers: azmDocList(outputUnits) });
  const clobbers = summary.mayWrite.filter(
    (unit) => !relationOut.has(unit) && !FLAG_UNITS.has(unit),
  );
  if (clobbers.length > 0) out.push({ keyword: 'clobbers', carriers: azmDocList(clobbers) });
  return out;
}

function stackStatus(summary: RoutineSummary): string {
  const balance = summary.stackBalanced ? 'balanced' : 'unbalanced';
  return summary.hasUnknownStackEffect ? `${balance}, unknown effect` : balance;
}

function relationOutUnits(summary: RoutineSummary): Set<RegisterCareUnit> {
  return new Set(summary.valueRelations.flatMap((rel) => rel.out));
}

export function renderRegisterCareReport(model: RegisterCareReportModel): string {
  const lines = ['AZM Register-Care Report', `Entry: ${model.entryFile}`, `Mode: ${model.mode}`];
  if (model.profile) lines.push(`Profile: ${model.profile}`);
  lines.push('');

  if (model.summaries.length === 0) {
    lines.push('Routines: none', '');
  } else {
    for (const summary of model.summaries) {
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
  }

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

  lines.push('Unknown calls:');
  if (model.unknownCalls.length === 0) {
    lines.push('  none');
  } else {
    for (const call of model.unknownCalls) lines.push(`  ${call}`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export function renderRegisterCareInterface(summaries: RoutineSummary[]): string {
  const lines = [
    '; AZM register-care interface',
    '; Generated from inferred routine summaries.',
    '',
  ];

  for (const summary of summaries) {
    lines.push(`extern ${summary.name}`);
    for (const entry of contractEntries(summary)) {
      lines.push(`${entry.keyword.padEnd(10)}${entry.carriers}`);
    }
    lines.push('end', '');
  }

  return `${lines.join('\n')}\n`;
}

export const REGISTER_CARE_SOURCE_BLOCK_DIVIDER = '; ========================== AZM';

export function renderRegisterCareSourceBlock(summary: RoutineSummary): string[] {
  const lines = [REGISTER_CARE_SOURCE_BLOCK_DIVIDER];
  for (const entry of sourceContractEntries(summary)) {
    lines.push(`; ${entry.keyword.padEnd(10)}${entry.carriers}`);
  }
  lines.push(REGISTER_CARE_SOURCE_BLOCK_DIVIDER);
  return lines;
}
