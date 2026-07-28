import { defineConfig, devices } from "@playwright/test";

const requestedWorkers = Number.parseInt(process.env["PW_BROWSER_WORKERS"] ?? "1", 10);
const workers = Number.isFinite(requestedWorkers) ? Math.max(1, requestedWorkers) : 1;

const projects = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  },
];

if (process.env["PW_BROWSER_MATRIX"] === "1") {
  projects.push(
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        ...(process.platform === "win32"
          ? {
              launchOptions: {
                // The managed Windows runner already sandboxes the process.
                // Firefox's nested content sandbox crashes its first about:blank
                // page here, before application code can load.
                env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: "1" },
              },
            }
          : {}),
      },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  );
}

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env["PW_BASE_URL"] ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects,
});
