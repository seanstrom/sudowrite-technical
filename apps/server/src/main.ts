import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServerRuntime } from "./runtime";

const runtime = await createServerRuntime({
  databasePath: resolve(process.env.DATABASE_PATH ?? "./data/speech-edit.sqlite"),
  migrationsFolder: process.env.MIGRATIONS_PATH ?? fileURLToPath(
    new URL("../../../packages/storage-sqlite/drizzle", import.meta.url),
  ),
  port: Number(process.env.SERVER_PORT ?? 3001),
});

await runtime.start();
console.log("Speech-to-Edit server ready at http://127.0.0.1:3001/rpc");

const stop = async () => {
  await runtime.dispose();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
