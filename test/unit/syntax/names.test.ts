import { describe, expect, it } from 'vitest';

import {
  hasLeadingLabel,
  isIdentifier,
  isLabelName,
  normalizeEntryLabelName,
  parseEntryLabel,
  parseLeadingLabel,
} from '../../../src/syntax/names.js';

describe('syntax name and label primitives', () => {
  it('keeps identifier and label-name classes distinct', () => {
    expect(isIdentifier('Name_1')).toBe(true);
    expect(isIdentifier('Name.Label')).toBe(false);
    expect(isIdentifier('$Name')).toBe(false);

    expect(isLabelName('Name_1')).toBe(true);
    expect(isLabelName('Name.Label')).toBe(true);
    expect(isLabelName('$Name')).toBe(true);
    expect(isLabelName('?temp')).toBe(true);
    expect(isLabelName('1Name')).toBe(false);
  });

  it('parses entry labels and normalizes @ outside the stored symbol name', () => {
    expect(parseEntryLabel('@Start')).toEqual({
      rawLabel: '@Start',
      name: 'Start',
      isEntry: true,
    });
    expect(parseEntryLabel('Loop')).toEqual({
      rawLabel: 'Loop',
      name: 'Loop',
      isEntry: false,
    });
    expect(parseEntryLabel('@1Bad')).toBeUndefined();
    expect(normalizeEntryLabelName('@Public')).toBe('Public');
    expect(normalizeEntryLabelName('Private')).toBe('Private');
  });

  it('parses leading labels while preserving statement text and columns', () => {
    expect(hasLeadingLabel('@Start: ld a,1')).toBe(true);
    expect(hasLeadingLabel('ld a,1')).toBe(false);

    expect(parseLeadingLabel('@Start:   ld a,1', 5)).toEqual({
      rawLabel: '@Start',
      name: 'Start',
      isEntry: true,
      labelColumn: 5,
      statementText: 'ld a,1',
      statementColumn: 15,
    });
    expect(parseLeadingLabel('Loop:', 1)).toEqual({
      rawLabel: 'Loop',
      name: 'Loop',
      isEntry: false,
      labelColumn: 1,
      statementText: '',
      statementColumn: 6,
    });
  });
});
