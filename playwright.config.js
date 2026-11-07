import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4401;
const db = join(tmpdir(), `yac-crm-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && node --no-warnings=ExperimentalWarning server/index.js`,
    url: `http://127.0.0.1:${PORT}/api/me`,
    env: { CRM_DB: db, PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 120000,
  },
});
