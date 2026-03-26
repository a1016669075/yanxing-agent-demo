import test from "node:test";
import assert from "node:assert/strict";

import { getAnalysisLayerConfig } from "./layerCatalog.mjs";
import {
  assessDetectionReliability,
  buildDecloudPreviewImageData,
  buildCloudSuppressionMask,
  buildObservationAlignment,
  extractLegendPalette,
  fallbackWindows,
  mergePredictionRefinement,
  prioritizeImageryLayerIds,
  scorePixelAgainstLegend,
  selectAdaptiveMask,
  shouldApplyModelEnhancement,
} from "./remoteSensing.mjs";

test("imagery prioritization prefers the layer aligned with the analysis platform", () => {
  const ordered = prioritizeImageryLayerIds(
    ["viirs-noaa21-truecolor", "modis-terra-truecolor", "viirs-snpp-truecolor"],
    getAnalysisLayerConfig("modis-terra-aod-3km")
  );

  assert.equal(ordered[0], "modis-terra-truecolor");
});

test("model refinement preserves the analysis valid region for later scene clipping", () => {
  const validRegion = {
    width: 4,
    height: 4,
    validMask: new Uint8Array([
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]),
  };
  const baseScenario = {
    rois: [{ id: "R0", risk: 0.7, signal: 0.6, cloud: 0.1 }],
    anomalyDensity: 0.62,
    imagery: { note: "scene-note" },
    observation: { summary: "old" },
    analysis: {
      sourceLabel: "official-aod",
      summary: "official-summary",
    },
  };
  Object.defineProperty(baseScenario.analysis, "__validRegion", {
    value: validRegion,
    enumerable: false,
    configurable: true,
  });

  const refined = mergePredictionRefinement(
    baseScenario,
    {
      rois: [{ id: "R1", risk: 0.82, signal: 0.76, cloud: 0.12 }],
      anomaly_density: 0.77,
      threshold: 0.59,
      fallback_used: false,
    },
    "local-model"
  );

  assert.equal(refined.analysis.__validRegion.width, validRegion.width);
  assert.equal(refined.analysis.__validRegion.height, validRegion.height);
  assert.deepEqual(Array.from(refined.analysis.__validRegion.validMask), Array.from(validRegion.validMask));
  assert.ok(
    refined.modelRefinement.overlayPoints.every((point) => {
      const x = Math.min(validRegion.width - 1, Math.floor((point.x / 100) * validRegion.width));
      const y = Math.min(validRegion.height - 1, Math.floor((point.y / 100) * validRegion.height));
      return validRegion.validMask[y * validRegion.width + x] === 1;
    })
  );
});

test("thermal hotspot analysis prefers SNPP true color imagery for time alignment", () => {
  const ordered = prioritizeImageryLayerIds(
    ["viirs-noaa21-truecolor", "viirs-snpp-truecolor", "modis-terra-truecolor"],
    getAnalysisLayerConfig("viirs-snpp-thermal-anomalies-375m")
  );

  assert.equal(ordered[0], "viirs-snpp-truecolor");
});

test("cloud suppression masks bright neutral pixels before anomaly extraction", () => {
  const imageData = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      250, 250, 250, 255,
      214, 158, 92, 255,
      240, 245, 246, 255,
      72, 96, 118, 255,
    ]),
  };

  const result = buildCloudSuppressionMask(imageData, {
    estimatedCoverage: 0.35,
    confidence: 0.8,
  });

  assert.equal(result.mask[0], 1);
  assert.equal(result.mask[1], 0);
  assert.equal(result.applied, true);
});

test("decloud preview darkens masked cloud pixels while preserving clear pixels", () => {
  const imageData = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      250, 250, 250, 255,
      72, 96, 118, 255,
    ]),
  };
  const preview = buildDecloudPreviewImageData(imageData, new Uint8Array([1, 0]));

  assert.equal(preview.maskedPixels, 1);
  assert.equal(preview.maskedRatio, 0.5);
  assert.deepEqual(Array.from(preview.imageData.data.slice(0, 4)), [8, 18, 26, 34]);
  assert.deepEqual(Array.from(preview.imageData.data.slice(4, 8)), [72, 96, 118, 255]);
});

