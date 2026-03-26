import test from "node:test";
import assert from "node:assert/strict";

import { buildAnomalyMarkerModel } from "./anomalySemiology.mjs";

const scenario = {
  anomalyDensity: 0.72,
  rois: [
    {
      id: "R1",
      risk: 0.88,
      signal: 0.74,
      cloud: 0.16,
      box: { left: 18, top: 24, width: 18, height: 14 },
    },
    {
      id: "R2",
      risk: 0.61,
      signal: 0.53,
      cloud: 0.24,
      box: { left: 56, top: 44, width: 16, height: 14 },
    },
  ],
};

test("标记模型会把异常强度和处理状态拆开表达", () => {
  const markerModel = buildAnomalyMarkerModel({
    scenario,
    result: {
      state: {
        outputProduct: "quantitative-retrieval",
        processedRois: [{ id: "R1", confidence: 0.79 }],
      },
    },
    overlayPoints: [
      { roiId: "R1", x: 25, y: 30, strength: 0.84 },
      { roiId: "R1", x: 27, y: 31, strength: 0.78 },
      { roiId: "R2", x: 63, y: 50, strength: 0.58 },
      { roiId: "R2", x: 66, y: 52, strength: 0.44 },
    ],
  });

  assert.equal(markerModel.points.length, 4);
  assert.equal(markerModel.points[0].band, "core");
  assert.equal(markerModel.points[2].band, "trace");

  const processedMarker = markerModel.markers.find((marker) => marker.roiId === "R1");
  const candidateMarker = markerModel.markers.find((marker) => marker.roiId === "R2");

  assert.equal(processedMarker.status, "processed");
  assert.equal(processedMarker.confidence, 0.79);
  assert.match(processedMarker.detail, /深度反演/);
  assert.equal(candidateMarker.status, "candidate");
  assert.match(candidateMarker.detail, /待进入精细处理/);
  assert.ok(markerModel.legend.some((item) => item.key === "processed"));
  assert.ok(markerModel.legend.some((item) => item.key === "candidate"));
});

test("降级热区输出会保留像元强度但单独标出降级状态", () => {
  const markerModel = buildAnomalyMarkerModel({
    scenario,
    result: {
      state: {
        outputProduct: "anomaly-heatmap",
        processedRois: [{ id: "R1", confidence: 0.68 }],
      },
    },
    overlayPoints: [{ roiId: "R1", x: 24, y: 29, strength: 0.72 }],
  });

  const degradedMarker = markerModel.markers.find((marker) => marker.roiId === "R1");

  assert.equal(degradedMarker.status, "degraded");
  assert.match(markerModel.summary.title, /降级状态/);
  assert.ok(markerModel.legend.some((item) => item.key === "degraded"));
  assert.equal(markerModel.points[0].band, "strong");
});

test("热异常热点图会把确认状态和局部复核入口分开表达", () => {
  const markerModel = buildAnomalyMarkerModel({
    scenario: {
      type: "wildfire",
      anomalyDensity: 0.44,
      rois: [
        {
          id: "R1",
          risk: 0.86,
          signal: 0.78,
          cloud: 0.08,
          box: { left: 34, top: 22, width: 12, height: 10 },
        },
      ],
    },
    result: {
      state: {
        outputProduct: "thermal-hotspot-map",
        processedRois: [{ id: "R1", confidence: 0.83 }],
      },
    },
    overlayPoints: [
      { roiId: "R1", x: 40, y: 27, strength: 0.9 },
      { roiId: "R1", x: 41, y: 28, strength: 0.82 },
    ],
  });

  assert.match(markerModel.summary.title, /确认状态/);
  assert.match(markerModel.markers[0].detail, /已确认热异常热点/);
  assert.ok(markerModel.legend.some((item) => item.label === "已确认热异常热点"));
});
