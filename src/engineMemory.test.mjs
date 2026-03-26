import test from "node:test";
import assert from "node:assert/strict";

import { createMemory, findRelevantEpisodes, runAgentMission } from "./engine.mjs";

const scenario = {
  id: "memory-case",
  baseScenarioId: "urban-plume",
  title: "经验回写测试场景",
  type: "pollution",
  mission: "验证智能体会不会把执行经验沉淀为可复用案例。",
  sensor: "VIIRS / MODIS",
  cloudCover: 0.24,
  radiometricQuality: 0.74,
  anomalyDensity: 0.68,
  bandwidthBudgetMb: 20,
  rois: [
    { id: "R1", risk: 0.88, signal: 0.78, cloud: 0.12 },
    { id: "R2", risk: 0.72, signal: 0.69, cloud: 0.18 },
  ],
  observation: {
    iso: "2026-03-25T08:00:00.000Z",
    dateValue: "2026-03-25",
    hour: 8,
  },
  imagery: {
    sourceLabel: "VIIRS NOAA-21 真彩图",
  },
  analysis: {
    sourceLabel: "AOD 异常先验",
    summary: "已完成异常筛查",
  },
  focusSelection: {
    label: "珠三角案例区",
    scaleLabel: "区域尺度",
    scaleKey: "regional",
    strategyText: "先筛查，再把高风险子区送入连续反演。",
    cacheKey: "focus-demo",
    bbox: [111.2, 21.4, 116.4, 24.8],
  },
};

test("runAgentMission 会把案例级经验写回 memory", () => {
  const run = runAgentMission(
    scenario,
    {
      budgetMin: 7,
      powerMode: "balanced",
      downlinkPolicy: "focused",
    },
    createMemory(),
    { taskId: "pollution" }
  );

  assert.equal(run.memory.episodes.length, 1);
  assert.equal(run.episode.taskId, "pollution");
  assert.equal(run.episode.scenarioId, "memory-case");
  assert.equal(run.episode.baseScenarioId, "urban-plume");
  assert.equal(run.episode.focusSelection.scaleKey, "regional");
  assert.equal(run.episode.observation.dateValue, "2026-03-25");
  assert.match(run.episode.insight, /连续反演|输出|修复|降级/);
});

test("findRelevantEpisodes 会优先返回同任务同尺度的经验案例", () => {
  const memory = {
    rules: [],
    episodes: [
      {
        id: "1",
        recordedAt: "2026-03-25T08:00:00.000Z",
        taskId: "pollution",
        scenarioType: "pollution",
        scenarioTitle: "相似案例",
        outputProduct: "quantitative-retrieval",
        confidence: 79,
        success: true,
        insight: "相似案例成功完成连续反演。",
        focusSelection: { scaleKey: "regional", label: "区域案例" },
      },
      {
        id: "2",
        recordedAt: "2026-03-25T07:00:00.000Z",
        taskId: "dust",
        scenarioType: "dust",
        scenarioTitle: "不相似案例",
        outputProduct: "anomaly-heatmap",
        confidence: 61,
        success: true,
        insight: "不相似案例。",
        focusSelection: { scaleKey: "continental", label: "洲际案例" },
      },
    ],
  };

  const episodes = findRelevantEpisodes(memory, {
    taskId: "pollution",
    scenarioType: "pollution",
    scaleKey: "regional",
    limit: 2,
  });

  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].id, "1");
  assert.equal(episodes[0].relevanceScore > 0, true);
});

test("runAgentMission returns an empty heatmap result when no stable anomaly candidates exist", () => {
  const emptyScenario = {
    ...scenario,
    id: "memory-case-empty",
    rois: [],
    analysis: {
      ...scenario.analysis,
      summary: "当前未识别到稳定异常候选区。",
    },
  };

  const run = runAgentMission(
    emptyScenario,
    {
      budgetMin: 7,
      powerMode: "balanced",
      downlinkPolicy: "focused",
    },
    createMemory(),
    { taskId: "pollution" }
  );

  assert.equal(run.result.success, true);
  assert.equal(run.result.state.outputProduct, "anomaly-heatmap");
  assert.equal(run.result.metrics.processedRois, 0);
  assert.equal(run.result.metrics.confidence, 0);
});

test("runAgentMission does not force a top-1 anomaly when ROI confidence is too weak", () => {
  const weakScenario = {
    ...scenario,
    id: "memory-case-weak",
    rois: [{ id: "R1", risk: 0.46, signal: 0.38, cloud: 0.24, detectionConfidence: 0.32 }],
    analysis: {
      ...scenario.analysis,
      summary: "当前异常分数分离度过低，系统已保守地取消异常标记。",
      abstained: true,
      abstentionReason: "当前异常分数分离度过低，系统已保守地取消异常标记。",
    },
  };

  const run = runAgentMission(
    weakScenario,
    {
      budgetMin: 7,
      powerMode: "balanced",
      downlinkPolicy: "focused",
    },
    createMemory(),
    { taskId: "pollution" }
  );

  assert.equal(run.result.success, true);
  assert.equal(run.result.state.outputProduct, "anomaly-heatmap");
  assert.equal(run.result.metrics.processedRois, 0);
  assert.ok(Array.isArray(run.result.state.notes));
  assert.ok(run.result.state.notes.length >= 1);
});

test("runAgentMission uses thermal hotspot map for wildfire tasks", () => {
  const run = runAgentMission(
    {
      ...scenario,
      id: "wildfire-case",
      type: "wildfire",
      title: "热异常确认场景",
      mission: "验证热异常任务会走热点确认链路。",
      sensor: "VIIRS SNPP 热异常 / 真彩协同观测",
      rois: [{ id: "R1", risk: 0.92, signal: 0.84, cloud: 0.08 }],
      analysis: {
        sourceLabel: "VIIRS SNPP 热异常 375m",
        summary: "已完成热异常热点确认。",
      },
    },
    {
      budgetMin: 6,
      powerMode: "balanced",
      downlinkPolicy: "focused",
    },
    createMemory(),
    { taskId: "wildfire" }
  );

  assert.equal(run.plan.workflowId, "wildfire_hotspot_confirmation");
  assert.equal(run.result.success, true);
  assert.equal(run.result.state.outputProduct, "thermal-hotspot-map");
  assert.equal(run.result.metrics.processedRois, 1);
});
