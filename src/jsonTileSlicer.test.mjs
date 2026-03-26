import test from "node:test";
import assert from "node:assert/strict";

import { lookupJsonTile, sliceFeatureCollectionToJsonTiles, summarizeJsonTileBundle } from "./jsonTileSlicer.mjs";

const featureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "roi-a" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [113.8, 22.6],
            [114.4, 22.6],
            [114.4, 23.1],
            [113.8, 23.1],
            [113.8, 22.6],
          ],
        ],
      },
    },
  ],
};

test("GeoJSON 结果可以切成稳定的 JSON tiles", () => {
  const bundle = sliceFeatureCollectionToJsonTiles(featureCollection, { zoom: 6 });
  const summary = summarizeJsonTileBundle(bundle);

  assert.equal(bundle.zoom, 6);
  assert.ok(bundle.tileCount >= 1);
  assert.ok(summary.totalFeatures >= 1);
});

test("可按 z/x/y 查询单个 tile", () => {
  const bundle = sliceFeatureCollectionToJsonTiles(featureCollection, { zoom: 6 });
  const tile = lookupJsonTile(bundle, bundle.tiles[0].z, bundle.tiles[0].x, bundle.tiles[0].y);

  assert.ok(tile);
  assert.ok(tile.featureCount >= 1);
});
