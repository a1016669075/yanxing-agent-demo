function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isFmaskSupported(feature) {
  const collection = String(feature?.collection || "").toLowerCase();
  return collection.includes("landsat") || collection.includes("sentinel-2-l1c");
}

export function buildFmaskEstimate({ scenario, stacResult, threshold = 0.35 }) {
  const candidates = (stacResult?.features || []).filter(isFmaskSupported).slice(0, 4);
  if (!candidates.length) {
    return {
      strategy: "fmask",
      state: "unavailable",
      label: "需要 Landsat 或 Sentinel-2 L1C",
      threshold,
      itemCount: 0,
      cloudShadowCoverage: null,
      confidence: 0,
      selectedItems: [],
      reasons: ["当前结果里没有适合走 Fmask 的原始光学产品。"],
      recommendedAction: "优先补齐 Sentinel-2 L1C 或 Landsat 输入，再使用 Fmask 做云影识别。",
    };
  }

  const twilightPenalty = scenario.observation?.hour <= 7 || scenario.observation?.hour >= 17 ? 0.12 : 0;
  const cloudShadowCoverage = clamp(
    scenario.cloudCover * 0.58 + (1 - scenario.radiometricQuality) * 0.21 + twilightPenalty + threshold * 0.12,
    0.04,
    0.96
  );
  const confidence = clamp(0.68 + candidates.length * 0.04 - twilightPenalty * 0.8, 0.32, 0.9);

  let state = "ready";
  let label = "可执行 Fmask 预处理";
  let recommendedAction = "适合在重云影或低太阳高度场景下补一层更保守的云影掩膜。";
  const reasons = [`命中 ${candidates.length} 个可用原始光学产品。`];

  if (cloudShadowCoverage > threshold + 0.16) {
    state = "warn";
    label = "云影风险偏高";
    recommendedAction = "建议先走 Fmask 云影筛查，再决定是否进入精细反演。";
    reasons.push("当前时刻存在较明显的云影或暮光风险。");
  }

  return {
    strategy: "fmask",
    state,
    label,
    threshold,
    itemCount: candidates.length,
    cloudShadowCoverage: round(cloudShadowCoverage),
    confidence: round(confidence),
    selectedItems: candidates.map((feature) => feature.id),
    reasons,
    recommendedAction,
  };
}
