import test from "node:test";
import assert from "node:assert/strict";

import { getAnalysisLayerConfig } from "./layerCatalog.mjs";
import {
  __resetBasemapProxyStateForTest,
  assessDetectionReliability,
  buildCategoricalDustSupportMask,
  buildCategoricalScreeningMask,
  buildCloudGuideMask,
  buildDecloudPreviewImageData,
  buildCloudSuppressionMask,
  buildContinuousDustSupportMask,
  buildRois,
  buildObservationAlignment,
  ensureBasemapProxyReady,
  extractLegendPalette,
  fallbackWindows,
  getRemoteSensingDiagnostics,
  mergePredictionRefinement,
  parseColorMapEntries,
  prioritizeImageryLayerIds,
  resolvePreferredCloudMaskProductId,
  resolveCloudGuideConfig,
  resolveDustScreeningConfigs,
  resolveDustSupportConfigs,
  scorePixelAgainstLegend,
  selectAdaptiveMask,
  selectModis250mSupplementCandidate,
  selectSentinelOpportunityCandidate,
  selectVisualSourceCandidate,
  shouldSearchSentinelOpportunity,
  shouldSearchModis250mSupplement,
  shouldRouteBasemapThroughLocalProxy,
  shouldRouteToWindowFallback,
  shouldApplyModelEnhancement,
  summarizeVisualSourceQuality,
} from "./remoteSensing.mjs";

test("imagery prioritization prefers the layer aligned with the analysis platform", () => {
  const ordered = prioritizeImageryLayerIds(
    ["viirs-noaa21-truecolor", "modis-terra-truecolor", "viirs-snpp-truecolor"],
    getAnalysisLayerConfig("modis-terra-aod-3km")
  );

  assert.equal(ordered[0], "modis-terra-truecolor");
});

test("localhost basemap routing resolves proxy status before preview requests", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.window = {
    location: {
      hostname: "localhost",
    },
  };
  globalThis.fetch = async (url) => {
    fetchCalls += 1;
    assert.equal(url, "/api/gibs-status");
    return {
      ok: true,
      json: async () => ({
        available: true,
        mode: "local_proxy",
      }),
    };
  };

  __resetBasemapProxyStateForTest();

  try {
    const status = await ensureBasemapProxyReady();
    assert.equal(status.available, true);
    assert.equal(fetchCalls, 1);
    assert.equal(getRemoteSensingDiagnostics().basemapProxyAvailability, "available");
    assert.equal(shouldRouteBasemapThroughLocalProxy("localhost"), true);

    await ensureBasemapProxyReady();
    assert.equal(fetchCalls, 1);
  } finally {
    __resetBasemapProxyStateForTest();
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }

    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  }
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

test("sentinel opportunity search is only enabled for regional or smaller bboxes", () => {
  assert.equal(
    shouldSearchSentinelOpportunity({
      bbox: [110.2, 20.4, 117.6, 25.6],
    }),
    true
  );
  assert.equal(
    shouldSearchSentinelOpportunity({
      bbox: [86, 35.5, 104, 45.5],
    }),
    false
  );
});

test("sentinel opportunity selection prefers the clearest overlapping local tile", () => {
  const observation = new Date("2026-04-03T10:00:00.000Z");
  const selection = selectSentinelOpportunityCandidate(
    [
      {
        id: "tile-edge-cloudy",
        bbox: [116.6, 20.6, 117.6, 21.6],
        datetime: "2026-04-02T02:52:00Z",
        cloudCover: 73.5,
        thumbnailUrl: "https://example.test/cloudy.jpg",
      },
      {
        id: "tile-clear-local",
        bbox: [116.1, 19.8, 117.1, 20.8],
        datetime: "2026-04-02T02:52:15Z",
        cloudCover: 1.6,
        thumbnailUrl: "https://example.test/clear.jpg",
      },
      {
        id: "tile-late-clear",
        bbox: [116.0, 20.0, 117.0, 21.0],
        datetime: "2026-04-06T03:00:00Z",
        cloudCover: 3.2,
        thumbnailUrl: "https://example.test/later.jpg",
      },
    ],
    [110.2, 20.4, 117.6, 25.6],
    observation
  );

  assert.equal(selection.selected.id, "tile-clear-local");
  assert.ok(selection.selected.overlapToTile >= 0.39);
  assert.ok(selection.ranked[0].selectionScore >= selection.ranked[1].selectionScore);
});

