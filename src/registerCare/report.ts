import type { RegisterCareReportModel, RegisterCareUnit, RoutineSummary } from './types.js';

function list(units: RegisterCareUnit[]): string {
  return units.length === 0 ? '-' : units.join(',');
}

function stackStatus(summary: RoutineSummary): string {
  const balance = summary.stackBalanced ? 'balanced' : 'unbalanced';
  return summary.hasUnknownStackEffect ? `${balance}, unknown effect` : balance;
}

function relationOutUnits(summary: RoutineSummary): Set<RegisterCareUnit> {
  return new Set(summary.valueRelations.flatMap((rel) => rel.out));
}

export function renderRegisterCareReport(model: RegisterCareReportModel): string {
  const lines = [
    'AZM Register-Care Report',
    `Entry: ${model.entryFile}`,
    `Mode: ${model.mode}`,
  ];
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
    lines.push(`;! @proc       ${summary.name}`);
    if (summary.mayRead.length > 0) lines.push(`;! @in         {${list(summary.mayRead)}}`);
    for (const rel of summary.valueRelations) {
      lines.push(`;! @out        {${list(rel.out)}}`);
    }
    const relationOut = relationOutUnits(summary);
    const clobbers = summary.mayWrite.filter((unit) => !relationOut.has(unit));
    if (clobbers.length > 0) lines.push(`;! @clobbers   {${list(clobbers)}}`);
    if (summary.preserved.length > 0) {
      lines.push(`;! @preserves  {${list(summary.preserved)}}`);
    }
    lines.push(';! @end', '');
  }

  return `${lines.join('\n')}\n`;
}
