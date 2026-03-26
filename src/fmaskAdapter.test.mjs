import test from "node:test";
import assert from "node:assert/strict";

import { buildFmaskEstimate } from "./fmaskAdapter.mjs";

const scenario = {
  cloudCover: 0.34,
  radiometricQuality: 0.72,
  observation: { hour: 18 },
};

test("有 Landsat 或 Sentinel-2 L1C 时会生成 Fmask 方案", () => {
  const result = buildFmaskEstimate({
    scenario,
    stacResult: {
      features: [
        {
          id: "landsat-a",
          collection: "landsat-c2-l2",
          properties: {},
        },
      ],
    },
  });

  assert.equal(result.strategy, "fmask");
  assert.equal(result.itemCount, 1);
  assert.ok(result.cloudShadowCoverage !== null);
});

test("没有受支持产品时返回 unavailable", () => {
  const result = buildFmaskEstimate({
    scenario,
    stacResult: {
      features: [
        {
          id: "s2-l2a",
          collection: "sentinel-2-l2a",
          properties: {},
        },
      ],
    },
  });

  assert.equal(result.state, "unavailable");
});