test("sentinel opportunity selection prefers same-local-day scenes over clearer off-day scenes", () => {
  const observation = new Date("2026-04-03T10:00:00.000+08:00");
  const selection = selectSentinelOpportunityCandidate(
    [
      {
        id: "tile-off-day-clear",
        bbox: [112.0, 21.0, 113.0, 22.0],
        datetime: "2026-04-02T02:52:00Z",
        cloudCover: 1.2,
        thumbnailUrl: "https://example.test/off-day.jpg",
      },
      {
        id: "tile-same-day",
        bbox: [112.0, 21.1, 113.0, 22.1],
        datetime: "2026-04-03T03:06:00Z",
        cloudCover: 4.1,
        thumbnailUrl: "https://example.test/same-day.jpg",
      },
    ],
    [111.8, 20.8, 113.2, 22.2],
    observation
  );

  assert.equal(selection.selected.id, "tile-same-day");
  assert.equal(selection.selected.sameLocalDay, true);
  assert.equal(selection.ranked.find((item) => item.id === "tile-off-day-clear").sameLocalDay, false);
});

test("visual source selection stays available when the route has no paired analysis layer", () => {
  const observation = new Date("2026-04-03T10:00:00.000Z");
  const result = selectVisualSourceCandidate(
    [
      {
        layerId: "modis-terra-truecolor",
        label: "MODIS Terra true color",
        sensor: "MODIS",
        platform: "Terra",
        nominalObservationHour: 9.0,
        defaultPriority: 4,
        visualQuality: {
          cloudLikeRatio: 0.18,
          clearViewScore: 0.82,
        },
      },
      {
        layerId: "viirs-noaa21-truecolor",
        label: "VIIRS NOAA-21 true color",
        sensor: "VIIRS",
        platform: "NOAA-21",
        nominalObservationHour: 13.5,
        defaultPriority: 1,
        visualQuality: {
          cloudLikeRatio: 0.24,
          clearViewScore: 0.74,
        },
      },
    ],
    null,
    observation
  );

  assert.equal(result.selected.layerId, "modis-terra-truecolor");
  assert.ok(Number.isFinite(result.selected.alignment.score));
});

test("MODIS 250m supplement is limited to wildfire scenes with a valid bbox", () => {
  assert.equal(
    shouldSearchModis250mSupplement({
      type: "wildfire",
      imageryProfile: { bbox: [100, 10, 101, 11] },
    }),
    true
  );
  assert.equal(
    shouldSearchModis250mSupplement({
      type: "dust",
      imageryProfile: { bbox: [100, 10, 101, 11] },
    }),
    false
  );
  assert.equal(shouldSearchModis250mSupplement({ type: "wildfire", imageryProfile: { bbox: [100, 10] } }), false);
});

test("MODIS 250m supplement candidate prefers clearer same-resolution imagery near task time", () => {
  const selection = selectModis250mSupplementCandidate(
    [
      {
        layerId: "modis-terra-truecolor",
        label: "MODIS Terra True Color",
        sensor: "MODIS",
        platform: "Terra",
        nominalObservationHour: 9,
        spatialResolutionMeters: 250,
        defaultPriority: 4,
        visualQuality: { cloudLikeRatio: 0.08, clearViewScore: 0.88 },
      },
      {
        layerId: "modis-aqua-truecolor",
        label: "MODIS Aqua True Color",
        sensor: "MODIS",
        platform: "Aqua",
        nominalObservationHour: 13.5,
        spatialResolutionMeters: 250,
        defaultPriority: 5,
        visualQuality: { cloudLikeRatio: 0.42, clearViewScore: 0.48 },
      },
    ],
    new Date("2026-04-03T09:30:00.000Z")
  );

  assert.equal(selection.selected.layerId, "modis-terra-truecolor");
  assert.equal(selection.selected.spatialResolutionMeters, 250);
  assert.ok(selection.selected.selectionScore > selection.ranked[1].selectionScore);
});

