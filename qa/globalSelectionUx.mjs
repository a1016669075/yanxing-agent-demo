import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import { chromium } from "playwright";

const port = 4182;
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

async function buttonState(page, selector) {
  const locator = page.locator(selector);
  return {
    selector,
    disabled: await locator.isDisabled(),
    cursor: await locator.evaluate((element) => getComputedStyle(element).cursor),
    label: (await locator.textContent())?.trim() || selector,
  };
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForFunction(() => Boolean(window.__satAgentDebug), null, { timeout: 20000 });
    await page.waitForFunction(
      () => !document.querySelector("#globalZoomInButton")?.disabled,
      null,
      { timeout: 20000 }
    );

    const initialButtons = await Promise.all(
      [
        "#globalApplySelectionButton",
        "#globalClearSelectionButton",
        "#globalZoomResetButton",
        "#globalZoomOutButton",
        "#globalZoomInButton",
      ].map((selector) => buttonState(page, selector))
    );

    assert(
      initialButtons.every((item) => item.cursor !== "wait"),
      `Global entry buttons should not look loading when idle: ${JSON.stringify(initialButtons)}`
    );

    await page.locator("#globalZoomInButton").click();
    await page.waitForFunction(() => window.__satAgentDebug.getDiagnostics().globalViewport.zoom > 1.05, null, {
      timeout: 10000,
    });

    await page.locator("#globalPanModeButton").click();
    const frameBox = await page.locator(".global-overview-frame").boundingBox();
    assert(frameBox, "Global overview frame did not expose a bounding box");

    await page.mouse.move(frameBox.x + frameBox.width * 0.5, frameBox.y + frameBox.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(frameBox.x + frameBox.width * 0.36, frameBox.y + frameBox.height * 0.38, { steps: 8 });
    await page.mouse.up();

    await page.waitForFunction(
      () => {
        const viewport = window.__satAgentDebug.getDiagnostics().globalViewport;
        return Math.abs(viewport.centerX - 0.5) > 0.01 || Math.abs(viewport.centerY - 0.5) > 0.01;
      },
      null,
      { timeout: 10000 }
    );

    await page.locator("#globalSelectModeButton").click();
    await page.mouse.move(frameBox.x + frameBox.width * 0.32, frameBox.y + frameBox.height * 0.34);
    await page.mouse.down();
    await page.mouse.move(frameBox.x + frameBox.width * 0.58, frameBox.y + frameBox.height * 0.56, { steps: 12 });
    await page.mouse.up();

    await page.waitForFunction(
      () => !document.querySelector("#globalApplySelectionButton")?.disabled,
      null,
      { timeout: 10000 }
    );
    await page.locator("#globalApplySelectionButton").click();
    await page.waitForFunction(
      () => Boolean(window.__satAgentDebug.getDiagnostics().activeGlobalSelection?.bbox),
      null,
      { timeout: 10000 }
    );

    const finalButtons = await Promise.all(
      [
        "#globalApplySelectionButton",
        "#globalClearSelectionButton",
        "#globalZoomResetButton",
        "#globalZoomOutButton",
        "#globalZoomInButton",
      ].map((selector) => buttonState(page, selector))
    );

    assert(pageErrors.length === 0, `Unexpected page errors: ${pageErrors.join(" | ")}`);
    assert(
      finalButtons.every((item) => item.cursor !== "wait"),
      `Global entry buttons should not look loading after interaction: ${JSON.stringify(finalButtons)}`
    );

    console.log(
      JSON.stringify(
        {
          initialButtons,
          finalButtons,
          diagnostics: await page.evaluate(() => window.__satAgentDebug.getDiagnostics()),
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
