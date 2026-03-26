import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import { chromium } from "playwright";

const port = 4186;
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

  try {
    await waitForServer(baseUrl);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForFunction(() => Boolean(window.__satAgentDebug), null, { timeout: 20000 });

    await page.locator("#workbenchModeButton").click();
    await page.waitForTimeout(3500);

    const beforeHeap = await cdp.send("Runtime.getHeapUsage");
    const nodeSamples = [await page.evaluate(() => document.getElementsByTagName("*").length)];

    const selections = [
      { bbox: [104, 31, 119, 40], label: "North-China-Soak" },
      { bbox: [-10, 35, 30, 60], label: "Europe-Soak" },
      { bbox: [-125, 25, -65, 50], label: "North-America-Soak" },
    ];

    for (let index = 0; index < 6; index += 1) {
      await page.locator("#dateSlider").fill(String((index * 9) % 80));
      await page.waitForTimeout(900);

      await page.locator("#stacSearchButton").click();
      await page.waitForTimeout(1200);
      await page.locator("#laadsSearchButton").click();
      await page.waitForTimeout(1200);
      await page.locator("#cloudMaskSearchButton").click();
      await page.waitForTimeout(1200);

      const selection = selections[index % selections.length];
      await page.evaluate((value) => window.__satAgentDebug.applyGlobalSelection(value), selection);
      await page.waitForTimeout(1500);
      await page.locator("#runButton").click();
      await page.waitForTimeout(1500);

      nodeSamples.push(await page.evaluate(() => document.getElementsByTagName("*").length));
    }

    await page.evaluate(() => window.__satAgentDebug.clearGlobalSelection());
    await page.waitForTimeout(1200);

    const afterHeap = await cdp.send("Runtime.getHeapUsage");
    const diagnostics = await page.evaluate(() => window.__satAgentDebug.getDiagnostics());
    const stableSamples = nodeSamples.slice(-4);
    const nodeDrift = Math.max(...stableSamples) - Math.min(...stableSamples);
    const heapGrowthMb = (afterHeap.usedSize - beforeHeap.usedSize) / 1024 / 1024;

    assert(pageErrors.length === 0, `Unexpected page errors: ${pageErrors.join(" | ")}`);
    assert(diagnostics.sceneCacheSize <= 18, `sceneCache grew beyond limit: ${diagnostics.sceneCacheSize}`);
    assert(
      diagnostics.decisionPreviewCacheSize <= 24,
      `decisionPreviewCache grew beyond limit: ${diagnostics.decisionPreviewCacheSize}`
    );
    assert(
      diagnostics.remoteSensing.layerProbeCacheSize <= 96,
      `layerProbeCache grew beyond limit: ${diagnostics.remoteSensing.layerProbeCacheSize}`
    );
    assert(nodeDrift <= 120, `DOM node drift is too large after repeated interactions: ${nodeDrift}`);
    assert(heapGrowthMb <= 3.5, `Heap growth is too large after repeated interactions: ${heapGrowthMb.toFixed(2)} MB`);

    console.log(
      JSON.stringify(
        {
          nodeSamples,
          nodeDrift,
          heapBeforeMb: Math.round((beforeHeap.usedSize / 1024 / 1024) * 100) / 100,
          heapAfterMb: Math.round((afterHeap.usedSize / 1024 / 1024) * 100) / 100,
          diagnostics,
        },
        null,
        2
      )
    );

    await browser.close();
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
