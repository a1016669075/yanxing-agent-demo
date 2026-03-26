import test from "node:test";
import assert from "node:assert/strict";

import {
  SURFACE_MODE_KEY,
  isLocalHostname,
  normalizeSurfaceMode,
  resolveSurfaceMode,
  surfaceModeMeta,
} from "./surfaceMode.mjs";

test("isLocalHostname accepts local development hosts", () => {
  assert.equal(isLocalHostname("localhost"), true);
  assert.equal(isLocalHostname("127.0.0.1"), true);
  assert.equal(isLocalHostname("::1"), true);
  assert.equal(isLocalHostname(""), true);
});

test("resolveSurfaceMode forces showcase outside local development", () => {
  assert.equal(resolveSurfaceMode({ hostname: "a1016669075.github.io", storedMode: "workbench" }), "showcase");
});

test("resolveSurfaceMode restores local preference", () => {
  assert.equal(resolveSurfaceMode({ hostname: "localhost", storedMode: "workbench" }), "workbench");
  assert.equal(resolveSurfaceMode({ hostname: "localhost", storedMode: "unknown" }), "showcase");
});

test("surfaceModeMeta returns stable labels", () => {
  assert.equal(SURFACE_MODE_KEY, "sat-atmo-agent-surface-mode");
  assert.equal(normalizeSurfaceMode("workbench"), "workbench");
  assert.equal(surfaceModeMeta("showcase").label, "展示版");
  assert.equal(surfaceModeMeta("workbench").label, "研发工作台");
});