test("observation alignment gives higher scores to same-platform imagery", () => {
  const observation = new Date("2026-03-25T10:00:00.000Z");
  const aligned = buildObservationAlignment(
    { sensor: "MODIS", platform: "Terra", nominalObservationHour: 10.5 },
    { sensor: "MODIS", platform: "Terra", nominalObservationHour: 10.5 },
    observation
  );
  const misaligned = buildObservationAlignment(
    { sensor: "VIIRS", platform: "NOAA-21", nominalObservationHour: 13.5 },
    { sensor: "MODIS", platform: "Terra", nominalObservationHour: 10.5 },
    observation
  );

  assert.equal(aligned.exactAligned, true);
  assert.equal(misaligned.exactAligned, false);
  assert.ok(aligned.score > misaligned.score);
});

test("model enhancement is blocked when declouded valid pixels are insufficient", () => {
  const decision = shouldApplyModelEnhancement({
    cloudCover: 0.58,
    analysis: {
      validPixelRatio: 0.24,
      alignment: { score: 0.82 },
      decloudApplied: true,
    },
  });

  assert.equal(decision.allow, false);
  assert.match(decision.reason, /有效像元/);
});

test("model enhancement is allowed when declouding and alignment are both stable", () => {
  const decision = shouldApplyModelEnhancement({
    cloudCover: 0.22,
    analysis: {
      validPixelRatio: 0.71,
      alignment: { score: 0.91 },
      decloudApplied: true,
    },
  });

  assert.equal(decision.allow, true);
});

test("legend palette extraction keeps ordered product colors and drops white background", () => {
  const imageData = {
    width: 6,
    height: 3,
    data: new Uint8ClampedArray([
      255, 255, 255, 255, 40, 76, 180, 255, 72, 156, 118, 255, 220, 205, 84, 255, 228, 136, 52, 255, 186, 44, 34, 255,
      255, 255, 255, 255, 40, 76, 180, 255, 72, 156, 118, 255, 220, 205, 84, 255, 228, 136, 52, 255, 186, 44, 34, 255,
      255, 255, 255, 255, 40, 76, 180, 255, 72, 156, 118, 255, 220, 205, 84, 255, 228, 136, 52, 255, 186, 44, 34, 255,
    ]),
  };

  const palette = extractLegendPalette(imageData);

  assert.equal(palette.length, 5);
  assert.deepEqual(palette[0], { r: 40, g: 76, b: 180 });
  assert.deepEqual(palette[4], { r: 186, g: 44, b: 34 });
});

test("legend scoring maps higher-rank palette colors to higher anomaly scores", () => {
  const palette = [
    { r: 40, g: 76, b: 180 },
    { r: 72, g: 156, b: 118 },
    { r: 220, g: 205, b: 84 },
    { r: 228, g: 136, b: 52 },
    { r: 186, g: 44, b: 34 },
  ];

  const low = scorePixelAgainstLegend(40, 76, 180, palette);
  const high = scorePixelAgainstLegend(186, 44, 34, palette);

  assert.equal(low.matched, true);
  assert.equal(high.matched, true);
  assert.ok(high.score > low.score);
});

test("adaptive mask raises the threshold when the largest component is unrealistically broad", () => {
  const width = 10;
  const height = 10;
  const scores = new Float32Array(width * height).fill(0.12);
  const validMask = new Uint8Array(width * height).fill(1);

  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      scores[y * width + x] = 0.75;
    }
  }
  for (let y = 0; y < 2; y += 1) {
    for (let x = 7; x < 9; x += 1) {
      scores[y * width + x] = 0.9;
      scores[(y + 7) * width + x] = 0.95;
    }
  }

  const selection = selectAdaptiveMask(scores, validMask, width, height, {
    percentileRatio: 0.82,
    baseThreshold: 0.75,
    minComponentPixels: 3,
  });

  assert.equal(selection.thresholdAdjusted, true);
  assert.ok(selection.threshold > 0.75);
  assert.ok(selection.largestComponentRatio <= 0.28);
  assert.ok(selection.components.length >= 1);
});

