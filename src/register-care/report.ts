import type { RegisterCareReportModel, RegisterCareUnit, RoutineSummary } from './types.js';

function listUnits(units: RegisterCareUnit[]): string {
  return units.length === 0 ? '-' : units.join(',');
}

export function renderRegisterCareReport(model: RegisterCareReportModel): string {
  const lines: string[] = [
    'AZM Register-Care Report',
    `Entry: ${model.entryFile}`,
    `Mode: ${model.mode}`,
    ...(model.profile !== undefined ? [`Profile: ${model.profile}`] : []),
    '',
  ];

  if (model.summaries.length === 0) {
    lines.push('Routines: none', '');
  } else {
    for (const summary of model.summaries) {
      lines.push(`Routine: ${summary.name}`);
      lines.push(`  reads: ${listUnits(summary.mayRead)}`);
      lines.push(`  writes: ${listUnits(summary.mayWrite)}`);
      lines.push(`  preserves: ${listUnits(summary.preserved)}`);
      lines.push('');
    }
  }

  lines.push('Conflicts:');
  if (model.conflicts.length === 0) {
    lines.push('  none');
  } else {
    for (const conflict of model.conflicts) {
      lines.push(
        `  ${conflict.file}:${conflict.line}:${conflict.column}: ${conflict.callTarget}: ${conflict.message}`,
      );
    }
  }
  lines.push('');

  lines.push('Output candidates:');
  if (model.outputCandidates === undefined || model.outputCandidates.length === 0) {
    lines.push('  none');
  } else {
    for (const candidate of model.outputCandidates) {
      lines.push(
        `  ${candidate.file}:${candidate.line}:${candidate.column}: ${candidate.routine}: ${candidate.carriers.join(
          ',',
        )}: ${candidate.message}`,
      );
    }
  }
  lines.push('');

  lines.push('Unknown calls:');
  if (model.unknownCalls.length === 0) {
    lines.push('  none');
  } else {
    for (const call of model.unknownCalls) {
      lines.push(`  ${call}`);
    }
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export function contractCarrierList(units: RegisterCareUnit[]): string {
  return units.length === 0 ? '-' : units.join(',');
}

export function renderRegisterCareInterface(summaries: RoutineSummary[]): string {
  const lines: string[] = [];
  for (const summary of summaries) {
    if (
      summary.mayRead.length === 0 &&
      summary.mayWrite.length === 0 &&
      summary.preserved.length === 0
    ) {
      continue;
    }
    lines.push(`extern ${summary.name}`);
    if (summary.mayRead.length > 0) {
      lines.push(`in ${contractCarrierList(summary.mayRead)}`);
    }
    if (summary.mayWrite.length > 0) {
      lines.push(`clobbers ${contractCarrierList(summary.mayWrite)}`);
    }
    if (summary.preserved.length > 0) {
      lines.push(`preserves ${contractCarrierList(summary.preserved)}`);
    }
    lines.push('end', '');
  }

  if (lines.length === 0) lines.push('No inferred contracts were emitted.', '');
  return `${lines.join('\n')}\n`;
}
