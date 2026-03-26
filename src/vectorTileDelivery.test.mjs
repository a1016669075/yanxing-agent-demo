import test from "node:test";
import assert from "node:assert/strict";

import { buildVectorTilePreview, summarizeVectorTilePreview } from "./vectorTileDelivery.mjs";

test("JSON tile bundle 可转换成矢量瓦片交付预览", () => {
  const preview = buildVectorTilePreview({
    zoom: 6,
    tiles: [{ key: "6/52/27", z: 6, x: 52, y: 27, featureCount: 2, estimatedBytes: 2048 }],
  });
  const summary = summarizeVectorTilePreview(preview);

  assert.equal(preview.tileCount, 1);
  assert.equal(preview.entries[0].path, "/local-vector/6/52/27.pbf");
  assert.equal(summary.layerId, "anomaly_roi");
});