test("visual source selection can prefer a clearer cross-platform image over a cloudier aligned layer", () => {
  const observation = new Date("2026-03-25T10:00:00.000Z");
  const analysisConfig = getAnalysisLayerConfig("modis-terra-aod-3km");
  const result = selectVisualSourceCandidate(
    [
      {
        layerId: "modis-terra-truecolor",
        label: "MODIS Terra 真彩色",
        sensor: "MODIS",
        platform: "Terra",
        nominalObservationHour: 9.0,
        defaultPriority: 4,
        visualQuality: {
          cloudLikeRatio: 0.68,
          clearViewScore: 0.26,
        },
      },
      {
        layerId: "viirs-noaa21-truecolor",
        label: "VIIRS NOAA-21 真彩色",
        sensor: "VIIRS",
        platform: "NOAA-21",
        nominalObservationHour: 13.5,
        defaultPriority: 1,
        visualQuality: {
          cloudLikeRatio: 0.12,
          clearViewScore: 0.88,
        },
      },
    ],
    analysisConfig,
    observation
  );

  assert.equal(result.selected.layerId, "viirs-noaa21-truecolor");
  assert.ok(result.selectionReason.includes("更清晰") || result.selectionReason.includes("更稳"));
});

test("pollution strict chain keeps the same satellite visual source", () => {
  const observation = new Date("2026-03-25T10:00:00.000Z");
  const analysisConfig = getAnalysisLayerConfig("modis-aqua-aod-3km");
  const ordered = prioritizeImageryLayerIds(["modis-terra-truecolor", "modis-aqua-truecolor"], analysisConfig);
  const result = selectVisualSourceCandidate(
    [
      {
        layerId: "modis-terra-truecolor",
        label: "MODIS Terra True Color",
        sensor: "MODIS",
        platform: "Terra",
        nominalObservationHour: 9,
        defaultPriority: 4,
        visualQuality: { cloudLikeRatio: 0.08, clearViewScore: 0.94 },
      },
      {
        layerId: "modis-aqua-truecolor",
        label: "MODIS Aqua True Color",
        sensor: "MODIS",
        platform: "Aqua",
        nominalObservationHour: 13.5,
        defaultPriority: 5,
        visualQuality: { cloudLikeRatio: 0.62, clearViewScore: 0.32 },
      },
    ],
    analysisConfig,
    observation
  );

  assert.deepEqual(ordered, ["modis-aqua-truecolor"]);
  assert.equal(result.selected.layerId, "modis-aqua-truecolor");
});

test("visual cloud-mask product follows the selected visual source when visual suppression is enabled", () => {
  const productId = resolvePreferredCloudMaskProductId(
    {
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA21",
    },
    {
      preferredCloudMaskProductId: "MOD35_L2",
      applyVisualCloudSuppression: true,
    }
  );

  assert.equal(productId, "CLDMSK_L2_VIIRS_NOAA21");
});

test("pollution strict chain keeps the cloud mask on the analysis satellite", () => {
  const productId = resolvePreferredCloudMaskProductId(
    {
      preferredCloudMaskProductId: "MOD35_L2",
    },
    getAnalysisLayerConfig("viirs-noaa20-aod-dark-target-land-ocean")
  );

  assert.equal(productId, "CLDMSK_L2_VIIRS_NOAA20");
});

