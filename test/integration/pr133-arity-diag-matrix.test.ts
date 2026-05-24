import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const PR133_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr133_arity_diag_matrix_invalid.asm', import.meta.url),
);

type Row = { label: string; message: string };

describe('PR133: broad arity diagnostics matrix parity', () => {
  it.each([
    { label: 'add', message: 'add expects two operands' },
    { label: 'ld', message: 'ld expects two operands' },
    { label: 'inc', message: 'inc expects one operand' },
    { label: 'dec', message: 'dec expects one operand' },
    { label: 'push', message: 'push expects one operand' },
    { label: 'pop', message: 'pop expects one operand' },
    { label: 'ex', message: 'ex expects two operands' },
    { label: 'bit', message: 'bit expects two operands' },
    {
      label: 'res',
      message:
        'res expects two operands, or three with indexed source + reg8 destination',
    },
    {
      label: 'set',
      message:
        'set expects two operands, or three with indexed source + reg8 destination',
    },
    {
      label: 'rl',
      message: 'rl expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'rr',
      message: 'rr expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'sla',
      message: 'sla expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'sra',
      message: 'sra expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'srl',
      message: 'srl expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'sll',
      message: 'sll expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'rlc',
      message: 'rlc expects one operand, or two with indexed source + reg8 destination',
    },
    {
      label: 'rrc',
      message: 'rrc expects one operand, or two with indexed source + reg8 destination',
    },
  ] satisfies Row[])(
    '$label — explicit arity diagnostics for unsupported instruction counts',
    async (row) => {
      const res = await compile(PR133_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );
});
