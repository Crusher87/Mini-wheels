import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteEntry = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const playwrightEntry = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const rawTestArguments = process.argv.slice(2);
const browserMatrix = rawTestArguments.includes("--matrix");
const nativeQuality = rawTestArguments.includes("--native-quality");
const visualEvidence = rawTestArguments.includes("--visual");
const productionPreview = rawTestArguments.includes("--production");
const serverPort = productionPreview ? "4174" : "4173";
const serverUrl = `http://127.0.0.1:${serverPort}`;
const testArguments = rawTestArguments.filter(
  (argument) =>
    argument !== "--matrix" &&
    argument !== "--native-quality" &&
    argument !== "--visual" &&
    argument !== "--production",
);

if (
  productionPreview &&
  !testArguments.some((argument) => argument === "--grep" || argument.startsWith("--grep="))
) {
  testArguments.push("--grep=PROD-");
}

if (productionPreview && !existsSync(path.join(projectRoot, "dist", "index.html"))) {
  throw new Error("Production browser tests require dist/index.html. Run npm run build first.");
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitForServer(child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready (code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(serverUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The listener may not be bound yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready at ${serverUrl} within ${timeoutMs} ms.`);
}

const server = spawn(
  process.execPath,
  [
    viteEntry,
    ...(productionPreview ? ["preview"] : []),
    "--host",
    "127.0.0.1",
    "--port",
    serverPort,
    "--strictPort",
  ],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...(productionPreview ? {} : { VITE_E2E_LOW_QUALITY: nativeQuality ? "0" : "1" }),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);

let testExitCode;
try {
  await waitForServer(server);
  const tests = spawn(process.execPath, [playwrightEntry, "test", ...testArguments], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PW_BASE_URL: serverUrl,
      PW_BROWSER_MATRIX: browserMatrix ? "1" : "0",
      PW_PRODUCTION_SMOKE: productionPreview ? "1" : "0",
      PW_VISUAL_EVIDENCE: visualEvidence ? "1" : "0",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  const result = await waitForExit(tests);
  testExitCode = result.code ?? 1;
} finally {
  if (server.exitCode === null) {
    server.kill();
    await Promise.race([waitForExit(server), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

process.exitCode = testExitCode ?? 1;