test("dust strict chain keeps the same satellite visual source", () => {
  const observation = new Date("2026-03-25T10:00:00.000Z");
  const analysisConfig = getAnalysisLayerConfig("viirs-snpp-deep-blue-dust-aot");
  const ordered = prioritizeImageryLayerIds(["viirs-noaa20-truecolor", "viirs-snpp-truecolor"], analysisConfig);
  const result = selectVisualSourceCandidate(
    [
      {
        layerId: "viirs-noaa20-truecolor",
        label: "VIIRS NOAA-20 True Color",
        sensor: "VIIRS",
        platform: "NOAA-20",
        nominalObservationHour: 13.5,
        defaultPriority: 2,
        visualQuality: { cloudLikeRatio: 0.05, clearViewScore: 0.95 },
      },
      {
        layerId: "viirs-snpp-truecolor",
        label: "VIIRS SNPP True Color",
        sensor: "VIIRS",
        platform: "SNPP",
        nominalObservationHour: 13.5,
        defaultPriority: 3,
        visualQuality: { cloudLikeRatio: 0.62, clearViewScore: 0.32 },
      },
    ],
    analysisConfig,
    observation
  );

  assert.deepEqual(ordered, ["viirs-snpp-truecolor"]);
  assert.equal(result.selected.layerId, "viirs-snpp-truecolor");
  assert.match(result.selectionReason, /严格卫星绑定/);
});

test("dust strict chain keeps cloud mask and support layers on the analysis satellite", () => {
  const snppConfig = getAnalysisLayerConfig("viirs-snpp-deep-blue-dust-aot");
  const noaa20Config = getAnalysisLayerConfig("viirs-noaa20-deep-blue-dust-aot");
  const airsConfig = getAnalysisLayerConfig("airs-aqua-dust-score-day-analysis");
  const terraConfig = getAnalysisLayerConfig("modis-terra-deep-blue-dust-aod");

  assert.equal(
    resolvePreferredCloudMaskProductId({ preferredCloudMaskProductId: "MOD35_L2" }, snppConfig),
    "CLDMSK_L2_VIIRS_SNPP"
  );
  assert.deepEqual(resolveDustSupportConfigs(snppConfig).map((config) => config.platform), ["SNPP"]);
  assert.deepEqual(resolveDustSupportConfigs(noaa20Config).map((config) => config.platform), ["NOAA-20"]);
  assert.deepEqual(resolveDustSupportConfigs(airsConfig).map((config) => config.platform), ["Aqua"]);
  assert.deepEqual(resolveDustScreeningConfigs(snppConfig), []);
  assert.deepEqual(resolveDustScreeningConfigs(terraConfig).map((config) => config.platform), ["Terra"]);
});

