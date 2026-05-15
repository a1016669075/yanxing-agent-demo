import test from "node:test";
import assert from "node:assert/strict";

import { buildInferenceExecutionPlan, summarizeInferenceRun } from "./inferenceRunner.mjs";

test("本地模型可用时优先使用 python_local", () => {
  const plan = buildInferenceExecutionPlan({
    recommendedModels: [
      {
        id: "local-aod-inversion-net",
        label: "本地连续反演网络",
        runtimeStatus: { state: "ready" },
      },
    ],
    preprocessGate: { state: "ready" },
  });

  assert.equal(plan.runner, "python_local");
});

test("预处理阻断时应降级为热区输出", () => {
  const plan = buildInferenceExecutionPlan({
    recommendedModels: [
      {
        id: "local-aod-inversion-net",
        label: "本地连续反演网络",
        runtimeStatus: { state: "ready" },
      },
    ],
    preprocessGate: { state: "blocked" },
  });

  assert.equal(plan.runner, "degraded_heatmap");
});

test("热异常任务即使门禁阻断也应保留规则型热点确认", () => {
  const plan = buildInferenceExecutionPlan({
    recommendedModels: [
      {
        id: "official-thermal-hotspot-clustering",
        label: "官方热异常热点簇提取",
        runtimeStatus: { state: "ready" },
      },
    ],
    preprocessGate: { state: "blocked" },
    taskType: "wildfire",
  });

  assert.equal(plan.runner, "rule_based");
  assert.match(plan.recommendedAction, /热点确认图/);
});

test("沙尘任务可路由到 Deep Blue 官方识别链", () => {
  const plan = buildInferenceExecutionPlan({
    recommendedModels: [
      {
        id: "official-deep-blue-dust-identification",
        label: "官方 Deep Blue 沙尘识别",
        runtimeStatus: { state: "ready" },
      },
    ],
    preprocessGate: { state: "ready" },
    taskType: "dust",
  });

  assert.equal(plan.runner, "rule_based");
  assert.match(plan.recommendedAction, /Deep Blue/);
});

test("沙尘任务可路由到同卫星官方识别模型", () => {
  const plan = buildInferenceExecutionPlan({
    recommendedModels: [
      {
        id: "official-viirs-snpp-deep-blue-dust",
        label: "VIIRS SNPP Deep Blue dust model",
        runtimeStatus: { state: "ready" },
      },
    ],
    preprocessGate: { state: "ready" },
    taskType: "dust",
  });

  assert.equal(plan.runner, "rule_based");
  assert.match(plan.recommendedAction, /同卫星沙尘/);
});

test("推理摘要会保留耗时与输出类型", () => {
  const summary = summarizeInferenceRun({
    plan: { runner: "rule_based" },
    elapsedMs: 128.6,
    roiCount: 3,
    fallbackUsed: true,
    outputProduct: "anomaly-heatmap",
  });

  assert.equal(summary.elapsedMs, 129);
  assert.equal(summary.outputProduct, "anomaly-heatmap");
});
test("pollution task routes to the selected satellite haze model", () => {
  const plan = buildInferenceExecutionPlan({
    recommendedModels: [
      {
        id: "official-viirs-noaa20-haze-aod",
        label: "VIIRS NOAA-20 AOD haze model",
        runtimeStatus: { state: "ready" },
      },
    ],
    preprocessGate: { state: "ready" },
    taskType: "pollution",
  });

  assert.equal(plan.runner, "rule_based");
  assert.match(plan.recommendedAction, /NOAA-20/);
});
