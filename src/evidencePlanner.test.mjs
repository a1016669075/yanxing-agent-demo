import test from "node:test";
import assert from "node:assert/strict";

import { runEvidencePlannerMission } from "./evidencePlanner.mjs";
import { buildProvenance } from "./evidenceTypes.mjs";
import { createGeoMemory, writeGeoMemory } from "./geoMemory.mjs";

function buildValidRegion({ width = 10, height = 10, surfaceValue = 0 } = {}) {
  const total = width * height;
  return {
    width,
    height,
    validMask: new Uint8Array(total).fill(1),
    cloudMask: new Uint8Array(total).fill(0),
    surfaceMask: new Uint8Array(total).fill(surfaceValue),
    source: "test-valid-region",
  };
}

function wildfireScenario() {
  return {
    id: "planner-wildfire-case",
    title: "Wildfire planner case",
    type: "wildfire",
    mission: "Validate typed evidence planning for wildfire.",
    sensor: "VIIRS / Sentinel-2",
    cloudCover: 0.12,
    radiometricQuality: 0.86,
    bandwidthBudgetMb: 24,
    rois: [
      {
        id: "wf-1",
        name: "Hotspot A",
        risk: 0.92,
        signal: 0.88,
        cloud: 0.06,
        area: 24,
        detectionConfidence: 0.84,
        detectionMode: "thermal-hotspot",
        box: { left: 18, top: 22, width: 18, height: 18 },
      },
      {
        id: "wf-2",
        name: "Hotspot B",
        risk: 0.74,
        signal: 0.68,
        cloud: 0.09,
        area: 16,
        detectionConfidence: 0.71,
        detectionMode: "thermal-hotspot",
        box: { left: 56, top: 42, width: 14, height: 14 },
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
      validPixelRatio: 0.78,
      decloudApplied: true,
      cloudMask: {
        itemCount: 1,
        confidence: 0.82,
        estimatedCoverage: 0.14,
      },
      validRegion: buildValidRegion({ surfaceValue: 0 }),
      alignment: {
        score: 0.84,
      },
    },
    focusSelection: {
      label: "Wildfire AOI",
      scaleLabel: "regional",
      scaleKey: "regional",
      strategyText: "Focus on thermal confirmation first.",
      cacheKey: "wildfire-aoi",
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

function dustScenario() {
  return {
    id: "planner-dust-case",
    title: "Dust planner case",
    type: "dust",
    mission: "Validate hard veto and abstain behaviour for dust.",
    sensor: "MODIS / VIIRS",
    cloudCover: 0.18,
    radiometricQuality: 0.74,
    bandwidthBudgetMb: 18,
    rois: [
      {
        id: "dust-1",
        name: "Water-like bright patch",
        risk: 0.58,
        signal: 0.52,
        cloud: 0.08,
        area: 28,
        detectionConfidence: 0.32,
        detectionMode: "dust-candidate",
        box: { left: 24, top: 24, width: 26, height: 22 },
      },
    ],
    observation: {
      iso: "2026-04-06T03:00:00.000Z",
      dateValue: "2026-04-06",
      hour: 3,
      label: "2026-04-06 11:00 CST",
    },
    imagery: {
      sourceLabel: "MODIS corrected reflectance",
      src: "https://example.com/modis.png",
      supplementalPreview: {
        available: false,
      },
    },
    analysis: {
      sourceLabel: "Dust support and screening",
      summary: "Initial dust candidate scoring available.",
      validPixelRatio: 0.67,
      decloudApplied: true,
      cloudMask: {
        itemCount: 1,
        confidence: 0.76,
        estimatedCoverage: 0.16,
      },
      validRegion: buildValidRegion({ surfaceValue: 1 }),
      dustSupport: {
        sourceLabel: "AIRS/VIIRS support",
        supportRatio: 0.22,
        sources: ["airs", "viirs"],
      },
      dustScreening: {
        sourceLabel: "surface screening",
        screenedRatio: 0.31,
      },
      alignment: {
        score: 0.72,
      },
    },
    focusSelection: {
      label: "Dust AOI",
      scaleLabel: "regional",
      scaleKey: "regional",
      strategyText: "Prefer valid-region-first conservative dust screening.",
      cacheKey: "dust-aoi",
      bbox: [95, 39, 97, 41],
    },
    imageryProfile: {
      bbox: [95, 39, 97, 41],
    },
    analysisProfile: {
      maxRois: 2,
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
      sourceId: "wildfire-memory",
      note: "recent hotspot summary",
    }),
    payload: {
      hotspotCount: 2,
    },
  });
}

function dustMemory() {
  return writeGeoMemory(createGeoMemory(), "dynamic", {
    task: "dust",
    bbox: [95, 39, 97, 41],
    timeAnchor: "2026-04-05T03:00:00.000Z",
    kind: "dust_summary",
    uncertainty: 0.28,
    provenance: buildProvenance({
      sourceType: "test",
      sourceId: "dust-memory",
      note: "recent dust summary",
    }),
    payload: {
      roiCount: 1,
    },
  });
}

test("wildfire Evidence Planner returns structured state, evidence path, and planner-enriched scenario", async () => {
  const result = await runEvidencePlannerMission(
    wildfireScenario(),
    {
      budgetMin: 8,
      powerMode: "balanced",
      downlinkPolicy: "focused",
      agenticEvidencePlanner: true,
    },
    wildfireMemory(),
    {
      useGeoMemory: true,
      useContextSelection: true,
    }
  );

  assert.equal(result.supported, true);
  assert.equal(result.fallbackUsed, false);
  assert.ok(result.state);
  assert.ok(Array.isArray(result.evidencePath));
  assert.ok(result.evidencePath.length >= 4);
  assert.ok(result.evidencePath.some((step) => step.selectedAction === "fetch_viirs_active_fire"));
  assert.ok(result.evidencePath.some((step) => step.selectedAction === "cluster_hotspots"));
  assert.ok(result.scenario.analysis.plannerEvidence);
  assert.ok(result.scenario.rois.length >= 1);
  assert.ok(result.telemetry.trajectoryLogCompleteness > 0);
});

test("dust Evidence Planner hard-vetoes water-like candidates and allows abstention", async () => {
  const result = await runEvidencePlannerMission(
    dustScenario(),
    {
      budgetMin: 7,
      powerMode: "balanced",
      downlinkPolicy: "focused",
      agenticEvidencePlanner: true,
    },
    dustMemory(),
    {
      useGeoMemory: true,
      useContextSelection: true,
    }
  );

  assert.equal(result.supported, true);
  assert.equal(result.fallbackUsed, false);
  assert.ok(result.evidencePath.some((step) => step.selectedAction === "score_dust_candidates"));
  assert.ok(result.evidencePath.some((step) => step.selectedAction === "reject_water_like_candidates"));
  assert.ok(result.evidencePath.some((step) => step.selectedAction === "temporal_continuation_check"));
  assert.ok(result.state.epistemic.contradictions.includes("dust_candidates_vetoed_by_water_or_uncertainty"));
  assert.equal(result.scenario.analysis.abstained, true);
  assert.equal(result.scenario.rois.length, 0);
});
