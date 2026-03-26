import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import { chromium } from "playwright";

const port = 4181;
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
    const requestFailures = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      requestFailures.push({
        url: request.url(),
        error: request.failure()?.errorText || "unknown_error",
      });
    });

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForFunction(() => Boolean(window.__satAgentDebug), null, { timeout: 20000 });

    const beforeHeap = await cdp.send("Runtime.getHeapUsage");
    console.log("[smoke] page ready");

    await page.locator("#showcaseModeButton").click();
    await page.waitForFunction(() => document.body.dataset.surfaceMode === "showcase", null, {
      timeout: 10000,
    });

    await page.locator("#globalZoomInButton").click();
    await page.waitForFunction(() => window.__satAgentDebug.getDiagnostics().globalViewport.zoom > 1.05, null, {
      timeout: 10000,
    });
    await page.locator("#globalZoomResetButton").click();
    await page.waitForFunction(() => window.__satAgentDebug.getDiagnostics().globalViewport.zoom === 1, null, {
      timeout: 10000,
    });
    console.log("[smoke] global zoom ok");

    await page.evaluate(() =>
      window.__satAgentDebug.applyGlobalSelection({
        bbox: [104, 31, 119, 40],
        label: "North-China-Test",
      })
    );
    await page.waitForTimeout(3200);
    await page.waitForFunction(
      () => document.querySelector("#globalSelectionStatus")?.textContent?.includes("North-China-Test"),
      null,
      { timeout: 20000 }
    );
    console.log("[smoke] global selection applied");

    await page.locator("#runButton").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#compareTable .compare-row").length >= 4,
      null,
      { timeout: 45000 }
    );
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".anomaly-point").length > 20 &&
        document.querySelectorAll(".anomaly-anchor").length > 0 &&
        document.querySelectorAll(".roi-box").length === 0,
      null,
      { timeout: 10000 }
    );
    await page.waitForFunction(
      () => (document.querySelector("#compareExplain")?.textContent || "").includes("结果边界"),
      null,
      { timeout: 10000 }
    );
    await page.waitForFunction(
      () => document.querySelectorAll(".memory-replay-button").length > 0,
      null,
      { timeout: 10000 }
    );
    await page.waitForFunction(
      () => document.querySelectorAll(".memory-rerun-button").length > 0,
      null,
      { timeout: 10000 }
    );
    const showcaseState = await page.evaluate(() => {
      const readDisplay = (selector) => {
        const element = document.querySelector(selector);
        return element ? window.getComputedStyle(element).display : null;
      };

      return {
        summaryCardCount: document.querySelectorAll("#showcaseSummary .showcase-card").length,
        summaryText: document.querySelector("#showcaseSummary")?.textContent || "",
        compareTableDisplay: readDisplay("#compareTable"),
        missionPanelDisplay: readDisplay(".mission-panel"),
        logPanelDisplay: readDisplay(".log-panel"),
        memoryPanelDisplay: readDisplay(".memory-panel"),
        capabilityCardCount: document.querySelectorAll("#capabilityBoard .capability-card").length,
      };
    });
    assert(showcaseState.summaryCardCount >= 4, "showcase summary did not render four cards");
    assert(showcaseState.summaryText.includes("去云门禁"), "showcase summary omitted the decloud gate card");
    assert(showcaseState.compareTableDisplay === "none", "showcase mode still exposed the comparison table");
    assert(showcaseState.missionPanelDisplay === "none", "showcase mode still exposed the mission panel");
    assert(showcaseState.logPanelDisplay === "none", "showcase mode still exposed the execution log");
    assert(showcaseState.memoryPanelDisplay === "none", "showcase mode still exposed the memory panel");
    assert(showcaseState.capabilityCardCount === 1, "showcase mode did not collapse the capability board");
    await page.waitForFunction(
      () => {
        const toggle = document.querySelector("#decloudPreviewToggle");
        return Boolean(toggle) && !toggle.disabled;
      },
      null,
      { timeout: 10000 }
    );
    await page.locator("#decloudPreviewToggle").check();
    await page.waitForFunction(
      () => document.querySelector(".scene-frame")?.dataset?.sceneView === "declouded",
      null,
      { timeout: 10000 }
    );
    await page.waitForFunction(
      () => (document.querySelector(".scene-meta-grid")?.textContent || "").includes("去云后预览"),
      null,
      { timeout: 10000 }
    );
    const sceneOverlayDiagnostics = await page.evaluate(() => window.__satAgentDebug.getDiagnostics().sceneOverlay);
    assert(sceneOverlayDiagnostics?.validRegionAvailable === true, "scene overlay valid region was not attached");
    assert(sceneOverlayDiagnostics?.visiblePointsAllValid === true, "scene overlay leaked invalid points after clipping");
    const decloudInspectionState = await page.evaluate(() => ({
      pointCount: document.querySelectorAll(".anomaly-point").length,
      anchorCount: document.querySelectorAll(".anomaly-anchor").length,
      labelCount: document.querySelectorAll(".anomaly-label").length,
      validRegionTileCount: document.querySelectorAll(".valid-region-tile").length,
      metaText: document.querySelector(".scene-meta-grid")?.textContent || "",
      diagnostics: window.__satAgentDebug.getDiagnostics().sceneOverlay,
    }));
    assert(decloudInspectionState.pointCount > 0, "decloud inspection lost all anomaly points");
    assert(decloudInspectionState.anchorCount === 0, "decloud inspection still rendered anomaly anchors");
    assert(decloudInspectionState.labelCount === 0, "decloud inspection still rendered anomaly labels");
    assert(
      (decloudInspectionState.diagnostics?.validRegionInspectionTiles || 0) === decloudInspectionState.validRegionTileCount,
      "decloud inspection valid-region overlay count drifted from diagnostics"
    );
    assert(
      decloudInspectionState.metaText.includes("去云检查"),
      "scene meta grid did not expose the decloud inspection card"
    );
    await page.locator("#decloudPreviewToggle").uncheck();
    await page.waitForFunction(
      () => document.querySelector(".scene-frame")?.dataset?.sceneView === "raw",
      null,
      { timeout: 10000 }
    );
    const operationalCompareExplain = await page.locator("#compareExplain").innerText();
    console.log("[smoke] operational run finished");

    await page.locator("#taskTypeSelect").selectOption("flood");
    await page.waitForTimeout(500);
    const planningRunText = await page.locator("#runButton").innerText();
    await page.locator("#runButton").click();
    await page.waitForFunction(
      () => (document.querySelector("#workflowPlan")?.textContent || "").trim().length > 30,
      null,
      { timeout: 30000 }
    );
    console.log("[smoke] planning run finished");

    await page.evaluate(() => window.__satAgentDebug.clearGlobalSelection());
    await page.waitForTimeout(1200);
    await page.locator("#taskTypeSelect").selectOption("pollution");
    await page.waitForTimeout(1200);

    await page.locator("#workbenchModeButton").click();
    await page.waitForFunction(() => document.body.dataset.surfaceMode === "workbench", null, {
      timeout: 10000,
    });
    await page.waitForTimeout(3500);
    const workbenchState = await page.evaluate(() => ({
      logPanelDisplay: window.getComputedStyle(document.querySelector(".log-panel")).display,
      memoryPanelDisplay: window.getComputedStyle(document.querySelector(".memory-panel")).display,
      capabilityCardCount: document.querySelectorAll("#capabilityBoard .capability-card").length,
    }));
    assert(workbenchState.logPanelDisplay !== "none", "workbench mode did not restore the execution log");
    assert(workbenchState.memoryPanelDisplay !== "none", "workbench mode did not restore the memory panel");
    assert(workbenchState.capabilityCardCount >= 3, "workbench mode did not restore the full capability board");
    console.log("[smoke] workbench ready");

    await page.locator("#stacSearchButton").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#stacResults article").length > 0,
      null,
      { timeout: 45000 }
    );
    console.log("[smoke] stac search ok");

    await page.locator("#laadsSearchButton").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#laadsResults article").length > 0,
      null,
      { timeout: 45000 }
    );
    console.log("[smoke] laads search ok");

    await page.locator("#cloudMaskSearchButton").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#cloudMaskResults article").length > 0,
      null,
      { timeout: 45000 }
    );
    console.log("[smoke] cloud mask search ok");

    await page.locator("#runnerRunButton").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#runnerSummary .brief-card").length >= 3,
      null,
      { timeout: 45000 }
    );
    console.log("[smoke] runner finished");

    await page.locator("#vectorBuildButton").click();
    await page.waitForFunction(
      () => (document.querySelector("#vectorSummary")?.textContent || "").includes("GeoJSON FeatureCollection"),
      null,
      { timeout: 15000 }
    );

    await page.locator("#jsonTileBuildButton").click();
    await page.waitForFunction(
      () => (document.querySelector("#jsonTileSummary")?.textContent || "").includes("tile"),
      null,
      { timeout: 15000 }
    );

    await page.locator("#vectorTileBuildButton").click();
    await page.waitForFunction(
      () => (document.querySelector("#vectorTileSummary")?.textContent || "").includes("tile"),
      null,
      { timeout: 15000 }
    );

    await page.locator("#evalRunButton").click();
    await page.waitForFunction(
      () => (document.querySelector("#evalSummary")?.textContent || "").trim().length > 20,
      null,
      { timeout: 15000 }
    );
    await page.waitForFunction(
      () => (document.querySelector("#evalSummary")?.textContent || "").includes("案例精度"),
      null,
      { timeout: 10000 }
    );
    await page.waitForFunction(
      () => (document.querySelector("#evalOutput")?.textContent || "").includes("\"caseAccuracy\""),
      null,
      { timeout: 10000 }
    );
    console.log("[smoke] delivery panels finished");

    for (let index = 0; index < 12; index += 1) {
      await page.locator("#dateSlider").fill(String((index * 5) % 80));
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(2600);

    const afterHeap = await cdp.send("Runtime.getHeapUsage");
    const diagnostics = await page.evaluate(() => window.__satAgentDebug.getDiagnostics());

    assert(pageErrors.length === 0, `Unexpected page errors: ${pageErrors.join(" | ")}`);
    assert(requestFailures.length === 0, `Unexpected request failures: ${JSON.stringify(requestFailures)}`);
    assert(diagnostics.sceneCacheSize <= 18, `sceneCache grew beyond limit: ${diagnostics.sceneCacheSize}`);
    assert(
      diagnostics.remoteSensing.layerProbeCacheSize <= 96,
      `layerProbeCache grew beyond limit: ${diagnostics.remoteSensing.layerProbeCacheSize}`
    );

    const summary = {
      title: await page.title(),
      planningRunText,
      sceneMetaCards: await page.locator(".scene-meta-card").count(),
      agentLoopCards: await page.locator(".agent-loop-card").count(),
      anomalyPoints: await page.locator(".anomaly-point").count(),
      anomalyAnchors: await page.locator(".anomaly-anchor").count(),
      memoryReplayButtons: await page.locator(".memory-replay-button").count(),
      memoryRerunButtons: await page.locator(".memory-rerun-button").count(),
      compareExplain: operationalCompareExplain,
      stacSummary: await page.locator("#stacSummary").innerText(),
      laadsSummary: await page.locator("#laadsSummary").innerText(),
      cloudMaskSummary: await page.locator("#cloudMaskSummary").innerText(),
      runnerSummary: await page.locator("#runnerSummary").innerText(),
      evalSummary: await page.locator("#evalSummary").innerText(),
      diagnostics,
      heapBeforeMb: Math.round((beforeHeap.usedSize / 1024 / 1024) * 100) / 100,
      heapAfterMb: Math.round((afterHeap.usedSize / 1024 / 1024) * 100) / 100,
    };

    console.log(JSON.stringify(summary, null, 2));
    await browser.close();
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
