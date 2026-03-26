import {
  DEFAULT_DAILY_IMAGERY_IDS,
  getAnalysisLayerConfig,
  getImageryLayerConfig,
  layerCatalog,
} from "./layerCatalog.mjs";
import {
  buildOverlayPointsFromComponents,
  buildOverlayPointsFromRois,
  buildOverlayPointsFromScoreWindows,
} from "./anomalyOverlay.mjs";

const GIBS_WMS_URL = layerCatalog.services.gibsWmsUrl;
const STATIC_PREDICTIONS_URL = new URL("../assets/model-predictions/predictions.json", import.meta.url);
const LOCAL_GIBS_PROXY_PATH = "/api/gibs-proxy";
const GLOBAL_OVERVIEW_BBOX = [-180, -85, 180, 85];
const GLOBAL_OVERVIEW_WIDTH = 960;
const GLOBAL_OVERVIEW_HEIGHT = 480;
const GLOBAL_OVERVIEW_CACHE_LIMIT = 32;
const LAYER_PROBE_CACHE_LIMIT = 96;
const AUTO_CLOUD_MASK_CACHE_LIMIT = 48;
const ANALYSIS_LEGEND_CACHE_LIMIT = 12;
const ANALYSIS_VALID_REGION_KEY = "__validRegion";
let basemapProxyAvailability = "unknown";
const globalOverviewCache = new Map();
const autoCloudMaskCache = new Map();
const analysisLegendCache = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dayString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === 20;
}

function trimCache(cache, maxSize, preserveKey = null) {
  while (cache.size > maxSize) {
    const staleKey = cache.keys().next().value;
    if (!staleKey) {
      return;
    }
    if (preserveKey && staleKey === preserveKey && cache.size > 1) {
      const value = cache.get(staleKey);
      cache.delete(staleKey);
      cache.set(staleKey, value);
      continue;
    }
    cache.delete(staleKey);
  }
}

function normalizeAnalysisValidRegion(validRegion = null) {
  const width = Math.max(0, Number(validRegion?.width) || 0);
  const height = Math.max(0, Number(validRegion?.height) || 0);
  const expectedPixels = width * height;
  const rawValidMask = validRegion?.validMask;
  const rawCloudMask = validRegion?.cloudMask;
  const normalizeMask = (rawMask = null) => {
    if (rawMask instanceof Uint8Array && rawMask.length === expectedPixels) {
      return rawMask;
    }
    if (ArrayBuffer.isView(rawMask) && rawMask.byteLength === expectedPixels) {
      return Uint8Array.from(rawMask);
    }
    if (Array.isArray(rawMask) && rawMask.length === expectedPixels) {
      return Uint8Array.from(rawMask);
    }
    if (rawMask && typeof rawMask === "object") {
      const recovered = new Uint8Array(expectedPixels);
      let hasValue = false;
      for (let index = 0; index < expectedPixels; index += 1) {
        const value = Number(rawMask[index]);
        if (Number.isFinite(value)) {
          recovered[index] = value > 0 ? 1 : 0;
          hasValue = true;
        }
      }
      return hasValue ? recovered : null;
    }
    return null;
  };
  const validMask =
    normalizeMask(rawValidMask);
  const cloudMask = normalizeMask(rawCloudMask);

  if (!width || !height || !validMask) {
    return null;
  }

  return {
    width,
    height,
    validMask,
    cloudMask,
    source: validRegion?.source || "analysis-grid",
  };
}

function attachAnalysisValidRegion(analysis = null, validRegion = null) {
  if (!analysis) {
    return analysis;
  }

  const normalized = normalizeAnalysisValidRegion(validRegion);
  if (!normalized) {
    return analysis;
  }

  analysis.validRegion = normalized;
  Object.defineProperty(analysis, ANALYSIS_VALID_REGION_KEY, {
    value: normalized,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return analysis;
}

export function getAnalysisValidRegion(analysis = null) {
  return analysis?.[ANALYSIS_VALID_REGION_KEY] || normalizeAnalysisValidRegion(analysis?.validRegion) || null;
}

function inheritAnalysisValidRegion(targetAnalysis = null, sourceAnalysis = null) {
  return attachAnalysisValidRegion(targetAnalysis, getAnalysisValidRegion(sourceAnalysis));
}

function preserveScenarioAnalysisValidRegion(baseScenario = null, nextScenario = null) {
  if (nextScenario?.analysis && baseScenario?.analysis) {
    inheritAnalysisValidRegion(nextScenario.analysis, baseScenario.analysis);
  }
  return nextScenario;
}

function shouldUseLocalGibsProxy() {
  if (typeof window === "undefined") {
    return false;
  }

  const host = window.location.hostname;
  return (host === "localhost" || host === "127.0.0.1") && basemapProxyAvailability === "available";
}

function buildGetMapUrl({ layer, bbox, width, height, time, format, transparent }) {
  if (shouldUseLocalGibsProxy()) {
    const proxyQuery = new URLSearchParams({
      layer,
      bbox: bbox.join(","),
      width: String(width),
      height: String(height),
      time,
      format,
      transparent: transparent ? "true" : "false",
    });

    return `${LOCAL_GIBS_PROXY_PATH}?${proxyQuery.toString()}`;
  }

  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: layer,
    STYLES: "",
    FORMAT: format,
    TRANSPARENT: transparent ? "TRUE" : "FALSE",
    SRS: "EPSG:4326",
    WIDTH: String(width),
    HEIGHT: String(height),
    BBOX: bbox.join(","),
    TIME: time,
  });

  return `${GIBS_WMS_URL}?${params.toString()}`;
}

export async function fetchBasemapProxyStatus() {
  if (!shouldUseLocalGibsProxy()) {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    if (host !== "localhost" && host !== "127.0.0.1") {
      basemapProxyAvailability = "disabled";
      return {
        available: false,
        mode: "direct_fallback",
        reason: "static_environment",
      };
    }
  }

  try {
    const response = await fetch("/api/gibs-status");
    if (!response.ok) {
      basemapProxyAvailability = "unavailable";
      return {
        available: false,
        mode: "proxy_unreachable",
        reason: `status_${response.status}`,
      };
    }

    const payload = await response.json();
    basemapProxyAvailability = payload.available ? "available" : "unavailable";
    return payload;
  } catch {
    basemapProxyAvailability = "unavailable";
    return {
      available: false,
      mode: "proxy_unreachable",
      reason: "network_error",
    };
  }
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.floor(sorted.length * ratio), 0, sorted.length - 1);
  return sorted[index];
}

function componentScore(component) {
  return component.meanScore * (1 + Math.log(component.pixelCount + 1));
}

function scoreDistributionSummary(scoreValues = []) {
  if (!scoreValues.length) {
    return {
      median: 0,
      upper: 0,
      peak: 0,
      max: 0,
      contrast: 0,
      tailGain: 0,
    };
  }

  const median = percentile(scoreValues, 0.5);
  const upper = percentile(scoreValues, 0.82);
  const peak = percentile(scoreValues, 0.95);
  const max = percentile(scoreValues, 0.995);

  return {
    median: round(median, 3),
    upper: round(upper, 3),
    peak: round(peak, 3),
    max: round(max, 3),
    contrast: round(Math.max(0, peak - median), 3),
    tailGain: round(Math.max(0, max - upper), 3),
  };
}

function buildAbstentionReason(reasons = [], isThermalHotspot = false) {
  if (reasons.includes("no_reliable_pixels")) {
    return "专题层没有形成可靠有效像元，系统已取消异常标记。";
  }
  if (reasons.includes("cloud_suppression_heavy")) {
    return "云抑制区域过大，当前场景更适合返回空结果而不是强行标记异常。";
  }
  if (reasons.includes("score_contrast_low")) {
    return isThermalHotspot
      ? "热点信号与背景分离度过低，当前不宜确认热异常热点。"
      : "异常分数分离度过低，当前不宜继续标记候选异常区。";
  }
  if (reasons.includes("peak_not_separated")) {
    return "高值像元没有和背景稳定分离，系统已保守地取消异常标记。";
  }
  if (reasons.includes("legend_match_low")) {
    return "当前专题颜色与官方图例匹配不足，系统已避免基于不稳定色带进行异常标记。";
  }
  if (reasons.includes("component_too_broad")) {
    return "当前高值区域过于弥散，系统判断其更像背景扰动而不是稳定异常。";
  }
  return isThermalHotspot
      ? "当前未形成稳定热异常热点，系统保留空结果以避免虚假报警。"
      : "当前未形成稳定异常候选区，系统保留空结果以避免虚假报警。";
}

