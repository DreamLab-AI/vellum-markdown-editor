// esbuild's binary loader inlines the layout module's bytes into the bundle.
declare module '*.wasm' {
  const bytes: Uint8Array;
  export default bytes;
}
