function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function evaluatePreprocessGate({ scenario, cloudMaskResult, threshold = 0.45 }) {
  const analysis = scenario?.analysis || {};
  const isThermalHotspot =
    scenario?.type === "wildfire" || analysis?.productKind === "thermal-hotspot";
  const maskSource = cloudMaskResult || analysis.cloudMask || null;
  const maskFiles = maskSource?.itemCount || 0;
  const maskConfidence = maskSource?.confidence ?? 0;
  const observedValidPixelRatio = Number(analysis.validPixelRatio);
  const alignmentScore = Number(analysis.alignment?.score);
  const decloudApplied = isThermalHotspot ? analysis.decloudApplied !== false : Boolean(analysis.decloudApplied);
  const abstained = Boolean(analysis.abstained);

  const cloudRatio = clamp(
    Number.isFinite(observedValidPixelRatio)
      ? (1 - observedValidPixelRatio) * 0.86 +
          (maskSource?.estimatedCoverage ?? 0) * 0.1 +
          threshold * 0.04
      : scenario.cloudCover * 0.72 + (maskSource?.estimatedCoverage ?? 0) * 0.22 + threshold * 0.08,
    0.05,
    0.96
  );

  const validPixelRatio = clamp(
    Number.isFinite(observedValidPixelRatio) ? observedValidPixelRatio : 1 - cloudRatio * 0.88,
    0.04,
    0.98
  );

  const effectiveQuality = clamp(
    scenario.radiometricQuality * 0.68 +
      validPixelRatio * 0.22 +
      (Number.isFinite(alignmentScore) ? alignmentScore : 0.55) * 0.1 -
      threshold * 0.05,
    0.08,
    0.98
  );

  let state = "ready";
  let label = isThermalHotspot ? "可进入热点确认" : "可进入推理";
  let recommendedAction = isThermalHotspot ? "按热点确认链路继续" : "按默认流程继续";
  const reasons = [];
  const validWarnThreshold = isThermalHotspot ? 0.22 : 0.35;
  const validBlockThreshold = isThermalHotspot ? 0.15 : 0.22;
  const alignmentWarnThreshold = isThermalHotspot ? 0.46 : 0.58;
  const qualityWarnThreshold = isThermalHotspot ? 0.36 : 0.48;
  const radiometricWarnThreshold = isThermalHotspot ? 0.42 : 0.56;

  if (!maskFiles) {
    reasons.push("当前没有检索到官方云掩膜文件");
  }
  if (!decloudApplied && scenario.cloudCover > (isThermalHotspot ? 0.58 : 0.45)) {
    reasons.push("异常提取尚未形成稳定的去云有效区域");
  }
  if (cloudRatio > 0.5) {
    reasons.push("估计云覆盖偏高");
  }
  if (validPixelRatio < validWarnThreshold) {
    reasons.push("去云后的有效像元比例偏低");
  }
  if (Number.isFinite(alignmentScore) && alignmentScore < alignmentWarnThreshold) {
    reasons.push("底图与分析层仍存在时间或平台错位风险");
  }
  if (scenario.radiometricQuality < radiometricWarnThreshold) {
    reasons.push("辐射质量本身偏低");
  }
  if (abstained) {
    reasons.push(analysis.abstentionReason || "当前专题层未形成稳定异常候选区");
  }

  if (
    validPixelRatio < validBlockThreshold ||
    (!decloudApplied && !maskFiles && scenario.cloudCover > (isThermalHotspot ? 0.74 : 0.52))
  ) {
    state = "blocked";
    label = isThermalHotspot ? "建议仅保留热点确认" : "建议阻断定量反演";
    recommendedAction = isThermalHotspot ? "继续生成热点确认结果，但应暂停深度复核链路" : "回退为热区产品，或等待更优观测";
  } else if (
    cloudRatio >= 0.5 ||
    effectiveQuality < qualityWarnThreshold ||
    validPixelRatio < validWarnThreshold ||
    (Number.isFinite(alignmentScore) && alignmentScore < alignmentWarnThreshold) ||
    abstained
  ) {
    state = "warn";
    label = abstained
      ? isThermalHotspot
        ? "建议保留空热点图"
        : "建议保留空结果"
      : isThermalHotspot
        ? "建议谨慎解释热点图"
        : "建议降级或先清洗";
    recommendedAction = abstained
      ? isThermalHotspot
        ? "当前更适合返回无告警热点图，并等待更可靠观测后再复核"
        : "当前更适合返回空结果或热区占位，不应强行进入连续反演"
      : isThermalHotspot
        ? "可继续生成热点图，但建议把结果作为复核入口而非最终结论"
        : "先完成去云和对齐，再决定是否进入连续反演";
  }

  return {
    state,
    label,
    recommendedAction,
    threshold,
    maskFiles,
    maskConfidence,
    decloudApplied,
    alignmentScore: Number.isFinite(alignmentScore) ? Math.round(alignmentScore * 100) / 100 : null,
    cloudRatio: Math.round(cloudRatio * 100) / 100,
    validPixelRatio: Math.round(validPixelRatio * 100) / 100,
    effectiveQuality: Math.round(effectiveQuality * 100) / 100,
    reasons,
  };
}
