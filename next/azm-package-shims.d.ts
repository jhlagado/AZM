declare module '@jhlagado/azm/compile' {
  export const compile: typeof import('../src/api-compile').compile;
  export const defaultFormatWriters: typeof import('../src/formats/index').defaultFormatWriters;
}

declare module '@jhlagado/azm/tooling' {
  export const loadProgram: typeof import('../src/api-tooling').loadProgram;
}
