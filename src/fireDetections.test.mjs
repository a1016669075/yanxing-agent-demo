import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFireDetectionsFromFirmsRows,
  clusterFireDetections,
  fireClustersToRois,
  summarizeFireOverlay,
} from "./fireDetections.mjs";

test("buildFireDetectionsFromFirmsRows normalizes FIRMS rows into unified detections", () => {
  const detections = buildFireDetectionsFromFirmsRows([
    {
      product: "VIIRS_NOAA21_NRT",
      latitude: "20.1234",
      longitude: "101.5678",
      acq_date: "2026-04-11",
      acq_time: "0530",
      confidence: "h",
      frp: "18.4",
      daynight: "D",
      scan: "0.4",
      track: "0.5",
      satellite: "J2",
    },
  ]);

  assert.equal(detections.length, 1);
  assert.equal(detections[0].satellite, "NOAA-21");
  assert.equal(detections[0].confidence.level, "high");
  assert.equal(detections[0].acqTimeUtc, "2026-04-11T05:30:00.000Z");
  assert.equal(detections[0].daynight, "day");
});

test("clusterFireDetections groups nearby points and converts them into ROI candidates", () => {
  const detections = buildFireDetectionsFromFirmsRows([
    {
      product: "VIIRS_NOAA21_NRT",
      latitude: "20.1",
      longitude: "101.1",
      acq_date: "2026-04-11",
      acq_time: "0530",
      confidence: "h",
      frp: "18.4",
      daynight: "D",
      scan: "0.4",
      track: "0.5",
      satellite: "J2",
    },
    {
      product: "VIIRS_NOAA20_NRT",
      latitude: "20.105",
      longitude: "101.11",
      acq_date: "2026-04-11",
      acq_time: "0542",
      confidence: "n",
      frp: "10.1",
      daynight: "D",
      scan: "0.4",
      track: "0.5",
      satellite: "J1",
    },
  ]);

  const clusters = clusterFireDetections(detections, {
    bbox: [100, 19, 103, 22],
  });
  const rois = fireClustersToRois(clusters);
  const summary = summarizeFireOverlay(detections, clusters);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].count, 2);
  assert.equal(rois.length, 1);
  assert.equal(summary.pointCount, 2);
  assert.equal(summary.clusterCount, 1);
  assert.ok(rois[0].box.width >= 4);
});
