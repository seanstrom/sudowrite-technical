import { defineConfig } from "@playwright/test";

const serverPort = Number(process.env.SERVER_PORT ?? 3001);
const webPort = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
  testDir: "./apps/web/e2e",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    browserName: "chromium",
  },
  webServer: [
    {
      command: "pnpm --filter @app/server dev",
      url: `http://127.0.0.1:${serverPort}/rpc`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        DATABASE_PATH: process.env.DATABASE_PATH ?? "test-data/speech-edit-json.sqlite",
        SERVER_PORT: String(serverPort),
      },
    },
    {
      command: "pnpm --filter @app/web dev",
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { SERVER_PORT: String(serverPort), WEB_PORT: String(webPort) },
    },
  ],
});
