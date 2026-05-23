/** Half-open address range in the Z80 16-bit address space. */
export interface AddressRange {
  /** Inclusive start address. */
  start: number;
  /** Exclusive end address. */
  end: number;
}

/** Address->byte map of emitted machine bytes. */
export interface EmittedByteMap {
  bytes: Map<number, number>;
  writtenRange?: AddressRange;
  sourceSegments?: readonly EmittedSourceSegment[];
}

export interface EmittedSourceSegment {
  start: number;
  end: number;
  file: string;
  line: number;
  column: number;
  kind: D8mSegmentKind;
  confidence: D8mSegmentConfidence;
}

/** Symbol metadata shared by listing and D8 writers. */
export type SymbolEntry =
  | {
      kind: 'label' | 'data';
      name: string;
      address: number;
      file?: string;
      line?: number;
      size?: number;
      scope?: 'global' | 'local';
    }
  | {
      kind: 'constant';
      name: string;
      value: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
    };

/** BIN artifact. */
export interface BinArtifact {
  kind: 'bin';
  path?: string;
  bytes: Uint8Array;
}

/** HEX artifact. */
export interface HexArtifact {
  kind: 'hex';
  path?: string;
  text: string;
}

/** Listing artifact. */
export interface ListingArtifact {
  kind: 'lst';
  path?: string;
  text: string;
}

/** In-memory register-care audit report artifact. */
export interface RegisterCareReportArtifact {
  kind: 'register-care-report';
  path?: string;
  text: string;
}

/** In-memory inferred register-care interface artifact. */
export interface RegisterCareInterfaceArtifact {
  kind: 'register-care-interface';
  path?: string;
  text: string;
}

/** In-memory register-care source annotation artifact. */
export interface RegisterCareAnnotationsArtifact {
  kind: 'register-care-annotations';
  path?: string;
  files: {
    path: string;
    text: string;
  }[];
}

/** Lowered .z80 artifact. */
export interface Asm80Artifact {
  kind: 'asm80';
  path?: string;
  text: string;
}

export interface D8mSymbol {
  name: string;
  kind: 'constant' | 'label' | 'data' | 'unknown';
  value?: number;
  address?: number;
  file?: string;
  line?: number;
  scope?: 'global' | 'local';
  size?: number;
}

export type D8mSegmentKind = 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
export type D8mSegmentConfidence = 'high' | 'medium' | 'low';

export interface D8mSegment {
  start: number;
  end: number;
  lstLine: number;
  line?: number;
  kind: D8mSegmentKind;
  confidence: D8mSegmentConfidence;
}

export interface D8mFileSymbol {
  name: string;
  kind: 'constant' | 'label' | 'data' | 'unknown';
  value?: number;
  address?: number;
  line?: number;
  scope?: 'global' | 'local';
  size?: number;
}

export interface D8mFileEntry {
  symbols?: D8mFileSymbol[];
  segments?: D8mSegment[];
}

export interface D8mGenerator {
  name: 'azm';
  tool: 'azm';
  version?: string;
  inputs?: {
    entry?: string;
    listing?: string;
    hex?: string;
    bin?: string;
  };
  entrySymbol?: string;
  entryAddress?: number;
}

export interface D8mJson {
  format: 'd8-debug-map';
  version: 1;
  arch: 'z80';
  addressWidth: 16;
  endianness: 'little';
  files: Record<string, D8mFileEntry>;
  segments: AddressRange[];
  fileList?: string[];
  symbols: D8mSymbol[];
  generator: D8mGenerator;
}

export interface D8mArtifact {
  kind: 'd8m';
  path?: string;
  json: D8mJson;
}

export interface WriteHexOptions {
  lineEnding?: '\n' | '\r\n';
}

export interface WriteBinOptions {
  binFrom?: number;
  startAddress?: number;
}

export interface WriteListingOptions {
  lineEnding?: '\n' | '\r\n';
  bytesPerLine?: number;
}

export interface WriteD8mOptions {
  rootDir?: string;
  packageVersion?: string;
  inputs?: {
    entry?: string;
    listing?: string;
    hex?: string;
    bin?: string;
  };
  entrySymbol?: string;
  entryAddress?: number;
}

export interface WriteAsm80Options {}

export type Artifact =
  | BinArtifact
  | HexArtifact
  | ListingArtifact
  | D8mArtifact
  | Asm80Artifact
  | RegisterCareReportArtifact
  | RegisterCareInterfaceArtifact
  | RegisterCareAnnotationsArtifact;

/** Writer contract used by the Stage 12 compile API. */
export interface FormatWriters {
  writeHex(
    map: EmittedByteMap,
    symbols: readonly SymbolEntry[],
    opts?: WriteHexOptions,
  ): HexArtifact;
  writeBin(
    map: EmittedByteMap,
    symbols: readonly SymbolEntry[],
    opts?: WriteBinOptions,
  ): BinArtifact;
  writeD8m(
    map: EmittedByteMap,
    symbols: readonly SymbolEntry[],
    opts?: WriteD8mOptions,
  ): D8mArtifact;
  writeListing?(
    map: EmittedByteMap,
    symbols: readonly SymbolEntry[],
    opts?: WriteListingOptions,
  ): ListingArtifact;
  writeAsm80?(sourceText: string, opts?: WriteAsm80Options): Asm80Artifact;
}
