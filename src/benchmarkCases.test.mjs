import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateReviewedBenchmarkCase,
  matchReviewedBenchmarkCase,
  reviewedBenchmarkCases,
  roiIoU,
  summarizeReviewedBenchmarkCases,
} from "./benchmarkCases.mjs";

test("roiIoU returns overlap ratio for percent-space boxes", () => {
  const iou = roiIoU(
    { left: 10, top: 10, width: 20, height: 20 },
    { left: 20, top: 20, width: 20, height: 20 }
  );

  assert.ok(iou > 0);
  assert.ok(iou < 1);
});

test("reviewed benchmark cases summarize local seed coverage", () => {
  const summary = summarizeReviewedBenchmarkCases(reviewedBenchmarkCases);

  assert.equal(summary.total, reviewedBenchmarkCases.length);
  assert.ok(summary.taskCount >= 4);
});

test("matching a reviewed case returns unavailable for focused scenes", () => {
  const matched = matchReviewedBenchmarkCase({
    id: "urban-plume-global-focus",
    baseScenarioId: "urban-plume",
    type: "pollution",
    focusSelection: {
      bbox: [111, 21, 116, 25],
    },
  });

  assert.equal(matched.available, false);
  assert.equal(matched.reason, "focused-scene");
});

test("reviewed case evaluation reports precision recall and mean IoU", () => {
  const report = evaluateReviewedBenchmarkCase({
    scenario: {
      id: "urban-plume",
      type: "pollution",
      analysis: {},
    },
    predictedRois: [
      { id: "R1", name: "西侧污染带", box: { left: 15, top: 20, width: 24, height: 20 } },
      { id: "R2", name: "中部主羽流", box: { left: 39, top: 34, width: 23, height: 20 } },
      { id: "R3", name: "误报区域", box: { left: 72, top: 8, width: 8, height: 8 } },
    ],
  });

  assert.equal(report.available, true);
  assert.equal(report.caseId, "urban-plume-reviewed");
  assert.equal(report.metrics.tp, 2);
  assert.equal(report.metrics.fp, 1);
  assert.equal(report.metrics.fn, 1);
  assert.ok(report.metrics.precision > 0.6);
  assert.ok(report.metrics.recall > 0.6);
  assert.ok(report.metrics.meanIoU > 0.5);
  assert.ok(report.accuracyScore > 0);
});
