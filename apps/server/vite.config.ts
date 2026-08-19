import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    ssr: "src/main.ts",
    target: "node24",
  },
});
