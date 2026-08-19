import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/rpc": {
        target: `http://127.0.0.1:${process.env.SERVER_PORT ?? 3001}`,
      },
    },
  },
});
