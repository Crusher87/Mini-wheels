import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    // Rapier's JS glue and Wasm module must share one externref heap instance.
    // Prebundling the package can duplicate that glue in Vite's dev graph.
    exclude: ["@dimforge/rapier3d"],
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
});
