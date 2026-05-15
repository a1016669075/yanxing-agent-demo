import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultFeatureFlags,
  isFeatureEnabled,
  normalizeFeatureFlags,
  setFeatureFlag,
} from "./featureFlags.mjs";

test("normalizeFeatureFlags keeps Evidence Planner disabled by default", () => {
  assert.deepEqual(normalizeFeatureFlags(), defaultFeatureFlags);
  assert.equal(isFeatureEnabled({}, "agenticEvidencePlanner"), false);
});

test("setFeatureFlag toggles agenticEvidencePlanner without dropping defaults", () => {
  const enabled = setFeatureFlag({}, "agenticEvidencePlanner", true);
  const disabled = setFeatureFlag(enabled, "agenticEvidencePlanner", false);

  assert.equal(enabled.agenticEvidencePlanner, true);
  assert.equal(isFeatureEnabled(enabled, "agenticEvidencePlanner"), true);
  assert.equal(disabled.agenticEvidencePlanner, false);
  assert.equal(isFeatureEnabled(disabled, "agenticEvidencePlanner"), false);
});
