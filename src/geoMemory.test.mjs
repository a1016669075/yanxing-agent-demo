import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeoMemoryKey,
  buildTileKey,
  compactGeoMemory,
  createGeoMemory,
  readGeoMemory,
  summarizeGeoMemory,
  writeGeoMemory,
} from "./geoMemory.mjs";

const bbox = [99.2, 35.1, 101.8, 36.9];

test("GeoMemory builds stable tile-time keys", () => {
  const tileKey = buildTileKey(bbox, "coarse");
  const key = buildGeoMemoryKey({
    task: "dust",
    bbox,
    timeAnchor: "2026-03-07T00:00:00.000Z",
  });

  assert.match(tileKey, /^coarse:/);
  assert.equal(key.task, "dust");
  assert.equal(key.tileKey, tileKey);
  assert.equal(key.timeBucket, "2026-03-07");
});

test("GeoMemory writes and reads entries by AOI plus time window", () => {
  let memory = createGeoMemory();
  memory = writeGeoMemory(memory, "dynamic", {
    task: "wildfire",
    bbox,
    timeAnchor: "2026-03-07T03:00:00.000Z",
    kind: "hotspot_summary",
    uncertainty: 0.22,
    payload: {
      hotspotCount: 2,
    },
  });
  memory = writeGeoMemory(memory, "dynamic", {
    task: "wildfire",
    bbox: [120, 20, 122, 22],
    timeAnchor: "2026-03-07T03:00:00.000Z",
    kind: "hotspot_summary",
    uncertainty: 0.41,
    payload: {
      hotspotCount: 1,
    },
  });

  const hits = readGeoMemory(memory, {
    scope: "dynamic",
    task: "wildfire",
    bbox,
    timeAnchor: "2026-03-08T00:00:00.000Z",
    timeWindowDays: 2,
    kinds: ["hotspot_summary"],
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0].payload.hotspotCount, 2);
});

test("GeoMemory compact and summary keep bounded local storage", () => {
  let memory = createGeoMemory();
  for (let index = 0; index < 70; index += 1) {
    memory = writeGeoMemory(memory, "dynamic", {
      task: "dust",
      bbox,
      timeAnchor: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      kind: `dust-summary-${index}`,
      uncertainty: 0.5,
      payload: { index },
    });
  }

  const compacted = compactGeoMemory(memory, { dynamicLimit: 16 });
  const summary = summarizeGeoMemory(compacted);

  assert.equal(compacted.dynamicEntries.length, 16);
  assert.equal(summary.dynamicCount, 16);
});