export function assessDetectionReliability({
  analysisConfig = {},
  taskType = "",
  scoreValues = [],
  validPixelRatio = 0,
  cloudSuppressedRatio = 0,
  legendMatchedRatio = 0,
  components = [],
  threshold = null,
  largestComponentRatio = 0,
}) {
  const isThermalHotspot = analysisConfig.renderMode === "thermal-hotspot";
  const isDust = taskType === "dust";
  const stats = scoreDistributionSummary(scoreValues);

  if (!scoreValues.length) {
    return {
      confidence: 0,
      allowMarking: false,
      allowWindowFallback: false,
      reasons: ["no_reliable_pixels"],
      stats,
      abstentionReason: buildAbstentionReason(["no_reliable_pixels"], isThermalHotspot),
    };
  }

  let confidence = isThermalHotspot ? 0.82 : isDust ? 0.8 : 0.78;
  const reasons = [];
  const thresholdMargin = Number.isFinite(threshold) ? stats.peak - threshold : stats.peak - stats.median;

  if (validPixelRatio < (isThermalHotspot ? 0.16 : isDust ? 0.18 : 0.24)) {
    confidence -= isThermalHotspot ? 0.2 : isDust ? 0.18 : 0.26;
    reasons.push("valid_pixels_low");
  }

  if (cloudSuppressedRatio > (isThermalHotspot ? 0.72 : isDust ? 0.64 : 0.56)) {
    confidence -= isThermalHotspot ? 0.14 : isDust ? 0.12 : 0.2;
    reasons.push("cloud_suppression_heavy");
  }

  if (stats.contrast < (isThermalHotspot ? 0.07 : isDust ? 0.055 : 0.08)) {
    confidence -= isDust ? 0.14 : 0.24;
    reasons.push("score_contrast_low");
  }

  if (thresholdMargin < (isThermalHotspot ? 0.03 : isDust ? 0.035 : 0.05)) {
    confidence -= isDust ? 0.1 : 0.16;
    reasons.push("peak_not_separated");
  }

  if (!isThermalHotspot && analysisConfig.legendRequired !== false && legendMatchedRatio < (isDust ? 0.04 : 0.06)) {
    confidence -= isDust ? 0.12 : 0.18;
    reasons.push("legend_match_low");
  }

  if (!isThermalHotspot && components.length && largestComponentRatio > (isDust ? 0.46 : 0.32)) {
    confidence -= isDust ? 0.08 : 0.14;
    reasons.push("component_too_broad");
  }

  if (!components.length) {
    confidence -= isDust ? 0.04 : 0.08;
  }

  confidence = clamp(confidence, 0, 0.98);

  const allowWindowFallback =
    !isThermalHotspot &&
    confidence >= (isDust ? 0.46 : 0.52) &&
    validPixelRatio >= (isDust ? 0.24 : 0.32) &&
    cloudSuppressedRatio <= (isDust ? 0.66 : 0.58) &&
    stats.contrast >= (isDust ? 0.06 : 0.09) &&
    thresholdMargin >= (isDust ? 0.035 : 0.05);
  const allowMarking = components.length ? confidence >= (isThermalHotspot ? 0.44 : isDust ? 0.44 : 0.5) : allowWindowFallback;

  return {
    confidence: round(confidence, 3),
    allowMarking,
    allowWindowFallback,
    reasons,
    stats,
    abstentionReason: allowMarking ? "" : buildAbstentionReason(reasons, isThermalHotspot),
  };
}

function componentDetectionConfidence(component, threshold, reliabilityConfidence, fallbackPenalty = 0) {
  const margin = Number.isFinite(threshold) ? component.meanScore - threshold : component.meanScore;
  const componentStrength = clamp(
    0.42 + Math.max(0, margin) * 1.7 + Math.log(component.pixelCount + 1) * 0.06,
    0.08,
    0.99
  );
  return round(clamp(reliabilityConfidence * 0.68 + componentStrength * 0.32 - fallbackPenalty, 0.08, 0.99), 3);
}

function rgbStats(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const warmness = clamp((r - b + 255) / 510, 0, 1);
  const colorfulness =
    Math.sqrt((r - g) ** 2 + (g - b) ** 2 + (b - r) ** 2) / (Math.sqrt(3) * 255);

  return { brightness, saturation, warmness, colorfulness };
}

function scorePixel(r, g, b, type) {
  const { brightness, saturation, warmness, colorfulness } = rgbStats(r, g, b);

  if (type === "dust") {
    return 0.42 * warmness + 0.28 * saturation + 0.18 * colorfulness + 0.12 * brightness;
  }

  if (type === "pollution") {
    return 0.24 * warmness + 0.34 * saturation + 0.28 * colorfulness + 0.14 * brightness;
  }

  if (type === "wildfire") {
    const redDominance = clamp((r - Math.max(g, b) + 255) / 510, 0, 1);
    const emberness = clamp((r + g - 2 * b + 510) / 1020, 0, 1);
    return 0.38 * redDominance + 0.24 * emberness + 0.2 * saturation + 0.1 * brightness + 0.08 * colorfulness;
  }

  return 0.28 * warmness + 0.28 * saturation + 0.28 * colorfulness + 0.16 * brightness;
}

function colorDistanceSq(left, right) {
  const dr = left.r - right.r;
  const dg = left.g - right.g;
  const db = left.b - right.b;
  return dr * dr + dg * dg + db * db;
}

function isNearWhite(color) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  return max >= 246 && max - min <= 8;
}

export function extractLegendPalette(
  imageData,
  { sampleRowRatios = [0.38, 0.5, 0.62], minAlpha = 18, maxColors = 24 } = {}
) {
  const { width, height, data } = imageData;
  const palette = [];

  for (let x = 0; x < width; x += 1) {
    let sample = null;

    for (const ratio of sampleRowRatios) {
      const y = clamp(Math.round((height - 1) * ratio), 0, Math.max(0, height - 1));
      const offset = (y * width + x) * 4;
      if ((data[offset + 3] || 0) < minAlpha) {
        continue;
      }

      const color = {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2],
      };
      if (isNearWhite(color)) {
        continue;
      }

      sample = color;
      break;
    }

    if (!sample) {
      continue;
    }

    const previous = palette[palette.length - 1];
    if (previous && colorDistanceSq(previous, sample) <= 36) {
      continue;
    }
    palette.push(sample);
  }

  const deduped = [];
  for (const color of palette) {
    const last = deduped[deduped.length - 1];
    if (last && colorDistanceSq(last, color) <= 96) {
      continue;
    }
    deduped.push(color);
  }

  if (deduped.length <= maxColors) {
    return deduped;
  }

  const sampled = [];
  const stride = Math.max(1, Math.floor(deduped.length / maxColors));
  for (let index = 0; index < deduped.length; index += stride) {
    sampled.push(deduped[index]);
  }

  const tail = deduped[deduped.length - 1];
  const last = sampled[sampled.length - 1];
  if (!last || colorDistanceSq(last, tail) > 24) {
    sampled.push(tail);
  }

  return sampled.slice(0, maxColors);
}

