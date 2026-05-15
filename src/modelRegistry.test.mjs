import test from "node:test";
import assert from "node:assert/strict";

import {
  getModelById,
  modelRegistry,
  recommendModels,
  summarizeModelRegistry,
  validateModelRegistry,
} from "./modelRegistry.mjs";

test("模型注册表结构校验默认通过", () => {
  const validation = validateModelRegistry();
  assert.equal(validation.ok, true);
});

test("缺少关键字段的模型会被 fail-fast 捕获", () => {
  const validation = validateModelRegistry([
    {
      id: "broken",
      label: "",
      version: "1.0.0",
      runtime: "browser",
      tasks: [],
      sensorHints: [],
      scaleRangeMeters: [1000, 500],
    },
  ]);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.length >= 1);
});

test("沙尘任务优先返回官方 Deep Blue 沙尘识别链", () => {
  const recommended = recommendModels(
    {
      taskType: "dust",
      sensorText: "VIIRS NOAA-21 / MODIS Terra 协同观测",
      scaleMeters: 1000,
      radiometricQuality: 0.72,
      staticPredictionAvailable: false,
    },
    {
      "local-aod-inversion-net": {
        available: true,
        cuda: true,
      },
      "static-scene-prediction": {
        available: false,
      },
    }
  );

  assert.equal(recommended[0].id, "official-deep-blue-dust-identification");
  assert.equal(recommended[0].runtimeStatus.state, "ready");
});

test("静态预测可用时会被纳入推荐前列", () => {
  const recommended = recommendModels(
    {
      taskType: "pollution",
      sensorText: "VIIRS NOAA-21 / MODIS Terra 协同观测",
      scaleMeters: 1000,
      radiometricQuality: 0.55,
      staticPredictionAvailable: true,
    },
    {
      "local-aod-inversion-net": {
        available: false,
        reason: "checkpoint_missing",
      },
      "static-scene-prediction": {
        available: true,
      },
    }
  );

  assert.ok(["static-scene-prediction", "official-aod-connected-components"].includes(recommended[0].id));
});

test("热异常任务会优先推荐官方热点簇提取模型", () => {
  const recommended = recommendModels(
    {
      taskType: "wildfire",
      sensorText: "VIIRS SNPP 热异常 / 真彩协同观测",
      scaleMeters: 375,
      radiometricQuality: 0.62,
      staticPredictionAvailable: false,
    },
    {}
  );

  assert.equal(recommended[0].id, "official-thermal-hotspot-clustering");
  assert.equal(recommended[0].runtimeStatus.state, "ready");
});

test("可以按 id 读取模型元信息", () => {
  const model = getModelById("official-aod-connected-components");
  assert.equal(model?.runtime, "browser");
});

test("模型注册表摘要会返回总数和 runtime 分布", () => {
  const summary = summarizeModelRegistry(modelRegistry);
  assert.equal(summary.total, modelRegistry.length);
  assert.ok(summary.runtimes.browser >= 1);
});
test("pollution recommendation follows the selected satellite analysis layer", () => {
  const recommended = recommendModels(
    {
      taskType: "pollution",
      analysisLayerId: "modis-aqua-aod-3km",
      sensorText: "MODIS Aqua AOD 3km",
      scaleMeters: 1000,
      radiometricQuality: 0.69,
      staticPredictionAvailable: true,
    },
    {
      "static-scene-prediction": {
        available: true,
      },
    }
  );

  assert.equal(recommended[0].id, "official-modis-aqua-haze-aod");
});

test("dust recommendation follows the selected satellite analysis layer", () => {
  const recommended = recommendModels(
    {
      taskType: "dust",
      analysisLayerId: "viirs-noaa20-deep-blue-dust-aot",
      sensorText: "VIIRS NOAA-20 Deep Blue AOT",
      scaleMeters: 1000,
      radiometricQuality: 0.69,
      staticPredictionAvailable: false,
    },
    {}
  );

  assert.equal(recommended[0].id, "official-viirs-noaa20-deep-blue-dust");
});

test("wildfire recommendation follows the selected thermal analysis layer", () => {
  const recommended = recommendModels(
    {
      taskType: "wildfire",
      analysisLayerId: "viirs-snpp-thermal-anomalies-375m",
      sensorText: "VIIRS SNPP Thermal Anomalies",
      scaleMeters: 375,
      radiometricQuality: 0.74,
      staticPredictionAvailable: false,
    },
    {}
  );

  assert.equal(recommended[0].id, "official-thermal-hotspot-clustering");
  assert.equal(recommended[0].analysisLayerId, "viirs-snpp-thermal-anomalies-375m");
});
