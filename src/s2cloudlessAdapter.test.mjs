import test from "node:test";
import assert from "node:assert/strict";

import { buildS2CloudlessEstimate } from "./s2cloudlessAdapter.mjs";

const scenario = {
  cloudCover: 0.28,
  radiometricQuality: 0.76,
};

test("有 Sentinel-2 结果时会生成 s2cloudless 估计", () => {
  const result = buildS2CloudlessEstimate({
    scenario,
    threshold: 0.4,
    stacResult: {
      features: [
        {
          id: "s2-a",
          collection: "sentinel-2-l2a",
          properties: { "eo:cloud_cover": 22 },
        },
      ],
    },
  });

  assert.equal(result.strategy, "s2cloudless");
  assert.equal(result.state, "ready");
  assert.equal(result.itemCount, 1);
  assert.ok(result.meanCloudProbability !== null);
});

test("没有 Sentinel-2 结果时会返回 unavailable", () => {
  const result = buildS2CloudlessEstimate({
    scenario,
    stacResult: {
      features: [
        {
          id: "modis-a",
          collection: "MYD04_3K_6.1NRT",
          properties: {},
        },
      ],
    },
  });

  assert.equal(result.state, "unavailable");
  assert.equal(result.itemCount, 0);
});
