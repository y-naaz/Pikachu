import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env; load it before the config is read so
// DATABASE_URL (and ANTHROPIC_API_KEY) are available to the CLI.
process.loadEnvFile();

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
});
