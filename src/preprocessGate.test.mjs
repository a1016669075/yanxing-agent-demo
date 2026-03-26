import test from "node:test";
import assert from "node:assert/strict";

import { evaluatePreprocessGate } from "./preprocessGate.mjs";

const scenario = {
  cloudCover: 0.42,
  radiometricQuality: 0.69,
  analysis: {
    validPixelRatio: 0.64,
    alignment: { score: 0.88 },
    decloudApplied: true,
  },
};

test("有稳定去云有效区时允许进入推理", () => {
  const result = evaluatePreprocessGate({
    scenario,
    cloudMaskResult: { itemCount: 3, confidence: 0.78, estimatedCoverage: 0.38 },
    threshold: 0.45,
  });

  assert.equal(result.state, "ready");
  assert.equal(result.decloudApplied, true);
});

test("缺少稳定有效像元时阻断定量反演", () => {
  const result = evaluatePreprocessGate({
    scenario: {
      cloudCover: 0.62,
      radiometricQuality: 0.58,
      analysis: {
        validPixelRatio: 0.18,
        alignment: { score: 0.84 },
        decloudApplied: true,
      },
    },
    cloudMaskResult: { itemCount: 0, confidence: 0, estimatedCoverage: 0 },
    threshold: 0.45,
  });

  assert.equal(result.state, "blocked");
});

test("时间或平台对齐偏弱时给出告警", () => {
  const result = evaluatePreprocessGate({
    scenario: {
      ...scenario,
      analysis: {
        validPixelRatio: 0.58,
        alignment: { score: 0.44 },
        decloudApplied: true,
      },
    },
    cloudMaskResult: { itemCount: 1, confidence: 0.6, estimatedCoverage: 0.32 },
    threshold: 0.45,
  });

  assert.equal(result.state, "warn");
  assert.equal(result.alignmentScore, 0.44);
});

test("热异常任务在门禁阻断时仍保留热点确认链路语义", () => {
  const result = evaluatePreprocessGate({
    scenario: {
      type: "wildfire",
      cloudCover: 0.68,
      radiometricQuality: 0.44,
      analysis: {
        productKind: "thermal-hotspot",
        validPixelRatio: 0.14,
        alignment: { score: 0.52 },
        decloudApplied: true,
      },
    },
    cloudMaskResult: { itemCount: 1, confidence: 0.62, estimatedCoverage: 0.64 },
    threshold: 0.45,
  });

  assert.equal(result.state, "blocked");
  assert.match(result.label, /热点确认/);
  assert.match(result.recommendedAction, /热点确认结果/);
});

test("保守拒识场景会在门禁中提示保留空结果", () => {
  const result = evaluatePreprocessGate({
    scenario: {
      cloudCover: 0.24,
      radiometricQuality: 0.73,
      analysis: {
        validPixelRatio: 0.76,
        alignment: { score: 0.91 },
        decloudApplied: true,
        abstained: true,
        abstentionReason: "当前异常分数分离度过低，系统已保守地取消异常标记。",
      },
    },
    cloudMaskResult: { itemCount: 2, confidence: 0.74, estimatedCoverage: 0.18 },
    threshold: 0.45,
  });

  assert.equal(result.state, "warn");
  assert.match(result.label, /空结果/);
  assert.match(result.recommendedAction, /空结果|热区占位/);
  assert.ok(result.reasons.some((reason) => /取消异常标记/.test(reason)));
});