test("thermal strict chain keeps SNPP visual source and cloud mask", () => {
  const observation = new Date("2026-03-25T10:00:00.000Z");
  const analysisConfig = getAnalysisLayerConfig("viirs-snpp-thermal-anomalies-375m");
  const ordered = prioritizeImageryLayerIds(["viirs-noaa21-truecolor", "viirs-snpp-truecolor"], analysisConfig);
  const result = selectVisualSourceCandidate(
    [
      {
        layerId: "viirs-noaa21-truecolor",
        label: "VIIRS NOAA-21 True Color",
        sensor: "VIIRS",
        platform: "NOAA-21",
        nominalObservationHour: 13.5,
        defaultPriority: 1,
        visualQuality: { cloudLikeRatio: 0.03, clearViewScore: 0.96 },
      },
      {
        layerId: "viirs-snpp-truecolor",
        label: "VIIRS SNPP True Color",
        sensor: "VIIRS",
        platform: "SNPP",
        nominalObservationHour: 13.5,
        defaultPriority: 3,
        visualQuality: { cloudLikeRatio: 0.62, clearViewScore: 0.32 },
      },
    ],
    analysisConfig,
    observation
  );

  assert.deepEqual(ordered, ["viirs-snpp-truecolor"]);
  assert.equal(result.selected.layerId, "viirs-snpp-truecolor");
  assert.equal(
    resolvePreferredCloudMaskProductId({ preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA21" }, analysisConfig),
    "CLDMSK_L2_VIIRS_SNPP"
  );
});

test("visual source quality summary scores cloudy thumbnails lower than clear textured thumbnails", () => {
  const cloudy = summarizeVisualSourceQuality({
    width: 3,
    height: 2,
    data: new Uint8ClampedArray([
      244, 244, 244, 255, 246, 246, 246, 255, 242, 242, 242, 255,
      245, 245, 245, 255, 243, 243, 243, 255, 247, 247, 247, 255,
    ]),
  });
  const clearer = summarizeVisualSourceQuality({
    width: 3,
    height: 2,
    data: new Uint8ClampedArray([
      88, 106, 124, 255, 176, 142, 96, 255, 62, 86, 112, 255,
      118, 136, 158, 255, 214, 168, 108, 255, 74, 96, 126, 255,
    ]),
  });

  assert.ok(cloudy.cloudLikeRatio > clearer.cloudLikeRatio);
  assert.ok(cloudy.clearViewScore < clearer.clearViewScore);
});

test("color map parser keeps numeric values from GIBS cloud guides", () => {
  const entries = parseColorMapEntries(`<?xml version="1.0"?>
    <ColorMap>
      <ColorMapEntry rgb="0,0,0" transparent="true" label="Fill" />
      <ColorMapEntry rgb="255,247,236" transparent="false" value="[0.0,0.01)" label="0.0 - 0.01" />
      <ColorMapEntry rgb="127,0,0" transparent="false" value="[0.99,1.0]" label="0.99 - 1.0" />
      <ColorMapEntry rgb="153,85,51" transparent="false" value="[1]" label="Dust" />
      <ColorMapEntry rgb="136,18,38" transparent="false" value="[500.0,+INF)" label="&gt;= 500.0" />
      <ColorMapEntry rgb="102,0,119" transparent="false" value="0" label="0 %" />
      <ColorMapEntry rgb="255,0,5" transparent="false" value="100" label="100 %" />
    </ColorMap>`);

  assert.equal(entries.length, 7);
  assert.equal(entries[1].value, 0.005);
  assert.equal(entries[2].value, 0.995);
  assert.equal(entries[3].value, 1);
  assert.equal(entries[4].value, 500);
  assert.equal(entries[5].value, 0);
  assert.equal(entries[6].value, 100);
});

test("official clear-sky confidence browse layer is converted into a cloud mask", () => {
  const entries = parseColorMapEntries(`<?xml version="1.0"?>
    <ColorMap>
      <ColorMapEntry rgb="255,247,236" transparent="false" value="[0.0,0.01)" label="0.0 - 0.01" />
      <ColorMapEntry rgb="127,0,0" transparent="false" value="[0.99,1.0]" label="0.99 - 1.0" />
    </ColorMap>`);
  const guide = buildCloudGuideMask(
    {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        255, 247, 236, 255,
        127, 0, 0, 255,
      ]),
    },
    entries,
    {
      valueKind: "clear-sky-confidence",
      probabilityThreshold: 0.38,
      distanceThreshold: 2,
    }
  );

  assert.equal(guide.mask[0], 1);
  assert.equal(guide.mask[1], 0);
  assert.ok(guide.meanCloudProbability > 0.45);
});

test("day-only cloud guide stays on the day layer even when the task hour is at night", () => {
  const config = resolveCloudGuideConfig(
    {
      cloudGuideLayerDay: "MODIS_Terra_Cloud_Fraction_Day",
      cloudGuideLayerNight: "MODIS_Terra_Cloud_Fraction_Night",
      cloudGuideColorMapId: "MODIS_Cloud_Fraction",
      cloudGuideValueKind: "cloud-fraction",
      cloudGuideSelectionMode: "day-only",
    },
    new Date("2026-03-07T21:00:00.000Z")
  );

  assert.equal(config.layer, "MODIS_Terra_Cloud_Fraction_Day");
  assert.equal(config.useNightLayer, false);
});

