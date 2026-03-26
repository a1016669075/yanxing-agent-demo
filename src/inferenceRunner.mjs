function fail(message, code = "invalid_inference_context") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function buildInferenceExecutionPlan({ recommendedModels, preprocessGate, taskType = null }) {
  if (!Array.isArray(recommendedModels) || !recommendedModels.length) {
    fail("recommendedModels 不能为空。");
  }

  const top = recommendedModels[0];
  let runner = "rule_based";

  if (preprocessGate?.state === "blocked" && taskType !== "wildfire") {
    runner = "degraded_heatmap";
  } else if (top.id === "local-aod-inversion-net" && top.runtimeStatus?.state === "ready") {
    runner = "python_local";
  } else if (top.id === "static-scene-prediction" && top.runtimeStatus?.state !== "unavailable") {
    runner = "static_replay";
  } else if (top.id === "official-aod-connected-components" || top.id === "official-thermal-hotspot-clustering") {
    runner = "rule_based";
  }

  return {
    modelId: top.id,
    modelLabel: top.label,
    runner,
    recommendedAction:
      runner === "degraded_heatmap"
        ? "跳过定量反演，直接输出热区结果"
        : top.id === "official-thermal-hotspot-clustering"
          ? "使用官方热异常专题层继续生成热点确认图"
        : runner === "python_local"
          ? "调用本地 Python 连续反演模型"
          : runner === "static_replay"
            ? "优先回放已导出的静态预测"
            : "使用内置规则与官方 AOD 连通域结果继续推理",
  };
}

export function summarizeInferenceRun({ plan, elapsedMs, roiCount, fallbackUsed, outputProduct }) {
  return {
    plan,
    elapsedMs: Math.round(Number(elapsedMs) || 0),
    roiCount: Number(roiCount) || 0,
    fallbackUsed: Boolean(fallbackUsed),
    outputProduct: outputProduct || "unknown",
  };
}
