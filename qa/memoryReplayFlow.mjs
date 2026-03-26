import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import { chromium } from "playwright";

const port = 4184;
const baseUrl = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForServer(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await delay(250);
  }

  throw new Error(`Server did not become ready within ${timeoutMs} ms`);
}

async function main() {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: "ignore",
  });

  const cleanup = async () => {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await delay(300).catch(() => {});
      if (server.exitCode === null) {
        server.kill("SIGKILL");
      }
    }
  };

  let browser = null;
  let page = null;

  try {
    await waitForServer(baseUrl);
    console.log("[memory] server ready");

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForFunction(() => Boolean(window.__satAgentDebug), null, { timeout: 20000 });
    console.log("[memory] page ready");

    const initialScenarioId = await page.locator("#scenarioSelect").inputValue();

    await page.evaluate(() =>
      window.__satAgentDebug.applyGlobalSelection({
        bbox: [104, 31, 119, 40],
        label: "Memory-Replay-Test",
      })
    );
    await page.waitForFunction(
      () => document.querySelector("#globalSelectionStatus")?.textContent?.includes("Memory-Replay-Test"),
      null,
      { timeout: 20000 }
    );
    console.log("[memory] selection applied");

    await page.locator("#runButton").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#compareTable .compare-row").length >= 4 &&
        document.querySelectorAll(".memory-rerun-button").length > 0,
      null,
      { timeout: 45000 }
    );
    console.log("[memory] first run finished");

    await page.locator("#scenarioSelect").selectOption("dust-frontier");
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__satAgentDebug.clearGlobalSelection());
    await page.waitForTimeout(800);
    console.log("[memory] context diverged");

    await page.locator(".memory-rerun-button").first().click();
    console.log("[memory] rerun clicked");
    await page.waitForFunction(
      (expectedScenarioId) => {
        const diagnostics = window.__satAgentDebug.getDiagnostics();
        return (
          document.querySelector("#scenarioSelect")?.value === expectedScenarioId &&
          String(diagnostics.latestObservedScenarioId || "").startsWith(expectedScenarioId) &&
          diagnostics.latestObservedScenarioIntent === "execution" &&
          diagnostics.activeGlobalSelection?.label === "Memory-Replay-Test" &&
          Boolean(diagnostics.activeGlobalSelection?.bbox)
        );
      },
      initialScenarioId,
      { timeout: 60000 }
    );
    console.log("[memory] replay rerun finished");

    assert(pageErrors.length === 0, `Unexpected page errors: ${pageErrors.join(" | ")}`);

    console.log(
      JSON.stringify(
        {
          scenarioId: await page.locator("#scenarioSelect").inputValue(),
          memoryReplayButtons: await page.locator(".memory-replay-button").count(),
          memoryRerunButtons: await page.locator(".memory-rerun-button").count(),
          diagnostics: await page.evaluate(() => window.__satAgentDebug.getDiagnostics()),
        },
        null,
        2
      )
    );
    await browser.close();
    browser = null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
