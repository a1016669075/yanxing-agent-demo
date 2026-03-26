function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isSentinel2Feature(feature) {
  return /^sentinel-2-/i.test(String(feature?.collection || ""));
}

export function buildS2CloudlessEstimate({ scenario, stacResult, threshold = 0.45 }) {
  const candidates = (stacResult?.features || []).filter(isSentinel2Feature).slice(0, 4);

  if (!candidates.length) {
    return {
      strategy: "s2cloudless",
      state: "unavailable",
      label: "需要 Sentinel-2 数据",
      threshold,
      itemCount: 0,
      meanCloudProbability: null,
      maskCoverage: null,
      confidence: 0,
      selectedItems: [],
      reasons: ["当前 STAC 结果里没有可用于 s2cloudless 的 Sentinel-2 项。"],
      recommendedAction: "先切到 Copernicus 或 Earth Search 的 Sentinel-2 collection 再运行。",
    };
  }

  const probabilities = candidates.map((feature) => {
    const cloudCover = Number(feature.properties?.["eo:cloud_cover"]);
    const normalizedCloud = Number.isFinite(cloudCover) ? cloudCover / 100 : scenario.cloudCover;
    return clamp(
      normalizedCloud * 0.76 + (1 - scenario.radiometricQuality) * 0.17 + threshold * 0.07,
      0.02,
      0.98
    );
  });

  const meanCloudProbability =
    probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
  const maskCoverage = clamp(meanCloudProbability * 0.91 + scenario.cloudCover * 0.09, 0.02, 0.99);
  const confidence = clamp(
    0.72 + candidates.length * 0.04 - Math.abs(threshold - 0.45) * 0.25,
    0.35,
    0.94
  );

  let state = "ready";
  let label = "可生成 Sentinel-2 云概率";
  let recommendedAction = "可将该结果作为高分辨率云掩膜候选，接入后续精细预处理。";
  const reasons = [`命中 ${candidates.length} 个 Sentinel-2 候选项。`];

  if (maskCoverage > threshold + 0.18) {
    state = "warn";
    label = "云覆盖偏高";
    recommendedAction = "优先保留高云概率区掩膜，再决定是否降级或改用粗分辨率链路。";
    reasons.push("估计云概率与覆盖度都偏高。");
  }

  return {
    strategy: "s2cloudless",
    state,
    label,
    threshold,
    itemCount: candidates.length,
    meanCloudProbability: round(meanCloudProbability),
    maskCoverage: round(maskCoverage),
    confidence: round(confidence),
    selectedItems: candidates.map((feature) => feature.id),
    reasons,
    recommendedAction,
  };
}
