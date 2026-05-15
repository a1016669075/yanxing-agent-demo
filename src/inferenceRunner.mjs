function fail(message, code = "invalid_inference_context") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isOfficialHazeModel(modelId = "") {
  return modelId.startsWith("official-") && modelId.endsWith("-haze-aod");
}

function isOfficialSatelliteDustModel(modelId = "") {
  return [
    "official-airs-aqua-dust-score",
    "official-viirs-snpp-deep-blue-dust",
    "official-viirs-noaa20-deep-blue-dust",
    "official-modis-terra-deep-blue-dust",
  ].includes(modelId);
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
  } else if (
    top.id === "official-aod-connected-components" ||
    isOfficialHazeModel(top.id) ||
    isOfficialSatelliteDustModel(top.id) ||
    top.id === "official-deep-blue-dust-identification" ||
    top.id === "official-thermal-hotspot-clustering"
  ) {
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
        : isOfficialHazeModel(top.id)
          ? `调用 ${top.label} 生成同卫星雾霾识别结果`
        : isOfficialSatelliteDustModel(top.id)
          ? `调用 ${top.label} 生成同卫星沙尘识别结果`
        : top.id === "official-deep-blue-dust-identification"
          ? "调用当前尺度绑定的 AIRS / VIIRS / MODIS Deep Blue 沙尘识别链生成结果"
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
