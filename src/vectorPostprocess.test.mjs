import test from "node:test";
import assert from "node:assert/strict";

import { roisToFeatureCollection, summarizeFeatureCollection } from "./vectorPostprocess.mjs";

test("ROI 可转成 GeoJSON FeatureCollection", () => {
  const collection = roisToFeatureCollection({
    sceneBbox: [110, 20, 120, 30],
    sceneId: "urban-plume",
    dateValue: "2026-03-24",
    modelId: "official-aod-connected-components",
    selectedIds: ["R1"],
    rois: [
      {
        id: "R1",
        name: "roi-1",
        risk: 0.8,
        signal: 0.7,
        box: { left: 10, top: 20, width: 20, height: 15 },
      },
    ],
  });

  assert.equal(collection.type, "FeatureCollection");
  assert.equal(collection.features.length, 1);
  assert.equal(collection.features[0].geometry.type, "Polygon");
});

test("矢量摘要会统计要素数量和面积", () => {
  const summary = summarizeFeatureCollection({
    type: "FeatureCollection",
    features: [
      { properties: { area_km2: 10, selected: true } },
      { properties: { area_km2: 4, selected: false } },
    ],
  });

  assert.equal(summary.featureCount, 2);
  assert.equal(summary.selectedCount, 1);
  assert.equal(summary.totalAreaKm2, 14);
});
