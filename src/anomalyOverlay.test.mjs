import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOverlayPointsFromComponents,
  buildOverlayPointsFromRois,
  buildOverlayPointsFromScoreWindows,
  clipOverlayPointsToValidRegion,
} from "./anomalyOverlay.mjs";

function maskIndexForPoint(point, width, height) {
  const x = Math.min(width - 1, Math.floor((point.x / 100) * width));
  const y = Math.min(height - 1, Math.floor((point.y / 100) * height));
  return y * width + x;
}

test("连通域样本会生成带 roiId 的异常像元点簇", () => {
  const points = buildOverlayPointsFromComponents(
    [
      {
        meanScore: 0.71,
        samples: [
          { x: 4, y: 9, score: 0.72 },
          { x: 12, y: 11, score: 0.83 },
        ],
      },
    ],
    20,
    20
  );

  assert.equal(points.length, 2);
  assert.deepEqual(points[0], {
    roiId: "R1",
    x: 22.5,
    y: 47.5,
    strength: 0.72,
  });
});

test("回退 ROI 也会生成稳定的像元点簇而不是方框", () => {
  const points = buildOverlayPointsFromRois([
    {
      id: "R3",
      risk: 0.8,
      box: {
        left: 20,
        top: 30,
        width: 18,
        height: 12,
      },
    },
  ]);

  assert.ok(points.length >= 16);
  assert.equal(points[0].roiId, "R3");
  assert.ok(points.every((point) => point.x >= 20 && point.x <= 38));
  assert.ok(points.every((point) => point.y >= 30 && point.y <= 42));
});

test("ROI fallback points are filtered by the decloud valid region", () => {
  const validRegion = {
    width: 4,
    height: 4,
    validMask: new Uint8Array([
      1, 0, 0, 0,
      1, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]),
  };

  const rawPoints = buildOverlayPointsFromRois([
    {
      id: "R5",
      risk: 0.78,
      box: {
        left: 0,
        top: 0,
        width: 50,
        height: 50,
      },
    },
  ]);
  const filteredPoints = buildOverlayPointsFromRois(
    [
      {
        id: "R5",
        risk: 0.78,
        box: {
          left: 0,
          top: 0,
          width: 50,
          height: 50,
        },
      },
    ],
    {
      validRegion,
      minPointsPerRoi: 3,
    }
  );

  assert.ok(rawPoints.length > filteredPoints.length);
  assert.ok(filteredPoints.length > 0);
  assert.ok(
    filteredPoints.every((point) => validRegion.validMask[maskIndexForPoint(point, validRegion.width, validRegion.height)] === 1)
  );
});

test("render-stage clipping hides invalid or overly sparse point clusters", () => {
  const validRegion = {
    width: 4,
    height: 4,
    validMask: new Uint8Array([
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 1, 0,
    ]),
  };

  const clipped = clipOverlayPointsToValidRegion(
    [
      { roiId: "R1", x: 12.5, y: 12.5, strength: 0.8 },
      { roiId: "R1", x: 37.5, y: 12.5, strength: 0.74 },
      { roiId: "R1", x: 12.5, y: 37.5, strength: 0.69 },
      { roiId: "R2", x: 87.5, y: 12.5, strength: 0.82 },
      { roiId: "R2", x: 62.5, y: 87.5, strength: 0.66 },
    ],
    validRegion,
    { minPointsPerRoi: 3 }
  );

  assert.equal(clipped.clipApplied, true);
  assert.equal(clipped.visiblePointsAllValid, true);
  assert.deepEqual(clipped.visibleRoiIds, ["R1"]);
  assert.deepEqual(clipped.droppedRoiIds, ["R2"]);
  assert.equal(clipped.points.length, 3);
});

test("fallback score windows sample real valid pixels instead of leaving the overlay empty", () => {
  const width = 6;
  const height = 6;
  const scores = new Float32Array([
    0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    0.1, 0.72, 0.1, 0.74, 0.1, 0.1,
    0.1, 0.1, 0.1, 0.1, 0.76, 0.1,
    0.1, 0.71, 0.1, 0.1, 0.1, 0.1,
    0.1, 0.1, 0.73, 0.1, 0.1, 0.1,
    0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
  ]);
  const validMask = new Uint8Array([
    0, 0, 0, 0, 0, 0,
    0, 1, 0, 1, 0, 0,
    0, 0, 0, 0, 1, 0,
    0, 1, 0, 0, 0, 0,
    0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
  ]);

  const points = buildOverlayPointsFromScoreWindows(
    [
      {
        id: "R7",
        risk: 0.82,
        box: { left: 10, top: 10, width: 70, height: 70 },
      },
    ],
    scores,
    validMask,
    width,
    height,
    { minPointsPerRoi: 3, minScore: 0.7 }
  );

  assert.ok(points.length >= 3);
  assert.ok(points.every((point) => point.roiId === "R7"));
  assert.ok(points.every((point) => validMask[maskIndexForPoint(point, width, height)] === 1));
});