test("deep blue aerosol type browse layer yields a dust support mask", () => {
  const entries = parseColorMapEntries(`<?xml version="1.0"?>
    <ColorMap>
      <ColorMapEntry rgb="0,0,0" transparent="true" value="[0]" label="Fill" />
      <ColorMapEntry rgb="153,85,51" transparent="false" value="[1]" label="Dust" />
      <ColorMapEntry rgb="255,221,0" transparent="false" value="[6]" label="Mixed" />
      <ColorMapEntry rgb="217,217,217" transparent="false" value="[7]" label="Background" />
    </ColorMap>`);
  const support = buildCategoricalDustSupportMask(
    {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        153, 85, 51, 255,
        255, 221, 0, 255,
        217, 217, 217, 255,
      ]),
    },
    entries
  );

  assert.equal(support.mask[0], 1);
  assert.equal(support.mask[1], 1);
  assert.equal(support.mask[2], 0);
  assert.ok(support.meanProbability > 0.45);
});

test("airs dust score browse layer yields a strong support mask only for high dust-score colors", () => {
  const entries = parseColorMapEntries(`<?xml version="1.0"?>
    <ColorMap>
      <ColorMapEntry rgb="255,0,255" transparent="true" label="No Data" />
      <ColorMapEntry rgb="97,86,105" transparent="false" value="[400.0,400.4)" label="400.0 - 400.4" />
      <ColorMapEntry rgb="136,18,38" transparent="false" value="[500.0,+INF)" label="&gt;= 500.0" />
    </ColorMap>`);
  const support = buildContinuousDustSupportMask(
    {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        97, 86, 105, 255,
        136, 18, 38, 255,
      ]),
    },
    entries
  );

  assert.equal(support.mask[0], 0);
  assert.equal(support.mask[1], 1);
  assert.ok(support.meanProbability > 0.45);
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

test("official cloud guide can veto heuristic cloud suppression on clear pixels", () => {
  const imageData = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      250, 250, 250, 255,
      250, 250, 250, 255,
    ]),
  };
  const guideMaskResult = {
    mask: new Uint8Array([0, 1]),
    probabilities: Float32Array.from([0.05, 0.92]),
    matchedPixels: 2,
    maskedRatio: 0.5,
    sourceLabel: "official-guide",
  };

  const result = buildCloudSuppressionMask(imageData, {
    estimatedCoverage: 0.4,
    confidence: 0.8,
    guideMaskResult,
  });

  assert.equal(result.mask[0], 0);
  assert.equal(result.mask[1], 1);
  assert.equal(result.guideApplied, true);
});

