import test from "node:test";
import assert from "node:assert/strict";

import { buildOperationalResultInterpretation } from "./resultInterpretation.mjs";

function buildAgentRun({
  outputProduct,
  confidence,
  processedRois,
  budgetUsage,
  powerUsage,
  repairs = [],
  fastMode = false,
  success = true,
}) {
  return {
    result: {
      success,
      metrics: {
        confidence,
        processedRois,
        budgetUsage,
        powerUsage,
      },
      state: {
        outputProduct,
        repairs,
        flags: {
          fastMode,
        },
      },
    },
  };
}

test("连续反演结果会说明可信度来源和原型边界", () => {
  const snapshot = buildOperationalResultInterpretation({
    task: {
      category: "大气异常",
    },
    gate: {
      validPixelRatio: 0.78,
      effectiveQuality: 0.72,
      maskFiles: 2,
      maskConfidence: 0.84,
    },
    agentRun: buildAgentRun({
      outputProduct: "quantitative-retrieval",
      confidence: 76,
      processedRois: 3,
      budgetUsage: 88,
      powerUsage: 74,
    }),
    baselineRun: {
      success: false,
      metrics: {
        confidence: 0,
        budgetUsage: 22,
        powerUsage: 18,
      },
    },
  });

  assert.equal(snapshot.metric.title, "结果边界");
  assert.equal(snapshot.metric.strong, "连续反演原型");
  assert.match(snapshot.metric.detail, /不宣称最终高精度物理量/);
  assert.equal(snapshot.notes.length, 4);
  assert.match(snapshot.notes[0].detail, /固定流程在关键步骤前就失败/);
  assert.match(snapshot.notes[1].detail, /去云后有效区域 78%/);
  assert.match(snapshot.notes[1].detail, /官方云掩膜文件/);
  assert.match(snapshot.notes[2].detail, /连续反演\/强度估计原型/);
});

test("热区降级结果会强调非定量边界和主动降级动作", () => {
  const snapshot = buildOperationalResultInterpretation({
    task: {
      category: "大气异常",
    },
    gate: {
      validPixelRatio: 0.54,
      effectiveQuality: 0.46,
      maskFiles: 0,
      maskConfidence: 0,
    },
    agentRun: buildAgentRun({
      outputProduct: "anomaly-heatmap",
      confidence: 59,
      processedRois: 2,
      budgetUsage: 34,
      powerUsage: 28,
      repairs: [{ type: "downgrade" }],
    }),
    baselineRun: {
      success: true,
      metrics: {
        confidence: 55,
        budgetUsage: 41,
        powerUsage: 33,
      },
    },
  });

  assert.equal(snapshot.metric.strong, "异常热区结果");
  assert.match(snapshot.metric.detail, /不代表连续物理量反演/);
  assert.match(snapshot.notes[1].detail, /谨慎解读/);
  assert.match(snapshot.notes[1].detail, /当前没有检索到官方云掩膜文件/);
  assert.match(snapshot.notes[2].detail, /不应按高精度定量产品去解读/);
  assert.match(snapshot.notes[3].detail, /主动从定量反演退回到异常热区输出/);
});

test("热异常热点图会明确说明热点确认边界", () => {
  const snapshot = buildOperationalResultInterpretation({
    task: {
      category: "热异常",
    },
    gate: {
      validPixelRatio: 0.63,
      effectiveQuality: 0.61,
      maskFiles: 1,
      maskConfidence: 0.72,
    },
    agentRun: buildAgentRun({
      outputProduct: "thermal-hotspot-map",
      confidence: 74,
      processedRois: 2,
      budgetUsage: 31,
      powerUsage: 26,
    }),
    baselineRun: {
      success: true,
      metrics: {
        confidence: 66,
        budgetUsage: 40,
        powerUsage: 35,
      },
    },
  });

  assert.equal(snapshot.metric.strong, "热异常热点图");
  assert.match(snapshot.metric.detail, /不代表火强/);
  assert.match(snapshot.notes[2].detail, /热点确认产品/);
  assert.match(snapshot.notes[3].detail, /官方热异常热点确认链路/);
});
