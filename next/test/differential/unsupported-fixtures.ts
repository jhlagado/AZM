export type UnsupportedFixture = {
  file: string;
  reason: string;
};

export const KNOWN_UNSUPPORTED_FIXTURES: UnsupportedFixture[] = [
  {
    file: 'enum_and_storage.asm',
    reason:
      'Hex output differs from current AZM by emitting a padded absolute block at address 0000 while bin bytes are otherwise equal.',
  },
];

export const KNOWN_UNSUPPORTED_FIXTURE_FILES = new Set(
  KNOWN_UNSUPPORTED_FIXTURES.map((entry) => entry.file),
);
