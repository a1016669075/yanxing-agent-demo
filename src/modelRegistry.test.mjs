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

test("推荐逻辑会优先返回本地可用的连续反演模型", () => {
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

  assert.equal(recommended[0].id, "local-aod-inversion-net");
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
