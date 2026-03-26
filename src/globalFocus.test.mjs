import test from "node:test";
import assert from "node:assert/strict";

import { getScenarioById, observationFromParts } from "./scenarios.mjs";
import {
  WORLD_BBOX,
  adaptiveFocusProfile,
  bboxToPercentRect,
  buildFocusScenario,
  describeFocusBbox,
  normalizeFocusBbox,
  percentRectToBbox,
} from "./globalFocus.mjs";

test("normalizeFocusBbox clamps to world bounds and minimum spans", () => {
  const bbox = normalizeFocusBbox([179, 89, 180, 90]);
  assert.deepEqual(bbox, [178, 88.5, 180, 90]);
});

test("percentRectToBbox and bboxToPercentRect stay in expected ranges", () => {
  const bbox = percentRectToBbox({ left: 25, top: 20, width: 18, height: 16 });
  const rect = bboxToPercentRect(bbox);
  assert.equal(Array.isArray(WORLD_BBOX), true);
  assert.ok(rect.left >= 0 && rect.left <= 100);
  assert.ok(rect.width > 0 && rect.width <= 100);
});

test("describeFocusBbox classifies scales", () => {
  assert.equal(describeFocusBbox([-180, -60, 180, 60]).scaleKey, "global");
  assert.equal(describeFocusBbox([90, 10, 120, 30]).scaleKey, "regional");
  assert.equal(describeFocusBbox([112, 21, 116, 24]).scaleKey, "local");
});

test("adaptiveFocusProfile reduces render size for large areas", () => {
  const globalProfile = adaptiveFocusProfile([-180, -60, 180, 60]);
  const localProfile = adaptiveFocusProfile([112, 21, 116, 24]);
  assert.ok(globalProfile.displayWidth < localProfile.displayWidth);
  assert.ok(globalProfile.analysisWidth < localProfile.analysisWidth);
});

test("buildFocusScenario converts a task template into a custom focus scenario", () => {
  const base = getScenarioById("urban-plume");
  const observation = observationFromParts(0, 0);
  const scenario = buildFocusScenario(base, observation, {
    bbox: [110.5, 21.4, 116.8, 25.2],
    label: "珠三角自主选区",
  });

  assert.equal(scenario.id, "urban-plume-global-focus");
  assert.equal(scenario.baseScenarioId, "urban-plume");
  assert.equal(scenario.imageryProfile.label, "珠三角自主选区");
  assert.equal(scenario.supportsLocalModel, false);
  assert.equal(Array.isArray(scenario.fallbackRois), true);
  assert.equal(scenario.focusSelection.scaleKey, "local");
});