export function scorePixelAgainstLegend(r, g, b, palette = []) {
  if (!Array.isArray(palette) || palette.length < 2) {
    return null;
  }

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  const target = { r, g, b };

  for (let index = 0; index < palette.length; index += 1) {
    const distance = colorDistanceSq(target, palette[index]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  const distance = Math.sqrt(bestDistance);
  const confidence = clamp(1 - distance / 160, 0, 1);

  return {
    matched: confidence >= 0.36,
    confidence: round(confidence, 3),
    score: round(bestIndex / Math.max(1, palette.length - 1), 3),
    distance: round(distance, 1),
  };
}

function imageryAlignmentPriority(imageryConfig, analysisConfig) {
  if (!analysisConfig) {
    return 0;
  }

  let score = 0;
  if (imageryConfig.sensor === analysisConfig.sensor) {
    score += 3;
  }
  if (imageryConfig.platform === analysisConfig.platform) {
    score += 5;
  }
  if (imageryConfig.cadence === analysisConfig.cadence) {
    score += 1;
  }
  return score;
}

export function prioritizeImageryLayerIds(layerIds = [], analysisConfig = null) {
  return [...new Set(layerIds.filter(Boolean))].sort((leftId, rightId) => {
    const left = getImageryLayerConfig(leftId);
    const right = getImageryLayerConfig(rightId);
    const scoreDiff = imageryAlignmentPriority(right, analysisConfig) - imageryAlignmentPriority(left, analysisConfig);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return (left.defaultPriority || 99) - (right.defaultPriority || 99);
  });
}

function nominalObservationHour(config = {}) {
  const value = Number(config.nominalObservationHour);
  return Number.isFinite(value) ? value : null;
}

export function buildObservationAlignment(visualSource = {}, analysisConfig = {}, observation = null) {
  const displayHour = nominalObservationHour(visualSource);
  const analysisHour = nominalObservationHour(analysisConfig);
  const taskHour = observation instanceof Date ? observation.getHours() : null;
  const sameSensor = Boolean(visualSource.sensor && visualSource.sensor === analysisConfig.sensor);
  const samePlatform = Boolean(visualSource.platform && visualSource.platform === analysisConfig.platform);

  let score = 0.45;
  if (sameSensor) {
    score += 0.22;
  }
  if (samePlatform) {
    score += 0.23;
  }
  if (displayHour !== null && analysisHour !== null) {
    score += Math.max(0, 0.18 - Math.abs(displayHour - analysisHour) * 0.03);
  }

  score = clamp(score, 0.18, 0.98);
  const exactAligned = sameSensor && samePlatform;
  const displayVsAnalysisHours =
    displayHour !== null && analysisHour !== null ? round(Math.abs(displayHour - analysisHour), 1) : null;
  const taskVsDisplayHours =
    taskHour !== null && displayHour !== null ? round(Math.abs(taskHour - displayHour), 1) : null;

  const label = exactAligned ? "同平台同日对齐" : sameSensor ? "同传感器近似对齐" : "跨平台日尺度对齐";
  const note = exactAligned
    ? "当前底图与异常分析层已优先对齐到同平台同日链路，可直接进行目视比对。"
    : "当前展示仍属于日尺度近似对齐，底图与分析层并非完全同平台，目视对比需要结合对齐提示理解。";

  return {
    label,
    score: round(score, 2),
    sameSensor,
    samePlatform,
    exactAligned,
    displayVsAnalysisHours,
    taskVsDisplayHours,
    note,
  };
}

function cloudScorePixel(r, g, b) {
  const { brightness, saturation, colorfulness } = rgbStats(r, g, b);
  const neutrality = clamp(1 - colorfulness, 0, 1);
  const blueLift = clamp((b - r + 255) / 510, 0, 1);
  return {
    brightness,
    saturation,
    neutrality,
    score: 0.54 * brightness + 0.24 * (1 - saturation) + 0.14 * neutrality + 0.08 * blueLift,
  };
}

export function buildCloudSuppressionMask(
  imageData,
  { estimatedCoverage = 0, confidence = 0 } = {}
) {
  const { width, height, data } = imageData;
  const rawMask = new Uint8Array(width * height);
  const candidateScores = [];
  let opaquePixels = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (data[offset + 3] < 8) {
      continue;
    }

    opaquePixels += 1;
    const sample = cloudScorePixel(data[offset], data[offset + 1], data[offset + 2]);
    candidateScores.push(sample.score);
  }

  if (!opaquePixels || !candidateScores.length) {
    return {
      mask: rawMask,
      maskedRatio: 0,
      threshold: null,
      applied: false,
    };
  }

  const percentileRatio = clamp(0.95 - estimatedCoverage * 0.28 - confidence * 0.06, 0.72, 0.97);
  const threshold = percentile(candidateScores, percentileRatio);
  let maskedCount = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (data[offset + 3] < 8) {
      continue;
    }

    const sample = cloudScorePixel(data[offset], data[offset + 1], data[offset + 2]);
    if (
      sample.score >= threshold &&
      sample.brightness >= 0.62 &&
      sample.saturation <= 0.34 &&
      sample.neutrality >= 0.42
    ) {
      rawMask[pixelIndex] = 1;
      maskedCount += 1;
    }
  }

  const mask = maskedCount && width >= 8 && height >= 8 ? closeMask(rawMask, width, height) : rawMask;
  const closedMaskedCount = mask.reduce((sum, value) => sum + value, 0);

  return {
    mask,
    maskedRatio: round(closedMaskedCount / Math.max(1, opaquePixels), 3),
    threshold: round(threshold, 3),
    applied: closedMaskedCount >= Math.max(1, opaquePixels * 0.01),
  };
}

export function buildDecloudPreviewImageData(
  imageData,
  cloudMask,
  { fillColor = { r: 8, g: 18, b: 26, a: 34 } } = {}
) {
  const { width, height, data } = imageData || {};
  const source = data instanceof Uint8ClampedArray ? data : null;
  const mask = cloudMask instanceof Uint8Array ? cloudMask : null;
  if (!width || !height || !source || !mask || mask.length !== width * height) {
    return null;
  }

  const preview = new Uint8ClampedArray(source);
  let maskedPixels = 0;

  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
    if (!mask[pixelIndex]) {
      continue;
    }
    const offset = pixelIndex * 4;
    preview[offset] = fillColor.r;
    preview[offset + 1] = fillColor.g;
    preview[offset + 2] = fillColor.b;
    preview[offset + 3] = fillColor.a;
    maskedPixels += 1;
  }

  return {
    imageData: {
      width,
      height,
      data: preview,
    },
    maskedPixels,
    maskedRatio: round(maskedPixels / Math.max(1, width * height), 3),
  };
}

function imageDataToDataUrl(imageData) {
  if (typeof document === "undefined" || !imageData?.width || !imageData?.height) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const frame = context.createImageData(imageData.width, imageData.height);
  frame.data.set(imageData.data);
  context.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/png");
}

function buildDecloudPreviewAsset(visualImageData, cloudSuppression) {
  if (!visualImageData || !cloudSuppression?.applied || !(cloudSuppression.mask instanceof Uint8Array)) {
    return null;
  }

  const preview = buildDecloudPreviewImageData(visualImageData, cloudSuppression.mask);
  if (!preview) {
    return null;
  }

  const src = imageDataToDataUrl(preview.imageData);
  if (!src) {
    return null;
  }

  return {
    src,
    maskedRatio: preview.maskedRatio,
    note: `该预览与异常检测共用同一套云抑制掩膜，约 ${Math.round(
      preview.maskedRatio * 100
    )}% 的像元被视为云并从展示图中剔除。`, 
  };
}

export function shouldApplyModelEnhancement(scenario) {
  const validPixelRatio = Number(scenario?.analysis?.validPixelRatio);
  const alignmentScore = Number(scenario?.analysis?.alignment?.score);
  const decloudApplied = scenario?.analysis?.decloudApplied !== false;

  if (Number.isFinite(validPixelRatio) && validPixelRatio < 0.32) {
    return {
      allow: false,
      reason: "去云后的有效像元不足，当前不宜让连续反演结果覆盖官方异常检测。",
    };
  }

  if (Number.isFinite(alignmentScore) && alignmentScore < 0.58) {
    return {
      allow: false,
      reason: "底图与分析层仍处于弱对齐状态，先保留官方异常检测结果更稳妥。",
    };
  }

  if (!decloudApplied && Number(scenario?.cloudCover) > 0.48) {
    return {
      allow: false,
      reason: "当前场景尚未形成稳定的去云有效区域，暂不启用连续反演覆盖。",
    };
  }

  return {
    allow: true,
    reason: "当前观测质量与对齐状态允许连续反演参与结果细化。",
  };
}

