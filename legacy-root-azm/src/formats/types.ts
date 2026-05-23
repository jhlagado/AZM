/**
 * Half-open address range in the Z80 16-bit address space.
 */
export interface AddressRange {
  /** Inclusive start address. */
  start: number;
  /** Exclusive end address. */
  end: number;
}

/**
 * Address->byte map for all emitted machine-code bytes.
 */
export interface EmittedByteMap {
  /**
   * Address -> byte (0..255). Addresses are 0..65535 for Z80.
   */
  bytes: Map<number, number>;
  writtenRange?: AddressRange;
  /**
   * Optional source-attributed code segments emitted by lowering.
   *
   * Addresses are absolute in the final 16-bit address space.
   */
  sourceSegments?: EmittedSourceSegment[];
}

/**
 * Source-attributed emitted range used by debug-map writers.
 */
export interface EmittedSourceSegment {
  start: number;
  end: number;
  file: string;
  line: number;
  column: number;
  kind: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * A symbol entry for debug maps and listings.
 */
export type SymbolEntry =
  | {
      kind: 'constant';
      name: string;
      /**
       * Constant value (not an address).
       *
       * D8M serialization includes this as `value`.
       */
      value: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
    }
  | {
      kind: 'label' | 'data' | 'unknown';
      name: string;
      address: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
      size?: number;
    };

/**
 * Options for Intel HEX writing.
 */
export interface WriteHexOptions {
  /**
   * Line ending to use when emitting text formats.
   */
  lineEnding?: '\n' | '\r\n';
}

/** Options for BIN writing. */
export interface WriteBinOptions {}

/** Options for D8M writing. */
export interface WriteD8mOptions {
  /**
   * Base directory used to normalize file paths in D8M symbol entries.
   * When provided, file paths are made project-relative and use `/` separators.
   */
  rootDir?: string;
  /**
   * AZM package version to record in generator metadata.
   */
  packageVersion?: string;
  /**
   * Source/output paths used to produce this map.
   *
   * Paths are normalized with `rootDir` when present.
   */
  inputs?: {
    entry?: string;
    listing?: string;
    hex?: string;
    bin?: string;
  };
  /**
   * Optional runnable entry symbol metadata for harnesses.
   */
  entrySymbol?: string;
  /**
   * Optional resolved entry address metadata for harnesses.
   */
  entryAddress?: number;
}

/**
 * Options for listing writing.
 *
 * Note: the listing format is currently a deterministic byte dump plus a symbol table.
 */
export interface WriteListingOptions {
  /**
   * Line ending to use when emitting text formats.
   */
  lineEnding?: '\n' | '\r\n';
  /**
   * Number of bytes shown per listing line.
   */
  bytesPerLine?: number;
}

/**
 * Options for ASM80 source emission.
 */
export interface WriteAsm80Options {
  /**
   * Line ending to use when emitting text formats.
   */
  lineEnding?: '\n' | '\r\n';
}

/**
 * In-memory Intel HEX artifact.
 */
export interface HexArtifact {
  kind: 'hex';
  path?: string;
  text: string;
}

/**
 * In-memory flat binary artifact.
 */
export interface BinArtifact {
  kind: 'bin';
  path?: string;
  bytes: Uint8Array;
}

/**
 * In-memory listing artifact.
 */
export interface ListingArtifact {
  kind: 'lst';
  path?: string;
  text: string;
}

/**
 * In-memory ASM80 `.z80` artifact.
 */
export interface Asm80Artifact {
  kind: 'asm80';
  path?: string;
  text: string;
}

/**
 * In-memory D8 Debug Map (D8M) artifact.
 */
export interface D8mArtifact {
  kind: 'd8m';
  path?: string;
  json: D8mJson;
}

export type D8mSegmentKind = 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';

export type D8mSegmentConfidence = 'high' | 'medium' | 'low';

export interface D8mSegment {
  start: number;
  end: number;
  lstLine: number;
  /** 1-based original source line when known. */
  line?: number;
  kind: D8mSegmentKind;
  confidence: D8mSegmentConfidence;
}

export type D8mSymbol =
  | {
      name: string;
      kind: 'constant';
      value: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
    }
  | {
      name: string;
      kind: 'label' | 'data' | 'unknown';
      address: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
      size?: number;
    };

export type D8mFileSymbol =
  | {
      name: string;
      kind: 'constant';
      value: number;
      line?: number;
      scope?: 'global' | 'local';
    }
  | {
      name: string;
      kind: 'label' | 'data' | 'unknown';
      address: number;
      line?: number;
      scope?: 'global' | 'local';
      size?: number;
    };

export interface D8mFileEntry {
  segments?: D8mSegment[];
  symbols?: D8mFileSymbol[];
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

/**
 * In-memory register-care audit report artifact.
 */
export interface RegisterCareReportArtifact {
  kind: 'register-care-report';
  path?: string;
  text: string;
}

/**
 * In-memory inferred register-care interface artifact.
 */
export interface RegisterCareInterfaceArtifact {
  kind: 'register-care-interface';
  path?: string;
  text: string;
}

/**
 * In-memory register-care source annotation artifact.
 */
export interface RegisterCareAnnotationsArtifact {
  kind: 'register-care-annotations';
  files: Array<{ path: string; text: string }>;
}

/**
 * Union of all artifact kinds produced by the compiler.
 */
export type Artifact =
  | HexArtifact
  | BinArtifact
  | ListingArtifact
  | D8mArtifact
  | Asm80Artifact
  | RegisterCareReportArtifact
  | RegisterCareInterfaceArtifact
  | RegisterCareAnnotationsArtifact;

/**
 * Minimal D8 Debug Map (D8M) v1 JSON shape.
 *
 * Writers may add additional keys as needed.
 */
export type D8mJson = {
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
};

/**
 * Format writers used by the pipeline to turn emitted bytes/symbols into artifacts.
 */
export interface FormatWriters {
  writeHex(map: EmittedByteMap, symbols: SymbolEntry[], opts?: WriteHexOptions): HexArtifact;
  writeBin(map: EmittedByteMap, symbols: SymbolEntry[], opts?: WriteBinOptions): BinArtifact;
  writeD8m(map: EmittedByteMap, symbols: SymbolEntry[], opts?: WriteD8mOptions): D8mArtifact;
  writeListing?(
    map: EmittedByteMap,
    symbols: SymbolEntry[],
    opts?: WriteListingOptions,
  ): ListingArtifact;
  writeAsm80?(
    program: import('../lowering/loweredAsmTypes.js').LoweredAsmProgram,
    opts?: WriteAsm80Options,
  ): Asm80Artifact;
}
