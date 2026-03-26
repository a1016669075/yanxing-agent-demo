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

test("图层配置中心默认配置可通过校验", () => {
  const result = validateLayerCatalog(layerCatalog);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("默认底图与分析层可从配置中心读取", () => {
  const imagery = getImageryLayerConfig(DEFAULT_DAILY_IMAGERY_IDS[0]);
  const analysis = getAnalysisLayerConfig(DEFAULT_ANALYSIS_LAYER_ID);

  assert.equal(imagery.provider, "NASA GIBS");
  assert.equal(analysis.task, "大气异常提取");
  assert.ok(analysis.legendUrl.includes("gibs"));
});

test("热异常分析层允许使用无图例的官方热点产品", () => {
  const analysis = getAnalysisLayerConfig("viirs-snpp-thermal-anomalies-375m");

  assert.equal(analysis.renderMode, "thermal-hotspot");
  assert.equal(analysis.legendRequired, false);
});

test("配置中心统计包含版本信息，便于追溯", () => {
  const summary = summarizeLayerCatalog(layerCatalog);

  assert.equal(summary.version, layerCatalog.version);
  assert.ok(summary.imageryCount >= 4);
  assert.ok(summary.analysisCount >= 1);
});

test("新增图层配置无需改核心逻辑即可被纳入统计", () => {
  const customCatalog = {
    ...layerCatalog,
    imageryLayers: [
      ...layerCatalog.imageryLayers,
      {
        id: "landsat-9-truecolor",
        layer: "LANDSAT_9_CorrectedReflectance_TrueColor",
        label: "Landsat 9 真彩色",
        sensor: "OLI-2",
        platform: "Landsat 9",
        provider: "NASA GIBS",
        cadence: "daily",
        description: "测试新增图层是否能被配置中心直接识别。",
      },
    ],
  };

  const result = validateLayerCatalog(customCatalog);
  const summary = summarizeLayerCatalog(customCatalog);

  assert.equal(result.ok, true);
  assert.equal(summary.imageryCount, layerCatalog.imageryLayers.length + 1);
});

test("缺少关键字段时会 fail-fast", () => {
  const brokenCatalog = {
    ...layerCatalog,
    imageryLayers: [
      {
        id: "broken",
        label: "缺字段图层",
      },
    ],
    analysisLayers: layerCatalog.analysisLayers,
  };

  const result = validateLayerCatalog(brokenCatalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("缺少字段"));
});