test("fallback windows avoid stacking overlapping hotspots in the same area", () => {
  const width = 120;
  const height = 120;
  const scores = new Float32Array(width * height).fill(0.08);
  const validMask = new Uint8Array(width * height).fill(1);

  for (let y = 8; y < 40; y += 1) {
    for (let x = 10; x < 42; x += 1) {
      scores[y * width + x] = 0.88;
    }
  }
  for (let y = 70; y < 104; y += 1) {
    for (let x = 74; x < 108; x += 1) {
      scores[y * width + x] = 0.92;
    }
  }

  const rois = fallbackWindows(scores, validMask, width, height, 3, "fallback-roi", {
    minMeanScore: 0.3,
    minPeakScore: 0.5,
  });

  assert.ok(rois.length >= 2);
  assert.ok(Math.abs(rois[0].box.left - rois[1].box.left) > 20);
  assert.ok(Math.abs(rois[0].box.top - rois[1].box.top) > 20);
});

test("detection reliability abstains when score contrast is too weak for safe anomaly marking", () => {
  const reliability = assessDetectionReliability({
    analysisConfig: getAnalysisLayerConfig("modis-terra-aod-3km"),
    scoreValues: [0.42, 0.43, 0.44, 0.45, 0.44, 0.43, 0.45, 0.44],
    validPixelRatio: 0.74,
    cloudSuppressedRatio: 0.12,
    legendMatchedRatio: 0.72,
    components: [],
    threshold: 0.44,
    largestComponentRatio: 0,
  });

  assert.equal(reliability.allowMarking, false);
  assert.equal(reliability.allowWindowFallback, false);
  assert.match(reliability.abstentionReason, /异常分数分离度过低/);
});

test("dust detection reliability allows moderate-contrast fallback windows that generic aerosol rules would reject", () => {
  const sharedInput = {
    analysisConfig: getAnalysisLayerConfig("modis-terra-aod-3km"),
    scoreValues: [0.34, 0.36, 0.38, 0.39, 0.4, 0.42, 0.43, 0.45, 0.47, 0.49],
    validPixelRatio: 0.88,
    cloudSuppressedRatio: 0.12,
    legendMatchedRatio: 0.72,
    components: [],
    threshold: 0.445,
    largestComponentRatio: 0,
  };

  const generic = assessDetectionReliability(sharedInput);
  const dust = assessDetectionReliability({
    ...sharedInput,
    taskType: "dust",
  });

  assert.equal(generic.allowWindowFallback, false);
  assert.equal(dust.allowWindowFallback, true);
  assert.ok(dust.confidence > generic.confidence);
});

test("model refinement keeps official anomaly candidates and stores continuous retrieval separately", () => {
  const baseScenario = {
    rois: [{ id: "R0", risk: 0.7, signal: 0.6, cloud: 0.1 }],
    anomalyDensity: 0.62,
    imagery: { note: "scene-note" },
    observation: { summary: "old" },
    analysis: {
      sourceLabel: "MODIS Terra AOD 3km + 杩為€氬煙鑱氱被",
      summary: "official-summary",
    },
  };
  const refined = mergePredictionRefinement(
    baseScenario,
    {
      rois: [
        { id: "R1", risk: 0.82, signal: 0.76, cloud: 0.12 },
        { id: "R2", risk: 0.71, signal: 0.68, cloud: 0.15 },
      ],
      anomaly_density: 0.77,
      threshold: 0.59,
      fallback_used: false,
    },
    "鏈湴杩炵画鍙嶆紨妯″瀷"
  );

  assert.deepEqual(refined.rois, baseScenario.rois);
  assert.equal(refined.modelRefinement.rois.length, 2);
  assert.equal(refined.analysis.refinement.rois.length, 2);
  assert.match(refined.analysis.summary, /未覆盖官方异常候选区几何/);
});
