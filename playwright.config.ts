import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
  },
  webServer: [
    {
      command: "pnpm --filter @app/server dev",
      url: "http://127.0.0.1:3001/rpc",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        DATABASE_PATH: "test-data/speech-edit-json.sqlite",
        SERVER_PORT: "3001",
      },
    },
    {
      command: "pnpm --filter @app/web dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { SERVER_PORT: "3001", WEB_PORT: "5173" },
    },
  ],
});
