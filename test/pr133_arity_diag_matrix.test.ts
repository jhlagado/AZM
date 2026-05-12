import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR133_FIXTURE = join(__dirname, 'fixtures', 'pr133_arity_diag_matrix_invalid.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR133: broad arity diagnostics matrix', () => {
  it.each([
    { label: 'add', id: DiagnosticIds.EncodeError, message: 'add expects two operands' },
    { label: 'ld', id: DiagnosticIds.EncodeError, message: 'ld expects two operands' },
    { label: 'inc', id: DiagnosticIds.EncodeError, message: 'inc expects one operand' },
    { label: 'dec', id: DiagnosticIds.EncodeError, message: 'dec expects one operand' },
    { label: 'push', id: DiagnosticIds.EncodeError, message: 'push expects one operand' },
    { label: 'pop', id: DiagnosticIds.EncodeError, message: 'pop expects one operand' },
    { label: 'ex', id: DiagnosticIds.EncodeError, message: 'ex expects two operands' },
    { label: 'bit', id: DiagnosticIds.EncodeError, message: 'bit expects two operands' },
    {
      label: 'res',
      id: DiagnosticIds.EncodeError,
      message: 'res expects two operands, or three with indexed source + reg8 destination',
    },
    {
      label: 'set',
      id: DiagnosticIds.EncodeError,
      message: 'set expects two operands, or three with indexed source + reg8 destination',
    },
    {
      label: 'rl',
      id: DiagnosticIds.EncodeError,
      message: 'rl expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'rr',
      id: DiagnosticIds.EncodeError,
      message: 'rr expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'sla',
      id: DiagnosticIds.EncodeError,
      message: 'sla expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'sra',
      id: DiagnosticIds.EncodeError,
      message: 'sra expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'srl',
      id: DiagnosticIds.EncodeError,
      message: 'srl expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'sll',
      id: DiagnosticIds.EncodeError,
      message: 'sll expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'rlc',
      id: DiagnosticIds.EncodeError,
      message: 'rlc expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'rrc',
      id: DiagnosticIds.EncodeError,
      message: 'rrc expects one operand, or two with indexed source + reg8 destination',
    },
  ] satisfies Row[])('$label — explicit arity diagnostics for unsupported instruction counts', async (row) => {
    const res = await compile(PR133_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });
});
