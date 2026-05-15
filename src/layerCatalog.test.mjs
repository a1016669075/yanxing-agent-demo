import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ANALYSIS_LAYER_ID,
  DEFAULT_DAILY_IMAGERY_IDS,
  getAnalysisLayerConfig,
  getImageryLayerConfig,
  layerCatalog,
  summarizeLayerCatalog,
  validateLayerCatalog,
} from "./layerCatalog.mjs";

test("layer catalog passes validation", () => {
  const result = validateLayerCatalog(layerCatalog);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("default imagery and analysis configs are readable", () => {
  const imagery = getImageryLayerConfig(DEFAULT_DAILY_IMAGERY_IDS[0]);
  const analysis = getAnalysisLayerConfig(DEFAULT_ANALYSIS_LAYER_ID);

  assert.equal(imagery.provider, "NASA GIBS");
  assert.equal(analysis.task, "大气异常提取");
  assert.ok(analysis.legendUrl.includes("gibs"));
});

test("pollution analysis catalog includes non-Terra AOD layers", () => {
  const omi = getAnalysisLayerConfig("omi-aerosol-optical-depth");
  const viirsNoaa21 = getAnalysisLayerConfig("viirs-noaa21-aod-dark-target-land-ocean");
  const viirsNoaa20 = getAnalysisLayerConfig("viirs-noaa20-aod-dark-target-land-ocean");
  const viirsSnpp = getAnalysisLayerConfig("viirs-snpp-aod-dark-target-land-ocean");
  const modisAqua = getAnalysisLayerConfig("modis-aqua-aod-3km");

  assert.equal(DEFAULT_ANALYSIS_LAYER_ID, "modis-terra-aod-3km");
  assert.equal(omi.platform, "Aura");
  assert.equal(viirsNoaa21.sensor, "VIIRS");
  assert.equal(viirsNoaa20.preferredCloudMaskProductId, "CLDMSK_L2_VIIRS_NOAA20");
  assert.equal(viirsSnpp.cloudGuideColorMapId, "VIIRS_Clear_Sky_Confidence");
  assert.equal(modisAqua.preferredCloudMaskProductId, "MYD35_L2");
});

test("thermal hotspot analysis keeps the no-legend exception", () => {
  const analysis = getAnalysisLayerConfig("viirs-snpp-thermal-anomalies-375m");

  assert.equal(analysis.renderMode, "thermal-hotspot");
  assert.equal(analysis.legendRequired, false);
  assert.equal(analysis.cloudGuideSelectionMode, "day-only");
  assert.equal(analysis.strictSatelliteBinding, true);
  assert.equal(analysis.strictImageryLayerId, "viirs-snpp-truecolor");
  assert.equal(analysis.strictCloudMaskProductId, "CLDMSK_L2_VIIRS_SNPP");
  assert.equal(analysis.thermalModelId, "official-thermal-hotspot-clustering");
});

test("MODIS true-color imagery exposes 250m metadata for wildfire visual supplements", () => {
  const terra = getImageryLayerConfig("modis-terra-truecolor");
  const aqua = getImageryLayerConfig("modis-aqua-truecolor");

  assert.equal(terra.spatialResolutionMeters, 250);
  assert.equal(terra.resolutionLabel, "250m");
  assert.equal(aqua.spatialResolutionMeters, 250);
  assert.equal(aqua.resolutionLabel, "250m");
});

test("AOD analysis layer exposes day-only cloud-guide selection and dust-support helpers", () => {
  const analysis = getAnalysisLayerConfig("modis-terra-aod-3km");

  assert.equal(analysis.cloudGuideSelectionMode, "day-only");
  assert.ok(Array.isArray(analysis.dustSupportLayers));
  assert.ok(Array.isArray(analysis.dustScreeningLayers));
  assert.ok(analysis.dustSupportLayers.some((entry) => entry.layer === "VIIRS_NOAA20_Aerosol_Type_Deep_Blue_Best_Estimate"));
  assert.ok(analysis.dustSupportLayers.some((entry) => entry.layer === "AIRS_L2_Dust_Score_Day"));
  assert.ok(analysis.dustScreeningLayers.some((entry) => entry.layer === "MODIS_Terra_L3_Land_Water_Mask"));
});

test("dust analysis catalog includes satellite-specific identification chains", () => {
  const airs = getAnalysisLayerConfig("airs-aqua-dust-score-day-analysis");
  const snpp = getAnalysisLayerConfig("viirs-snpp-deep-blue-dust-aot");
  const noaa20 = getAnalysisLayerConfig("viirs-noaa20-deep-blue-dust-aot");
  const modisTerra = getAnalysisLayerConfig("modis-terra-deep-blue-dust-aod");

  assert.equal(airs.layer, "AIRS_L2_Dust_Score_Day");
  assert.equal(airs.strictImageryLayerId, "modis-aqua-truecolor");
  assert.deepEqual(airs.dustSupportLayers.map((entry) => entry.platform), ["Aqua"]);
  assert.equal(snpp.dustSupportLayers[0].layer, "VIIRS_SNPP_Aerosol_Type_Deep_Blue_Best_Estimate");
  assert.equal(noaa20.dustSupportLayers[0].layer, "VIIRS_NOAA20_Aerosol_Type_Deep_Blue_Best_Estimate");
  assert.equal(modisTerra.layer, "MODIS_Terra_AOD_Deep_Blue_Combined");
  assert.equal(snpp.strictImageryLayerId, "viirs-snpp-truecolor");
  assert.equal(noaa20.strictImageryLayerId, "viirs-noaa20-truecolor");
  assert.equal(modisTerra.strictImageryLayerId, "modis-terra-truecolor");
  assert.deepEqual(modisTerra.dustSupportLayers, []);
  assert.deepEqual(modisTerra.dustScreeningLayers.map((entry) => entry.platform), ["Terra"]);
  assert.match(snpp.dustModelLabel, /SNPP/);
  assert.match(noaa20.dustModelLabel, /NOAA-20/);
});

test("summary includes catalog version and counts", () => {
  const summary = summarizeLayerCatalog(layerCatalog);

  assert.equal(summary.version, layerCatalog.version);
  assert.ok(summary.imageryCount >= 4);
  assert.ok(summary.analysisCount >= 1);
});

test("new imagery layers can be added without changing core catalog logic", () => {
  const customCatalog = {
    ...layerCatalog,
    imageryLayers: [
      ...layerCatalog.imageryLayers,
      {
        id: "landsat-9-truecolor",
        layer: "LANDSAT_9_CorrectedReflectance_TrueColor",
        label: "Landsat 9 True Color",
        sensor: "OLI-2",
        platform: "Landsat 9",
        provider: "NASA GIBS",
        cadence: "daily",
        description: "test layer",
      },
    ],
  };

  const result = validateLayerCatalog(customCatalog);
  const summary = summarizeLayerCatalog(customCatalog);

  assert.equal(result.ok, true);
  assert.equal(summary.imageryCount, layerCatalog.imageryLayers.length + 1);
});

test("validation fails fast when required fields are missing", () => {
  const brokenCatalog = {
    ...layerCatalog,
    imageryLayers: [
      {
        id: "broken",
        label: "broken layer",
      },
    ],
    analysisLayers: layerCatalog.analysisLayers,
  };

  const result = validateLayerCatalog(brokenCatalog);

  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 1);
});