function buildThresholdMask(scores, validMask, threshold) {
  const mask = new Uint8Array(scores.length);
  let count = 0;

  for (let index = 0; index < scores.length; index += 1) {
    if (!validMask[index]) {
      continue;
    }
    if (scores[index] >= threshold) {
      mask[index] = 1;
      count += 1;
    }
  }

  return { mask, count };
}

function componentFootprint(component, width, height, validCount) {
  const boxWidth = component.maxX - component.minX + 1;
  const boxHeight = component.maxY - component.minY + 1;

  return {
    coverageRatio: component.pixelCount / Math.max(1, validCount),
    widthRatio: boxWidth / Math.max(1, width),
    heightRatio: boxHeight / Math.max(1, height),
  };
}

export function selectAdaptiveMask(
  scores,
  validMask,
  width,
  height,
  { percentileRatio = 0.84, baseThreshold = null, minComponentPixels = 1 } = {}
) {
  const scoreValues = [];
  for (let index = 0; index < scores.length; index += 1) {
    if (validMask[index]) {
      scoreValues.push(scores[index]);
    }
  }

  if (!scoreValues.length) {
    return {
      mask: new Uint8Array(scores.length),
      maskCount: 0,
      components: [],
      threshold: null,
      largestComponentRatio: 0,
      thresholdAdjusted: false,
    };
  }

  const resolvedBaseThreshold =
    baseThreshold === null || baseThreshold === undefined
      ? percentile(scoreValues, percentileRatio)
      : baseThreshold;
  const adaptiveThreshold = percentile(scoreValues, clamp(percentileRatio - 0.02, 0.78, 0.96));
  let threshold = Math.max(resolvedBaseThreshold, adaptiveThreshold);
  let lastSelection = {
    mask: new Uint8Array(scores.length),
    maskCount: 0,
    components: [],
    threshold: round(threshold, 3),
    largestComponentRatio: 0,
    thresholdAdjusted: false,
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = buildThresholdMask(scores, validMask, threshold);
    const mask =
      current.count && width >= 8 && height >= 8 ? closeMask(current.mask, width, height) : current.mask;
    const maskCount = mask.reduce((sum, value) => sum + value, 0);
    const components = extractComponents(mask, scores, width, height, minComponentPixels);
    const largest = components[0]
      ? componentFootprint(components[0], width, height, scoreValues.length)
      : { coverageRatio: 0, widthRatio: 0, heightRatio: 0 };

    lastSelection = {
      mask,
      maskCount,
      components,
      threshold: round(threshold, 3),
      largestComponentRatio: round(largest.coverageRatio, 3),
      thresholdAdjusted: round(threshold, 3) !== round(resolvedBaseThreshold, 3),
    };

    if (!components.length) {
      threshold = Math.max(resolvedBaseThreshold, threshold - 0.02);
      continue;
    }

    if (
      largest.coverageRatio <= 0.28 &&
      largest.widthRatio <= 0.45 &&
      largest.heightRatio <= 0.45
    ) {
      return lastSelection;
    }

    threshold = Math.min(0.99, threshold + 0.035);
  }

  return lastSelection;
}