test("cloud suppression keeps warm dust-like pixels while still masking bright clouds", () => {
  const imageData = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([
      248, 248, 248, 255,
      216, 168, 104, 255,
      238, 232, 224, 255,
    ]),
  };

  const result = buildCloudSuppressionMask(imageData, {
    estimatedCoverage: 0.52,
    confidence: 0.82,
  });

  assert.equal(result.mask[0], 1);
  assert.equal(result.mask[1], 0);
  assert.equal(result.mask[2], 1);
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
    { sensor: "MODIS", platform: "Terra", nominalObservationHour: 9.0 },
    { sensor: "MODIS", platform: "Terra", nominalObservationHour: 9.0 },
    observation
  );
  const misaligned = buildObservationAlignment(
    { sensor: "VIIRS", platform: "NOAA-21", nominalObservationHour: 13.5 },
    { sensor: "MODIS", platform: "Terra", nominalObservationHour: 9.0 },
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

test("dust soft fallback stays available for broad weak plumes with high upper-tail scores", () => {
  const dust = assessDetectionReliability({
    analysisConfig: getAnalysisLayerConfig("modis-terra-aod-3km"),
    taskType: "dust",
    scoreValues: [0.26, 0.28, 0.29, 0.31, 0.33, 0.35, 0.36, 0.37, 0.39, 0.41, 0.43, 0.45],
    validPixelRatio: 0.86,
    cloudSuppressedRatio: 0.14,
    legendMatchedRatio: 0.22,
    dustSupportRatio: 0.08,
    components: [],
    threshold: 0.42,
    largestComponentRatio: 0,
  });

  assert.equal(dust.allowMarking, true);
  assert.equal(dust.allowWindowFallback, true);
  assert.ok(dust.confidence >= 0.28);
});

test("dust official support ratio can keep weak plumes eligible for fallback", () => {
  const dust = assessDetectionReliability({
    analysisConfig: getAnalysisLayerConfig("modis-terra-aod-3km"),
    taskType: "dust",
    scoreValues: [0.26, 0.28, 0.29, 0.31, 0.33, 0.35, 0.36, 0.37, 0.39, 0.41],
    validPixelRatio: 0.84,
    cloudSuppressedRatio: 0.16,
    legendMatchedRatio: 0.04,
    dustSupportRatio: 0.11,
    components: [],
    threshold: 0.39,
    largestComponentRatio: 0,
  });

  assert.equal(dust.allowWindowFallback, true);
  assert.ok(dust.confidence >= 0.32);
});

test("thermal hotspot reliability allows conservative fallback for narrow-spectrum hotspot rasters", () => {
  const reliability = assessDetectionReliability({
    analysisConfig: getAnalysisLayerConfig("viirs-snpp-thermal-anomalies-375m"),
    taskType: "wildfire",
    scoreValues: [0.752, 0.753, 0.754, 0.756, 0.757, 0.758, 0.759, 0.761, 0.762, 0.773],
    validPixelRatio: 0.492,
    cloudSuppressedRatio: 0.62,
    legendMatchedRatio: 0,
    components: [],
    threshold: 0.772,
    largestComponentRatio: 0,
  });

  assert.equal(reliability.allowMarking, true);
  assert.equal(reliability.allowWindowFallback, true);
  assert.ok(reliability.reasons.includes("score_contrast_low"));
  assert.ok(reliability.reasons.includes("peak_not_separated"));
});

test("categorical screening mask recognizes water pixels from the official land-water colormap", () => {
  const screening = buildCategoricalScreeningMask(
    {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        168, 248, 255, 255, 122, 87, 6, 255,
        168, 248, 255, 255, 0, 0, 0, 0,
      ]),
    },
    [
      { r: 122, g: 87, b: 6, label: "Land", transparent: true },
      { r: 168, g: 248, b: 255, label: "Water", transparent: false },
      { r: 0, g: 0, b: 0, label: "No Data", transparent: true },
    ],
    {
      screeningKind: "water-mask",
    }
  );

  assert.equal(screening.maskedPixels, 2);
  assert.deepEqual(Array.from(screening.mask), [1, 0, 1, 0]);
});

test("dust roi builder screens lake-like blobs before they become anomaly rois", () => {
  const width = 8;
  const height = 8;
  const data = new Uint8ClampedArray(width * height * 4);
  const setPixel = (x, y, r, g, b, a = 255) => {
    const offset = (y * width + x) * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(x, y, 30, 48, 90);
    }
  }

  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      setPixel(x, y, 210, 54, 40);
    }
  }

  for (let y = 1; y <= 5; y += 1) {
    setPixel(6, y, 210, 54, 40);
  }

  const scenario = {
    type: "dust",
    baseAnomalyDensity: 0.72,
    baseCloudCover: 0.18,
    analysisProfile: {
      layerId: "modis-terra-aod-3km",
      percentile: 0.72,
      maxRois: 3,
      minComponentPixels: 2,
      prefix: "dust-roi-",
    },
  };
  const legendPalette = [
    { r: 30, g: 48, b: 90 },
    { r: 120, g: 108, b: 72 },
    { r: 210, g: 54, b: 40 },
  ];
  const waterMask = new Uint8Array(width * height);
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      waterMask[y * width + x] = 1;
    }
  }

  const detected = buildRois(
    {
      width,
      height,
      data,
    },
    scenario,
    {
      legendPalette,
      dustScreeningResult: {
        screeningKind: "water-mask",
        matchedPixels: width * height,
        mask: waterMask,
        sourceLabel: "MODIS Terra Land/Water Mask",
      },
    }
  );

  assert.ok(detected.rois.length >= 1);
  assert.ok(detected.rois.every((roi) => roi.box.left >= 60));
  assert.equal(detected.dustScreeningApplied, true);
  assert.ok(detected.dustScreenedRatio > 0.1);
});

