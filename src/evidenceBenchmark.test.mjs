import test from "node:test";
import assert from "node:assert/strict";

import { runAgentMission, runBaselineMission, createMemory } from "./engine.mjs";
import { runEvidenceBenchmarkSuite } from "./evidenceBenchmark.mjs";
import { buildProvenance } from "./evidenceTypes.mjs";
import { createGeoMemory, writeGeoMemory } from "./geoMemory.mjs";

function buildValidRegion() {
  return {
    width: 10,
    height: 10,
    validMask: new Uint8Array(100).fill(1),
    cloudMask: new Uint8Array(100).fill(0),
    surfaceMask: new Uint8Array(100).fill(0),
    source: "benchmark-valid-region",
  };
}

function wildfireScenario() {
  return {
    id: "planner-benchmark-wildfire",
    title: "Wildfire benchmark case",
    type: "wildfire",
    mission: "Benchmark planner trajectory against fixed workflow.",
    sensor: "VIIRS / Sentinel-2",
    cloudCover: 0.1,
    radiometricQuality: 0.88,
    bandwidthBudgetMb: 24,
    rois: [
      {
        id: "wf-bench-1",
        name: "Hotspot A",
        risk: 0.9,
        signal: 0.87,
        cloud: 0.04,
        area: 24,
        detectionConfidence: 0.83,
        detectionMode: "thermal-hotspot",
        box: { left: 24, top: 26, width: 18, height: 18 },
      },
    ],
    fallbackRois: [
      {
        id: "wf-static-1",
        name: "Persistent thermal source",
        box: { left: 60, top: 44, width: 10, height: 10 },
      },
    ],
    observation: {
      iso: "2026-03-07T04:00:00.000Z",
      dateValue: "2026-03-07",
      hour: 4,
      label: "2026-03-07 12:00 CST",
    },
    imagery: {
      sourceLabel: "VIIRS true color",
      src: "https://example.com/viirs.png",
      supplementalPreview: {
        available: true,
        sourceLabel: "Sentinel-2 support",
        previewUrl: "https://example.com/sentinel.png",
        observationLabel: "same-day",
        sameLocalDay: true,
        cloudCover: 0.08,
      },
    },
    analysis: {
      sourceLabel: "VIIRS thermal anomalies 375m",
      summary: "Initial wildfire screening available.",
      validPixelRatio: 0.81,
      decloudApplied: true,
      cloudMask: {
        itemCount: 1,
        confidence: 0.85,
        estimatedCoverage: 0.12,
      },
      validRegion: buildValidRegion(),
      alignment: {
        score: 0.86,
      },
    },
    focusSelection: {
      label: "Wildfire AOI",
      scaleLabel: "regional",
      scaleKey: "regional",
      strategyText: "Benchmark wildfire planner path.",
      cacheKey: "wildfire-benchmark-aoi",
      bbox: [100, 35, 102, 37],
    },
    imageryProfile: {
      bbox: [100, 35, 102, 37],
    },
    analysisProfile: {
      maxRois: 3,
    },
  };
}

function wildfireMemory() {
  return writeGeoMemory(createGeoMemory(), "dynamic", {
    task: "wildfire",
    bbox: [100, 35, 102, 37],
    timeAnchor: "2026-03-06T04:00:00.000Z",
    kind: "hotspot_summary",
    uncertainty: 0.24,
    provenance: buildProvenance({
      sourceType: "test",
      sourceId: "wildfire-benchmark-memory",
      note: "recent hotspot summary",
    }),
    payload: {
      hotspotCount: 1,
    },
  });
}

test("runEvidenceBenchmarkSuite returns four benchmark arms", async () => {
  const scenario = wildfireScenario();
  const report = await runEvidenceBenchmarkSuite({
    scenario,
    options: {
      budgetMin: 8,
      powerMode: "balanced",
      downlinkPolicy: "focused",
      agenticEvidencePlanner: true,
    },
    runAgentMission: (scene, options) => runAgentMission(scene, options, createMemory(), { taskId: scene.type }),
    runBaselineMission,
    geoMemoryInput: wildfireMemory(),
  });

  assert.equal(report.taskId, "wildfire");
  assert.equal(report.arms.length, 4);
  assert.deepEqual(
    report.arms.map((arm) => arm.label),
    ["fixed_workflow_baseline", "memory_only", "context_selection_only", "full_planner"]
  );
  assert.ok(report.arms.every((arm) => Number.isFinite(arm.endToEndLatencyMs)));
});