async function loadImageData(url, width, height, { signal } = {}) {
  const response = await fetch(url, { mode: "cors", signal });
  if (!response.ok) {
    throw new Error(`璇锋眰澶辫触锛?{response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("杩斿洖鍐呭涓嶆槸鍥惧儚");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("鍥惧儚瑙ｇ爜澶辫触"));
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);

    return {
      imageData: context.getImageData(0, 0, width, height),
      contentType,
      size: blob.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function closeMask(mask, width, height) {
  const dilated = new Uint8Array(mask.length);
  const closed = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = 0;
      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (mask[ny * width + nx]) {
            active = 1;
          }
        }
      }
      dilated[y * width + x] = active;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let neighbors = 0;
      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          neighbors += dilated[ny * width + nx];
        }
      }
      closed[y * width + x] = neighbors >= 4 ? 1 : 0;
    }
  }

  return closed;
}

function extractComponents(mask, scores, width, height, minPixels) {
  const visited = new Uint8Array(mask.length);
  const components = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue;
    }

    const queue = [index];
    visited[index] = 1;

    let head = 0;
    let count = 0;
    let scoreSum = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const samples = [];

    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      scoreSum += scores[current];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (samples.length < 180 && (count === 1 || count % 5 === 0)) {
        samples.push({
          x,
          y,
          score: round(scores[current], 3),
        });
      }

      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const next = ny * width + nx;
          if (!mask[next] || visited[next]) {
            continue;
          }

          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    if (count < minPixels) {
      continue;
    }

    components.push({
      pixelCount: count,
      meanScore: scoreSum / count,
      minX,
      minY,
      maxX,
      maxY,
      samples,
    });
  }

  return components.sort((left, right) => componentScore(right) - componentScore(left));
}

function overlapArea(left, right) {
  const xOverlap = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX));
  const yOverlap = Math.max(0, Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY));
  return xOverlap * yOverlap;
}

export function fallbackWindows(scores, validMask, width, height, maxRois, prefix, options = {}) {
  const minMeanScore = Number(options.minMeanScore) || 0;
  const minPeakScore = Number(options.minPeakScore) || 0;
  const windows = [];
  const stepX = Math.max(24, Math.floor(width / 5));
  const stepY = Math.max(24, Math.floor(height / 5));

  for (let top = 0; top < height - stepY; top += Math.floor(stepY * 0.7)) {
    for (let left = 0; left < width - stepX; left += Math.floor(stepX * 0.7)) {
      let scoreSum = 0;
      let peakScore = 0;
      let valid = 0;
      for (let y = top; y < top + stepY; y += 1) {
        for (let x = left; x < left + stepX; x += 1) {
          const index = y * width + x;
          if (!validMask[index]) {
            continue;
          }
          scoreSum += scores[index];
          peakScore = Math.max(peakScore, scores[index]);
          valid += 1;
        }
      }

      if (!valid) {
        continue;
      }

      const meanScore = scoreSum / valid;
      if (meanScore < minMeanScore && peakScore < minPeakScore) {
        continue;
      }

      windows.push({
        pixelCount: valid,
        meanScore,
        minX: left,
        minY: top,
        maxX: left + stepX,
        maxY: top + stepY,
        score: meanScore * 0.65 + peakScore * 0.35,
      });
    }
  }

  const selected = [];
  for (const candidate of windows.sort((left, right) => componentScore(right) - componentScore(left))) {
    const overlaps = selected.some(
      (existing) => overlapArea(candidate, existing) > 0.35 * Math.min(candidate.pixelCount, existing.pixelCount)
    );
    if (overlaps) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= maxRois) {
      break;
    }
  }

  return selected.map((component, index) => toRoi(component, width, height, prefix, index));
}

function toRoi(component, width, height, prefix, index, metadata = {}) {
  const left = round((component.minX / width) * 100, 2);
  const top = round((component.minY / height) * 100, 2);
  const boxWidth = round(((component.maxX - component.minX + 1) / width) * 100, 2);
  const boxHeight = round(((component.maxY - component.minY + 1) / height) * 100, 2);
  const risk = clamp(0.48 + component.meanScore * 0.62, 0.42, 0.99);
  const signal = clamp(0.38 + component.meanScore * 0.56, 0.35, 0.96);

  return {
    id: `R${index + 1}`,
    name: `${prefix}${index + 1}`,
    risk: round(risk),
    signal: round(signal),
    detectionConfidence: round(
      clamp(
        Number.isFinite(Number(metadata.detectionConfidence))
          ? Number(metadata.detectionConfidence)
          : 0.42 + component.meanScore * 0.46,
        0.08,
        0.99
      ),
      3
    ),
    detectionMode: metadata.detectionMode || "component",
    cloud: round(clamp(0.12 + (1 - signal) * 0.35, 0.05, 0.62)),
    area: Math.max(60, Math.round(component.pixelCount * 0.8)),
    box: {
      left,
      top,
      width: clamp(boxWidth, 10, 55),
      height: clamp(boxHeight, 10, 55),
    },
  };
}

function estimateThermalValidPixelRatio(scenario, cloudMaskResult) {
  const estimatedCoverage = Number(cloudMaskResult?.estimatedCoverage);
  if (Number.isFinite(estimatedCoverage)) {
    return round(clamp(1 - estimatedCoverage * 0.82, 0.22, 0.96), 3);
  }

  const baselineCloud = Number(scenario?.baseCloudCover ?? scenario?.cloudCover);
  return round(clamp(1 - (Number.isFinite(baselineCloud) ? baselineCloud : 0.28) * 0.74, 0.22, 0.94), 3);
}

function detectionSummary(analysisConfig, rois, mode = "detected") {
  const label = analysisConfig?.label || "涓撻浜у搧";

  if (analysisConfig?.renderMode === "thermal-hotspot") {
    if (mode === "none") {
      return `基于 ${label} 当前未识别到稳定热异常热点。`;
    }
    return `基于 ${label} 自动确认到 ${rois.length} 个热异常热点簇。`;
  }

  if (mode === "fallback") {
    return `AOD 高值连通域不足，已回退到 ${rois.length} 个高分窗口。`;
  }

  return `基于 ${label} 自动提取到 ${rois.length} 个异常聚类。`;
}

function buildRois(
  imageData,
  scenario,
  { visualImageData = null, cloudMaskResult = null, legendPalette = null } = {}
) {
  const analysisConfig = getAnalysisLayerConfig(scenario.analysisProfile.layerId);
  const isThermalHotspot = analysisConfig.renderMode === "thermal-hotspot";
  const allowWindowFallback = scenario.analysisProfile.allowWindowFallback !== false;
  const { width, height, data } = imageData;
  const scores = new Float32Array(width * height);
  const validMask = new Uint8Array(width * height);
  const cloudSuppression =
    analysisConfig.applyVisualCloudSuppression !== false &&
    visualImageData &&
    visualImageData.width === width &&
    visualImageData.height === height
      ? buildCloudSuppressionMask(visualImageData, {
          estimatedCoverage: cloudMaskResult?.estimatedCoverage ?? 0,
          confidence: cloudMaskResult?.confidence ?? 0,
        })
      : {
          mask: new Uint8Array(width * height),
          maskedRatio: 0,
          threshold: null,
          applied: false,
        };
  const scoreValues = [];
  let opaquePixels = 0;
  let suppressedCloudPixels = 0;
  let legendMatchedPixels = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const alpha = data[offset + 3];
    if (alpha < 8) {
      continue;
    }

    opaquePixels += 1;
    if (cloudSuppression.mask[pixelIndex]) {
      suppressedCloudPixels += 1;
      continue;
    }

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const legendMatch = scorePixelAgainstLegend(r, g, b, legendPalette);
    const score = legendMatch?.matched ? legendMatch.score : scorePixel(r, g, b, scenario.type);

    scores[pixelIndex] = score;
    validMask[pixelIndex] = 1;
    scoreValues.push(score);
    if (legendMatch?.matched) {
      legendMatchedPixels += 1;
    }
  }

  if (!scoreValues.length) {
    const validPixelRatio = isThermalHotspot
      ? estimateThermalValidPixelRatio(scenario, cloudMaskResult)
      : round((opaquePixels - suppressedCloudPixels) / Math.max(1, opaquePixels), 3);
    const cloudSuppressedRatio = isThermalHotspot
      ? round(clamp(Number(cloudMaskResult?.estimatedCoverage) || scenario.baseCloudCover || 0, 0, 0.88), 3)
      : round(suppressedCloudPixels / Math.max(1, opaquePixels), 3);
    const reliability = assessDetectionReliability({
      analysisConfig,
      taskType: scenario.type,
      scoreValues,
      validPixelRatio,
      cloudSuppressedRatio,
      legendMatchedRatio: 0,
      components: [],
      threshold: null,
      largestComponentRatio: 0,
    });

    return {
      rois: [],
      anomalyDensity: scenario.anomalyDensity,
      fallbackUsed: false,
      overlayPoints: [],
      validRegion: {
        width,
        height,
        validMask,
        cloudMask: cloudSuppression.mask,
        source: "analysis-grid",
      },
      validPixelRatio,
      cloudSuppressedRatio,
      cloudSuppressionApplied: cloudSuppression.applied || Boolean(analysisConfig.cloudFilteredProduct),
      threshold: null,
      scoreMode: legendMatchedPixels > 0 ? "legend-calibrated" : "rgb-heuristic",
      legendMatchedRatio: 0,
      largestComponentRatio: 0,
      reliability,
      abstained: true,
      abstentionReason: reliability.abstentionReason,
      decloudPreview: buildDecloudPreviewAsset(visualImageData, cloudSuppression),
      summary: reliability.abstentionReason,
    };
  }

  const baseThreshold = percentile(scoreValues, scenario.analysisProfile.percentile);
  const adaptiveSelection = selectAdaptiveMask(scores, validMask, width, height, {
    percentileRatio: scenario.analysisProfile.percentile,
    baseThreshold,
    minComponentPixels: scenario.analysisProfile.minComponentPixels,
  });
  const components = adaptiveSelection.components;
  const validPixelRatio = isThermalHotspot
    ? estimateThermalValidPixelRatio(scenario, cloudMaskResult)
    : round(scoreValues.length / Math.max(1, opaquePixels), 3);
  const cloudSuppressedRatio = isThermalHotspot
    ? round(clamp(Number(cloudMaskResult?.estimatedCoverage) || scenario.baseCloudCover || 0, 0, 0.88), 3)
    : round(suppressedCloudPixels / Math.max(1, opaquePixels), 3);
  const legendMatchedRatio = round(legendMatchedPixels / Math.max(1, scoreValues.length), 3);
  const reliability = assessDetectionReliability({
    analysisConfig,
    taskType: scenario.type,
    scoreValues,
    validPixelRatio,
    cloudSuppressedRatio,
    legendMatchedRatio,
    components,
    threshold: adaptiveSelection.threshold ?? baseThreshold,
    largestComponentRatio: adaptiveSelection.largestComponentRatio,
  });

  let rois = [];
  let overlayPoints = [];
  let fallbackUsed = false;
  let abstained = false;
  let abstentionReason = "";

  if (components.length && reliability.allowMarking) {
    const topComponents = components.slice(0, scenario.analysisProfile.maxRois);
    rois = topComponents.map((component, index) =>
      toRoi(component, width, height, scenario.analysisProfile.prefix, index, {
        detectionConfidence: componentDetectionConfidence(
          component,
          adaptiveSelection.threshold ?? baseThreshold,
          reliability.confidence
        ),
        detectionMode: "component",
      })
    );
    overlayPoints = buildOverlayPointsFromComponents(topComponents, width, height);
  } else if (!components.length && allowWindowFallback && reliability.allowWindowFallback) {
    rois = fallbackWindows(
      scores,
      validMask,
      width,
      height,
      scenario.analysisProfile.maxRois,
      scenario.analysisProfile.prefix,
      {
        minMeanScore: Math.min(0.96, (adaptiveSelection.threshold ?? baseThreshold) + 0.02),
        minPeakScore: Math.min(0.99, (adaptiveSelection.threshold ?? baseThreshold) + 0.06),
      }
    ).map((roi) => ({
      ...roi,
      detectionConfidence: round(clamp(reliability.confidence - 0.08, 0.08, 0.94), 3),
      detectionMode: "window-fallback",
    }));
    overlayPoints = buildOverlayPointsFromRois(rois, {
      validRegion: {
        width,
        height,
        validMask,
        cloudMask: cloudSuppression.mask,
        source: "analysis-grid",
      },
      minPointsPerRoi: 3,
    });
    const sampledOverlayPoints = buildOverlayPointsFromScoreWindows(rois, scores, validMask, width, height, {
      maxPointsPerRoi: 72,
      minPointsPerRoi: 3,
      minScore: Math.max(0, (adaptiveSelection.threshold ?? baseThreshold) - (scenario.type === "dust" ? 0.05 : 0.03)),
    });
    overlayPoints = sampledOverlayPoints.length ? sampledOverlayPoints : overlayPoints;
    fallbackUsed = rois.length > 0;
  } else {
    abstained = true;
    abstentionReason = reliability.abstentionReason;
  }

  const detectedCoverage = adaptiveSelection.maskCount / Math.max(1, scoreValues.length);
  const anomalyDensity = clamp(
    scenario.baseAnomalyDensity * 0.55 + detectedCoverage * 2.1,
    0.22,
    0.94
  );

  return {
    rois,
    overlayPoints,
    anomalyDensity: round(anomalyDensity),
    fallbackUsed,
    validRegion: {
      width,
      height,
      validMask,
      cloudMask: cloudSuppression.mask,
      source: "analysis-grid",
    },
    validPixelRatio,
    cloudSuppressedRatio,
    cloudSuppressionApplied: cloudSuppression.applied || Boolean(analysisConfig.cloudFilteredProduct),
    threshold: adaptiveSelection.threshold,
    scoreMode: legendMatchedPixels > 0 ? "legend-calibrated" : "rgb-heuristic",
    legendMatchedRatio,
    largestComponentRatio: adaptiveSelection.largestComponentRatio,
    reliability,
    abstained,
    abstentionReason,
    decloudPreview: buildDecloudPreviewAsset(visualImageData, cloudSuppression),
    summary:
      abstained
        ? abstentionReason
        : components.length > 0
        ? detectionSummary(analysisConfig, rois, "detected")
        : rois.length
          ? detectionSummary(analysisConfig, rois, "fallback")
          : detectionSummary(analysisConfig, rois, "none"),
  };
}

function blendQuality(baseValue, influence, weight) {
  return clamp(baseValue * (1 - weight) + influence * weight, 0.35, 0.95);
}

const layerProbeCache = new Map();

async function probeLayerAvailability(layer, bbox, day, { signal } = {}) {
  const key = `${layer}:${day}:${bbox.join(",")}`;
  if (!layerProbeCache.has(key)) {
    const url = buildGetMapUrl({
      layer,
      bbox,
      width: 64,
      height: 64,
      time: day,
      format: "image/jpeg",
      transparent: false,
    });

    const probe = fetch(url, { mode: "cors", signal })
      .then(async (response) => {
        if (!response.ok) {
          return false;
        }
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          return false;
        }
        const blob = await response.blob();
        return blob.size > 512;
      })
      .catch((error) => {
        if (isAbortError(error)) {
          layerProbeCache.delete(key);
          throw error;
        }
        return false;
      });

    layerProbeCache.set(key, probe);
    trimCache(layerProbeCache, LAYER_PROBE_CACHE_LIMIT, key);
  }

  return layerProbeCache.get(key);
}

function preferredCloudMaskProductId(visualSource = {}, analysisConfig = {}) {
  return (
    analysisConfig.preferredCloudMaskProductId ||
    visualSource.preferredCloudMaskProductId ||
    null
  );
}

async function fetchAutoCloudMaskSummary(scenario, visualSource, analysisConfig, { signal } = {}) {
  const productId = preferredCloudMaskProductId(visualSource, analysisConfig);
  const bbox = scenario?.imageryProfile?.bbox;
  const dateValue = scenario?.observation?.dateValue;
  if (!productId || !Array.isArray(bbox) || bbox.length !== 4 || !dateValue || typeof fetch !== "function") {
    return null;
  }

  const key = `${productId}:${dateValue}:${bbox.join(",")}`;
  if (!autoCloudMaskCache.has(key)) {
    const request = fetch("/api/cloud-mask-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId,
        bbox,
        startDate: dateValue,
        endDate: dateValue,
        threshold: 0.45,
        limit: 4,
        sourceLabel: scenario?.focusSelection?.label || scenario?.title || "current-scene",
      }),
      signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const result = await response.json();
        return result && typeof result === "object"
          ? {
              ...result,
              autoFetched: true,
            }
          : null;
      })
      .catch((error) => {
        if (isAbortError(error)) {
          autoCloudMaskCache.delete(key);
          throw error;
        }
        return null;
      });

    autoCloudMaskCache.set(key, request);
    trimCache(autoCloudMaskCache, AUTO_CLOUD_MASK_CACHE_LIMIT, key);
  }

  return autoCloudMaskCache.get(key);
}

async function fetchAnalysisLegendPalette(analysisConfig, { signal } = {}) {
  const legendUrl = analysisConfig?.legendUrl;
  if (!legendUrl || typeof fetch !== "function") {
    return null;
  }

  if (!analysisLegendCache.has(legendUrl)) {
    const request = loadImageData(legendUrl, 256, 32, { signal })
      .then(({ imageData }) => {
        const palette = extractLegendPalette(imageData);
        return Array.isArray(palette) && palette.length >= 4 ? palette : null;
      })
      .catch((error) => {
        if (isAbortError(error)) {
          analysisLegendCache.delete(legendUrl);
          throw error;
        }
        return null;
      });

    analysisLegendCache.set(legendUrl, request);
    trimCache(analysisLegendCache, ANALYSIS_LEGEND_CACHE_LIMIT, legendUrl);
  }

  return analysisLegendCache.get(legendUrl);
}

async function resolveVisualSource(scenario, observation, { signal, analysisConfig = null } = {}) {
  const profile = scenario.imageryProfile;
  const day = dayString(observation);
  const configured = Array.isArray(profile.dailyLayers)
    ? profile.dailyLayers
    : [profile.dailyLayerId, ...DEFAULT_DAILY_IMAGERY_IDS];
  const candidates = prioritizeImageryLayerIds(configured, analysisConfig);

  for (const layerId of candidates) {
    const imageryConfig = getImageryLayerConfig(layerId);
    if (await probeLayerAvailability(imageryConfig.layer, profile.bbox, day, { signal })) {
      return {
        layerId,
        layer: imageryConfig.layer,
        label: imageryConfig.label,
        sensor: imageryConfig.sensor,
        platform: imageryConfig.platform,
        nominalObservationHour: imageryConfig.nominalObservationHour,
        preferredCloudMaskProductId: imageryConfig.preferredCloudMaskProductId,
        time: day,
        cadenceNote: imageryConfig.cadenceLabel,
        note:
          observation.getHours() === 0
            ? `当前显示的是 ${day} 的 ${imageryConfig.label}。`
            : `当前显示的是 ${day} 的 ${imageryConfig.label}；小时滑块用于设置任务发生时刻，而不是切换小时级底图。`,
      };
    }
  }

  const fallbackConfig = getImageryLayerConfig(candidates[0]);
  return {
    layerId: fallbackConfig.id,
    layer: fallbackConfig.layer,
    label: fallbackConfig.label,
    sensor: fallbackConfig.sensor,
    platform: fallbackConfig.platform,
    nominalObservationHour: fallbackConfig.nominalObservationHour,
    preferredCloudMaskProductId: fallbackConfig.preferredCloudMaskProductId,
    time: day,
    cadenceNote: fallbackConfig.cadenceLabel,
    note: `当前优先使用 ${day} 的 ${fallbackConfig.label}。`,
  };
}

export async function fetchGlobalOverview(observationDate, { signal } = {}) {
  const observation = new Date(observationDate);
  const day = dayString(observation);

  if (!globalOverviewCache.has(day)) {
    globalOverviewCache.set(
      day,
      (async () => {
        const pseudoScenario = {
          imageryProfile: {
            bbox: GLOBAL_OVERVIEW_BBOX,
            dailyLayerId: DEFAULT_DAILY_IMAGERY_IDS[0],
            dailyLayers: DEFAULT_DAILY_IMAGERY_IDS,
          },
        };
        const visualSource = await resolveVisualSource(pseudoScenario, observation, { signal });
        const src = buildGetMapUrl({
          layer: visualSource.layer,
          bbox: GLOBAL_OVERVIEW_BBOX,
          width: GLOBAL_OVERVIEW_WIDTH,
          height: GLOBAL_OVERVIEW_HEIGHT,
          time: visualSource.time,
          format: "image/jpeg",
          transparent: false,
        });

        return {
          day,
          src,
          width: GLOBAL_OVERVIEW_WIDTH,
          height: GLOBAL_OVERVIEW_HEIGHT,
          bbox: GLOBAL_OVERVIEW_BBOX,
          credit: "鍏ㄧ悆鎬昏搴曞浘鏉ユ簮锛歂ASA GIBS",
          sourceLabel: `${visualSource.label} 路 ${visualSource.cadenceNote}`,
        };
      })().catch((error) => {
        if (isAbortError(error)) {
          globalOverviewCache.delete(day);
        }
        throw error;
      })
    );
    trimCache(globalOverviewCache, GLOBAL_OVERVIEW_CACHE_LIMIT, day);
  }

  const overview = await globalOverviewCache.get(day);
  return {
    ...overview,
    note:
      observation.getHours() === 0
        ? "当前显示全球日尺度底图，可直接从中框选任意区域。"
        : "当前显示全球日尺度底图；小时滑块只用于设置任务发生时刻，不切换小时级全球底图。",
  };
}

function applyPrediction(baseScenario, prediction, sourceLabel) {
  return mergePredictionRefinement(baseScenario, prediction, sourceLabel);

  const rois = Array.isArray(prediction.rois) && prediction.rois.length ? prediction.rois : baseScenario.rois;

  return {
    ...baseScenario,
    rois,
    anomalyDensity: prediction.anomaly_density ?? baseScenario.anomalyDensity,
    analysis: {
      ...baseScenario.analysis,
      sourceLabel,
      summary:
        prediction.summary ||
        `连续反演模型识别到 ${Array.isArray(prediction.rois) ? prediction.rois.length : 0} 个异常候选区域。`, 
      method: "连续反演强度场 + ROI 提取",
      fallbackUsed: Boolean(prediction.fallback_used),
      overlayPoints: buildOverlayPointsFromRois(rois),
    },
    observation: {
      ...baseScenario.observation,
      summary: `${baseScenario.imagery.note} ${prediction.summary || "连续反演模型已完成异常提取。"}`
    },
  };
}

export function mergePredictionRefinement(baseScenario, prediction, sourceLabel) {
  const rois = Array.isArray(prediction.rois) && prediction.rois.length ? prediction.rois : [];
  const validRegion = getAnalysisValidRegion(baseScenario.analysis);
  const refinement = {
    sourceLabel,
    method: "continuous-retrieval-refinement",
    summary:
      prediction.summary ||
      `连续反演模型已完成 ${rois.length} 个重点区域的强度细化。`, 
    rois,
    overlayPoints: buildOverlayPointsFromRois(rois, {
      validRegion,
      minPointsPerRoi: 3,
    }),
    anomalyDensity: prediction.anomaly_density ?? baseScenario.anomalyDensity,
    fallbackUsed: Boolean(prediction.fallback_used),
    threshold: Number.isFinite(Number(prediction.threshold)) ? Number(prediction.threshold) : null,
  };

  const nextScenario = {
    ...baseScenario,
    modelRefinement: refinement,
    analysis: {
      ...baseScenario.analysis,
      sourceLabel: `${baseScenario.analysis.sourceLabel} + 连续反演细化`, 
      summary: `${baseScenario.analysis.summary} ${sourceLabel}已用于重点区域连续反演细化，但未覆盖官方异常候选区几何。`, 
      refinement,
    },
    observation: {
      ...baseScenario.observation,
      summary: `${baseScenario.imagery.note} ${sourceLabel}已完成连续反演细化，并与官方异常候选区保持分层。`, 
    },
  };
  inheritAnalysisValidRegion(nextScenario.analysis, baseScenario.analysis);
  return nextScenario;
}

let staticPredictionsPromise = null;

async function getStaticPredictions() {
  if (!staticPredictionsPromise) {
    staticPredictionsPromise = fetch(STATIC_PREDICTIONS_URL)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return response.json();
      })
      .catch(() => null);
  }
  return staticPredictionsPromise;
}

export async function fetchStaticPredictionBundle() {
  return getStaticPredictions();
}

export async function enrichScenarioWithRemoteData(baseScenario, { signal } = {}) {
  const scenario = JSON.parse(JSON.stringify(baseScenario));
  const observation = new Date(scenario.observation.iso);
  const profile = scenario.imageryProfile;
  const analysisConfig = getAnalysisLayerConfig(scenario.analysisProfile.layerId);
  const isThermalHotspot = analysisConfig.renderMode === "thermal-hotspot";
  const visualSource = await resolveVisualSource(scenario, observation, { signal, analysisConfig });
  const alignment = buildObservationAlignment(visualSource, analysisConfig, observation);
  const displayUrl = buildGetMapUrl({
    layer: visualSource.layer,
    bbox: profile.bbox,
    width: profile.displayWidth,
    height: profile.displayHeight,
    time: visualSource.time,
    format: "image/jpeg",
    transparent: false,
  });

  const analysisWidth = Math.max(180, Number(scenario.analysisProfile.sampleWidth) || 360);
  const analysisHeight = Math.round((analysisWidth * profile.displayHeight) / profile.displayWidth);
  const analysisUrl = buildGetMapUrl({
    layer: analysisConfig.layer,
    bbox: profile.bbox,
    width: analysisWidth,
    height: analysisHeight,
    time: dayString(observation),
    format: "image/png",
    transparent: true,
  });
  const analysisVisualUrl = buildGetMapUrl({
    layer: visualSource.layer,
    bbox: profile.bbox,
    width: analysisWidth,
    height: analysisHeight,
    time: visualSource.time,
    format: "image/jpeg",
    transparent: false,
  });

  scenario.imagery = {
    src: displayUrl,
    aspectRatio: profile.aspectRatio,
    credit: "搴曞浘鏉ユ簮锛歂ASA GIBS",
    sourceLabel: `${visualSource.label} 路 ${visualSource.cadenceNote}`,
    note: `${visualSource.note} ${alignment.note}`,
    decloudPreviewSrc: "",
    decloudPreviewAvailable: false,
    decloudPreviewMaskedRatio: null,
    decloudPreviewNote: "",
  };

  scenario.analysis = {
    sourceLabel: analysisConfig.label,
    summary: isThermalHotspot ? "正在基于官方热异常产品确认热点候选区。" : "正在基于官方气溶胶产品提取异常区域。",
    method: analysisConfig.defaultMethodLabel || "高值阈值 + 连通域聚类",
    fallbackUsed: false,
    legendUrl: analysisConfig.legendUrl,
    overlayPoints: buildOverlayPointsFromRois(scenario.rois),
    alignment,
    validPixelRatio: null,
    cloudSuppressedRatio: 0,
    decloudApplied: false,
    cloudMask: null,
    refinement: null,
    productKind: isThermalHotspot ? "thermal-hotspot" : "continuous-anomaly",
  };

  try {
    const [analysisImage, analysisVisualImage, autoCloudMask, analysisLegendPalette] = await Promise.all([
      loadImageData(analysisUrl, analysisWidth, analysisHeight, { signal }),
      loadImageData(analysisVisualUrl, analysisWidth, analysisHeight, { signal }).catch((error) => {
        if (isAbortError(error)) {
          throw error;
        }
        return null;
      }),
      fetchAutoCloudMaskSummary(scenario, visualSource, analysisConfig, { signal }),
      fetchAnalysisLegendPalette(analysisConfig, { signal }),
    ]);
    const detected = buildRois(analysisImage.imageData, scenario, {
      visualImageData: analysisVisualImage?.imageData ?? null,
      cloudMaskResult: autoCloudMask,
      legendPalette: analysisLegendPalette,
    });

    scenario.rois = detected.rois;
    scenario.anomalyDensity = detected.anomalyDensity;
    scenario.cloudCover = blendQuality(
      scenario.baseCloudCover,
      Math.max(
        scenario.baseCloudCover,
        detected.cloudSuppressedRatio + (1 - detected.validPixelRatio) * 0.82
      ),
      0.42
    );
    scenario.radiometricQuality = blendQuality(
      scenario.baseRadiometricQuality,
      0.82 - scenario.cloudCover * 0.4 + alignment.score * 0.08,
      0.38
    );
    scenario.lowContrast =
      scenario.lowContrast ||
      scenario.radiometricQuality < Math.max(0.56, scenario.baseRadiometricQuality - 0.05);
    scenario.analysis.summary = `${detected.summary} 已在去云后的有效像元 ${Math.round(
      detected.validPixelRatio * 100
    )}% 上提取异常。${alignment.note}`;
    scenario.analysis.summary = `${detected.summary} 去云后有效像元 ${Math.round(
      detected.validPixelRatio * 100
    )}% 已参与异常提取。${detected.scoreMode === "legend-calibrated" ? " 当前评分已按官方专题图例色带校准。" : ""}${alignment.note}`;
    scenario.analysis.fallbackUsed = detected.fallbackUsed;
    scenario.analysis.overlayPoints = detected.overlayPoints;
    scenario.analysis.validPixelRatio = detected.validPixelRatio;
    scenario.analysis.cloudSuppressedRatio = detected.cloudSuppressedRatio;
    scenario.analysis.decloudApplied = detected.cloudSuppressionApplied;
    scenario.analysis.cloudMask = autoCloudMask;
    scenario.observation.summary = isThermalHotspot
      ? `${visualSource.note} ${detected.summary} 已优先保持底图与热异常专题层对齐，并将热点确认结果留给后续局部复核链路。`
      : `${visualSource.note} ${detected.summary} 已对亮白云区做抑制，并优先保持底图与分析层对齐。`;

    scenario.analysis.threshold = detected.threshold;
    scenario.analysis.scoreMode = detected.scoreMode;
    scenario.analysis.legendMatchedRatio = detected.legendMatchedRatio;
    scenario.analysis.largestComponentRatio = detected.largestComponentRatio;
    scenario.analysis.reliability = detected.reliability;
    scenario.analysis.abstained = detected.abstained;
    scenario.analysis.abstentionReason = detected.abstentionReason;
    attachAnalysisValidRegion(scenario.analysis, detected.validRegion);
    scenario.imagery.decloudPreviewSrc = detected.decloudPreview?.src || "";
    scenario.imagery.decloudPreviewAvailable = Boolean(detected.decloudPreview?.src);
    scenario.imagery.decloudPreviewMaskedRatio = detected.decloudPreview?.maskedRatio ?? null;
    scenario.imagery.decloudPreviewNote =
      detected.decloudPreview?.note ||
      (detected.cloudSuppressionApplied
        ? "当前异常检测已经在去云后的有效区域上执行，但这次没有生成可切换的去云预览图。"
        : "当前显示的是原始遥感底图。");
    scenario.observation.summary = isThermalHotspot
      ? `${visualSource.note} ${detected.summary} 已优先保持底图与热异常专题层对齐。${detected.scoreMode === "legend-calibrated" ? " 热异常强度评分已参考官方图例色带顺序。" : ""}`
      : `${visualSource.note} ${detected.summary} 已对亮白云区做抑制，并优先保持底图与分析层对齐。${detected.scoreMode === "legend-calibrated" ? " 异常强度评分已参考官方图例色带顺序。" : ""}`;

    return scenario;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    scenario.analysis = {
      ...scenario.analysis,
      fallbackUsed: false,
      overlayPoints: [],
      reliability: {
        confidence: 0,
        allowMarking: false,
        allowWindowFallback: false,
        reasons: ["analysis_load_failed"],
        stats: scoreDistributionSummary([]),
        abstentionReason: `鍒嗘瀽鍥惧眰鍔犺浇澶辫触锛岀郴缁熷凡鍙栨秷寮傚父鏍囪銆?{error.message}`,
      },
      abstained: true,
      abstentionReason: `鍒嗘瀽鍥惧眰鍔犺浇澶辫触锛岀郴缁熷凡鍙栨秷寮傚父鏍囪銆?{error.message}`,
      summary: `鍒嗘瀽鍥惧眰鍔犺浇澶辫触锛岀郴缁熷凡鍙栨秷寮傚父鏍囪銆?{error.message}`,
    };
    scenario.rois = [];
    scenario.imagery.decloudPreviewSrc = "";
    scenario.imagery.decloudPreviewAvailable = false;
    scenario.imagery.decloudPreviewMaskedRatio = null;
    scenario.imagery.decloudPreviewNote = "";
    scenario.observation.summary = `${visualSource.note} 由于分析图层未正常返回，本次保留空结果以避免虚假异常标记。`;
    return scenario;
  }
}

let modelStatusPromise = null;

async function getModelStatus() {
  if (!modelStatusPromise) {
    modelStatusPromise = fetch("api/model-status")
      .then(async (response) => {
        if (!response.ok) {
          return { available: false };
        }
        return response.json();
      })
      .catch(() => ({ available: false }));
  }

  return modelStatusPromise;
}

export async function tryEnhanceScenarioWithLocalModel(
  baseScenario,
  { allowPython = true, signal } = {}
) {
  if (baseScenario.supportsLocalModel === false) {
    return baseScenario;
  }

  const enhancementDecision = shouldApplyModelEnhancement(baseScenario);
  if (!enhancementDecision.allow) {
    return preserveScenarioAnalysisValidRegion(baseScenario, {
      ...baseScenario,
      analysis: {
        ...baseScenario.analysis,
        summary: `${baseScenario.analysis.summary} 宸茶烦杩囪繛缁弽婕旇鐩栵細${enhancementDecision.reason}`,
      },
    });
  }

  const bundle = await getStaticPredictions();
  const staticPrediction =
    bundle?.predictions?.[baseScenario.id]?.[baseScenario.observation.dateValue] ?? null;

  if (staticPrediction) {
    return applyPrediction(baseScenario, staticPrediction, "预计算连续反演模型");
  }

  if (!allowPython) {
    return preserveScenarioAnalysisValidRegion(baseScenario, {
      ...baseScenario,
      analysis: {
        ...baseScenario.analysis,
        sourceLabel: `${baseScenario.analysis.sourceLabel} + 预览快速模式`, 
        summary: `${baseScenario.analysis.summary} 当前预览优先保持响应速度，深度模型会在正式执行或专用 Runner 中再调用。`, 
      },
    });
  }

  const status = await getModelStatus();
  if (!status.available) {
    return baseScenario;
  }

  try {
    const query = new URLSearchParams({
      scene: baseScenario.id,
      date: baseScenario.observation.dateValue,
    });
    const response = await fetch(`api/model-infer?${query.toString()}`, { signal });
    if (!response.ok) {
      return baseScenario;
    }

    const prediction = await response.json();
    if (!Array.isArray(prediction.rois) || prediction.rois.length === 0) {
      return preserveScenarioAnalysisValidRegion(baseScenario, {
        ...baseScenario,
        analysis: {
          ...baseScenario.analysis,
          sourceLabel: `${baseScenario.analysis.sourceLabel} + 鏈湴杩炵画鍙嶆紨妯″瀷`,
          summary: prediction.summary || "本地连续反演模型已启动，但当前场景未提取到稳定异常区域。",
          fallbackUsed: true,
        },
      });
    }

    return applyPrediction(baseScenario, prediction, "鏈湴杩炵画鍙嶆紨妯″瀷");
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return baseScenario;
  }
}

export function getRemoteSensingDiagnostics() {
  return {
    basemapProxyAvailability,
    globalOverviewCacheSize: globalOverviewCache.size,
    layerProbeCacheSize: layerProbeCache.size,
    autoCloudMaskCacheSize: autoCloudMaskCache.size,
    analysisLegendCacheSize: analysisLegendCache.size,
  };
}