test("thermal hotspot roi builder falls back to conservative windows when hotspot pixels stay disconnected", () => {
  const width = 24;
  const height = 24;
  const data = new Uint8ClampedArray(width * height * 4);
  const setPixel = (x, y, r, g, b, a = 255) => {
    const offset = (y * width + x) * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  };

  const hotspotPixels = [
    [3, 4, 255, 142, 42],
    [7, 6, 255, 120, 10],
    [10, 9, 255, 104, 0],
    [14, 11, 255, 132, 24],
    [17, 14, 255, 156, 58],
    [5, 16, 255, 110, 0],
    [12, 18, 255, 126, 18],
    [18, 19, 255, 148, 46],
  ];

  hotspotPixels.forEach(([x, y, r, g, b]) => setPixel(x, y, r, g, b));

  const detected = buildRois(
    {
      width,
      height,
      data,
    },
    {
      type: "wildfire",
      baseAnomalyDensity: 0.34,
      baseCloudCover: 0.24,
      analysisProfile: {
        layerId: "viirs-snpp-thermal-anomalies-375m",
        percentile: 0.5,
        maxRois: 4,
        minComponentPixels: 200,
        prefix: "thermal-hotspot-",
        allowWindowFallback: true,
      },
    },
    {
      cloudMaskResult: {
        estimatedCoverage: 0.62,
      },
    }
  );

  assert.ok(detected.rois.length >= 1);
  assert.equal(detected.fallbackUsed, true);
  assert.equal(detected.abstained, false);
  assert.equal(detected.reliability.allowWindowFallback, true);
  assert.ok(detected.rois.every((roi) => roi.detectionMode === "thermal-window-fallback"));
});

test("dust fallback routing stays enabled when broad weak components should be downgraded to windows", () => {
  const reliability = assessDetectionReliability({
    analysisConfig: getAnalysisLayerConfig("modis-terra-aod-3km"),
    taskType: "dust",
    scoreValues: [0.36, 0.37, 0.38, 0.4, 0.42, 0.44, 0.45, 0.47, 0.48, 0.49],
    validPixelRatio: 0.91,
    cloudSuppressedRatio: 0.18,
    legendMatchedRatio: 0.31,
    components: [{ pixelCount: 180, meanScore: 0.46 }],
    threshold: 0.455,
    largestComponentRatio: 0.74,
  });

  assert.equal(reliability.allowWindowFallback, true);
  assert.ok(reliability.reasons.includes("component_too_broad"));
  assert.equal(
    shouldRouteToWindowFallback({
      taskType: "dust",
      componentCount: 1,
      allowWindowFallback: true,
      reliability,
    }),
    true
  );
});

test("wildfire fallback routing stays enabled for low-contrast thermal hotspot fragments", () => {
  assert.equal(
    shouldRouteToWindowFallback({
      taskType: "wildfire",
      componentCount: 4,
      allowWindowFallback: true,
      reliability: {
        confidence: 0.42,
        allowMarking: false,
        allowWindowFallback: true,
        reasons: ["score_contrast_low", "peak_not_separated"],
      },
    }),
    true
  );
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
