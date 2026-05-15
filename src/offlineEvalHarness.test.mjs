import test from "node:test";
import assert from "node:assert/strict";

import { evaluateOfflineRun } from "./offlineEvalHarness.mjs";

test("离线评测会输出总体分数与结论", () => {
  const report = evaluateOfflineRun({
    scenario: {
      id: "indochina-hotspot",
      type: "wildfire",
      cloudCover: 0.22,
      radiometricQuality: 0.74,
      rois: [
        { id: "R1", name: "热点1", box: { left: 28, top: 22, width: 10, height: 10 } },
        { id: "R2", name: "热点2", box: { left: 42, top: 38, width: 11, height: 11 } },
      ],
      analysis: {},
    },
    preprocessGate: {
      validPixelRatio: 0.78,
      effectiveQuality: 0.72,
    },
    inferenceRun: {
      path: "python_local",
    },
    vectorCollection: {
      features: [{}, {}],
    },
    jsonTileBundle: {
      tileCount: 3,
    },
    queueSummary: {
      byStatus: { done: 1, running: 0 },
    },
    report: {
      agent: { success: true, qualityIndex: 0.84, latencyUsage: 0.54 },
      baseline: { success: false },
    },
  });

  assert.ok(report.overall > 0);
  assert.ok(["ready", "promising", "needs-hardening"].includes(report.verdict));
  assert.equal(report.findings.length, 5);
  assert.equal(report.benchmarkCoverage.taskId, "wildfire");
  assert.ok(report.benchmarkCoverage.candidate >= 1);
  assert.ok(report.benchmarkCatalog.total >= report.benchmarkCoverage.total);
  assert.ok(report.reviewedCaseCatalog.total >= 1);
  assert.equal(report.caseAccuracy.available, true);
  assert.ok(report.scores.accuracy > 0);
});
