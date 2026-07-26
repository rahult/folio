import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Standalone build for the product site (https://folio.rahultrikha.com/).
// Separate from the Tauri frontend build, which uses the root vite.config.ts.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/",
  build: {
    outDir: "../dist-site",
    emptyOutDir: true,
  },
});
