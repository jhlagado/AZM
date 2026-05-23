import { describe, expect, it } from 'vitest';

import { parseAcceptedOutputCandidates } from '../../../src/register-care/accept-output.js';

describe('register-care accept-output parsing', () => {
  it('parses valid routine carrier mapping', () => {
    expect(parseAcceptedOutputCandidates(['MASK:A,carry,IX'])).toEqual(
      new Map([['MASK', ['A', 'carry', 'IXH', 'IXL']]]),
    );
  });

  it('rejects malformed mapping entries', () => {
    expect(() => parseAcceptedOutputCandidates(['MASK:A,'])).toThrow(
      'Invalid --accept-out value "MASK:A," (missing carriers)',
    );
    expect(() => parseAcceptedOutputCandidates(['MASK'])).toThrow(
      'Invalid --accept-out value "MASK" (expected ROUTINE:carriers)',
    );
    expect(() => parseAcceptedOutputCandidates([':A'])).toThrow(
      'Invalid --accept-out value ":A" (expected ROUTINE:carriers)',
    );
    expect(() => parseAcceptedOutputCandidates(['MASK:Q'])).toThrow(
      'Invalid --accept-out value "MASK:Q" (unknown carrier)',
    );
  });

  it('deduplicates repeated units per routine', () => {
    expect(parseAcceptedOutputCandidates(['MASK:A', 'MASK:A', 'MASK:carry', 'OTHER:HL'])).toEqual(
      new Map([
        ['MASK', ['A', 'carry']],
        ['OTHER', ['H', 'L']],
      ]),
    );
  });
});
