import test from "node:test";
import assert from "node:assert/strict";

import { buildAlignmentPlan } from "./resampleAlignment.mjs";

test("对齐方案会输出统一网格与堆叠信息", () => {
  const plan = buildAlignmentPlan({
    scenario: { id: "urban-plume", sensor: "VIIRS" },
    bbox: [113.5, 22.2, 114.5, 23.2],
    stacResult: {
      features: [{ id: "s2-a", collection: "sentinel-2-l2a" }],
    },
    laadsResult: {
      productId: "MYD04_3K_6.1NRT",
      items: [{ id: "modis-a" }],
    },
    targetResolutionMeters: 500,
  });

  assert.equal(plan.state, "ready");
  assert.equal(plan.stackDepth, 2);
  assert.ok(plan.expectedPixels > 0);
});
