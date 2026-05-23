export type UnsupportedFixture = {
  file: string;
  reason: string;
  bucket: 'diagnostic-wording' | 'hex-bin-layout' | 'visible-op-diagnostic';
};

export const KNOWN_UNSUPPORTED_FIXTURES: UnsupportedFixture[] = [];

export const KNOWN_UNSUPPORTED_FIXTURE_FILES = new Set(
  KNOWN_UNSUPPORTED_FIXTURES.map((entry) => entry.file),
);
