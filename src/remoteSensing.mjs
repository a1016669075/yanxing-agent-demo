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
import { fetchFirmsFireOverlay } from "./firmsProvider.mjs";

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
const VISUAL_SOURCE_QUALITY_CACHE_LIMIT = 64;
const CLOUD_GUIDE_CACHE_LIMIT = 24;
const CLOUD_GUIDE_COLORMAP_CACHE_LIMIT = 12;
const DUST_SUPPORT_CACHE_LIMIT = 24;
const DUST_SCREENING_CACHE_LIMIT = 12;
const SENTINEL_OPPORTUNITY_CACHE_LIMIT = 24;
const SENTINEL_OPPORTUNITY_SEARCH_WINDOW_DAYS = 1;
const SENTINEL_OPPORTUNITY_MAX_LON_SPAN = 10;
const SENTINEL_OPPORTUNITY_MAX_LAT_SPAN = 8;
const MODIS_250M_SUPPLEMENT_LAYER_IDS = ["modis-aqua-truecolor", "modis-terra-truecolor"];
const ANALYSIS_VALID_REGION_KEY = "__validRegion";
let basemapProxyAvailability = "unknown";
let basemapProxyStatusPromise = null;
const globalOverviewCache = new Map();
const autoCloudMaskCache = new Map();
const analysisLegendCache = new Map();
const visualSourceQualityCache = new Map();
const cloudGuideCache = new Map();
const cloudGuideColorMapCache = new Map();
const dustSupportCache = new Map();
const dustScreeningCache = new Map();
const sentinelOpportunityCache = new Map();

const STRICT_POLLUTION_CHAIN_BY_LAYER_ID = {
  "viirs-snpp-aod-dark-target-land-ocean": {
    imageryLayerId: "viirs-snpp-truecolor",
    cloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
    modelId: "official-viirs-snpp-haze-aod",
    modelLabel: "VIIRS SNPP AOD haze model",
    method: "VIIRS SNPP AOD Dark Target + CLDMSK + connected components",
  },
  "modis-aqua-aod-3km": {
    imageryLayerId: "modis-aqua-truecolor",
    cloudMaskProductId: "MYD35_L2",
    modelId: "official-modis-aqua-haze-aod",
    modelLabel: "MODIS Aqua AOD 3km haze model",
    method: "MODIS Aqua AOD 3km + MYD35 + connected components",
  },
  "viirs-noaa20-aod-dark-target-land-ocean": {
    imageryLayerId: "viirs-noaa20-truecolor",
    cloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA20",
    modelId: "official-viirs-noaa20-haze-aod",
    modelLabel: "VIIRS NOAA-20 AOD haze model",
    method: "VIIRS NOAA-20 AOD Dark Target + CLDMSK + connected components",
  },
  "viirs-noaa21-aod-dark-target-land-ocean": {
    imageryLayerId: "viirs-noaa21-truecolor",
    cloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA21",
    modelId: "official-viirs-noaa21-haze-aod",
    modelLabel: "VIIRS NOAA-21 AOD haze model",
    method: "VIIRS NOAA-21 AOD Dark Target + CLDMSK + connected components",
  },
};

const STRICT_DUST_CHAIN_BY_LAYER_ID = {
  "airs-aqua-dust-score-day-analysis": {
    platform: "Aqua",
    imageryLayerId: "modis-aqua-truecolor",
    cloudMaskProductId: "MYD35_L2",
    modelId: "official-airs-aqua-dust-score",
    modelLabel: "AIRS Aqua Dust Score dust model",
    method: "AIRS Aqua Dust Score + Aqua cloud screening + connected components",
  },
  "viirs-snpp-deep-blue-dust-aot": {
    platform: "SNPP",
    imageryLayerId: "viirs-snpp-truecolor",
    cloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
    modelId: "official-viirs-snpp-deep-blue-dust",
    modelLabel: "VIIRS SNPP Deep Blue dust model",
    method: "VIIRS SNPP Deep Blue AOT + SNPP Aerosol Type + CLDMSK + connected components",
  },
  "viirs-noaa20-deep-blue-dust-aot": {
    platform: "NOAA-20",
    imageryLayerId: "viirs-noaa20-truecolor",
    cloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA20",
    modelId: "official-viirs-noaa20-deep-blue-dust",
    modelLabel: "VIIRS NOAA-20 Deep Blue dust model",
    method: "VIIRS NOAA-20 Deep Blue AOT + NOAA-20 Aerosol Type + CLDMSK + connected components",
  },
  "modis-terra-deep-blue-dust-aod": {
    platform: "Terra",
    imageryLayerId: "modis-terra-truecolor",
    cloudMaskProductId: "MOD35_L2",
    modelId: "official-modis-terra-deep-blue-dust",
    modelLabel: "MODIS Terra Deep Blue dust model",
    method: "MODIS Terra Deep Blue AOD + MOD35 + connected components",
  },
};

const STRICT_THERMAL_CHAIN_BY_LAYER_ID = {
  "viirs-snpp-thermal-anomalies-375m": {
    platform: "SNPP",
    imageryLayerId: "viirs-snpp-truecolor",
    cloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
    modelId: "official-thermal-hotspot-clustering",
    modelLabel: "VIIRS SNPP Thermal Anomalies hotspot model",
    method: "VIIRS SNPP Thermal Anomalies 375m + SNPP CLDMSK + hotspot clustering",
  },
};

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

function localDayKey(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? dayString(date) : "";
}

function strictPollutionChain(analysisConfig = {}) {
  return STRICT_POLLUTION_CHAIN_BY_LAYER_ID[analysisConfig?.id] || null;
}

function strictDustChain(analysisConfig = {}) {
  return STRICT_DUST_CHAIN_BY_LAYER_ID[analysisConfig?.id] || null;
}

function strictThermalChain(analysisConfig = {}) {
  return STRICT_THERMAL_CHAIN_BY_LAYER_ID[analysisConfig?.id] || null;
}

function strictTaskChain(analysisConfig = {}) {
  return strictPollutionChain(analysisConfig) || strictDustChain(analysisConfig) || strictThermalChain(analysisConfig);
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
  const rawSurfaceMask = validRegion?.surfaceMask;
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
  const surfaceMask = normalizeMask(rawSurfaceMask);

  if (!width || !height || !validMask) {
    return null;
  }

  return {
    width,
    height,
    validMask,
    cloudMask,
    surfaceMask,
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

function currentHostname() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hostname || "";
}

function isLocalBasemapHost(hostname = "") {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function shouldRouteBasemapThroughLocalProxy(
  hostname = currentHostname(),
  availability = basemapProxyAvailability
) {
  return isLocalBasemapHost(hostname) && availability === "available";
}

function shouldUseLocalGibsProxy() {
  return shouldRouteBasemapThroughLocalProxy(currentHostname(), basemapProxyAvailability);
}

function thumbnailDimensions(displayWidth = 1200, displayHeight = 800, targetWidth = 96) {
  const width = Math.max(48, Math.round(targetWidth));
  const aspectRatio = Math.max(0.4, Math.min(2.5, (Number(displayHeight) || 1) / Math.max(1, Number(displayWidth) || 1)));
  return {
    width,
    height: Math.max(32, Math.round(width * aspectRatio)),
  };
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
  const host = currentHostname();
  if (!isLocalBasemapHost(host)) {
    basemapProxyAvailability = "disabled";
    return {
      available: false,
      mode: "direct_fallback",
      reason: "static_environment",
    };
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

export async function ensureBasemapProxyReady() {
  const host = currentHostname();
  if (!isLocalBasemapHost(host)) {
    return null;
  }

  if (basemapProxyAvailability === "available" || basemapProxyAvailability === "unavailable") {
    return basemapProxyAvailability;
  }

  if (!basemapProxyStatusPromise) {
    basemapProxyStatusPromise = fetchBasemapProxyStatus().finally(() => {
      basemapProxyStatusPromise = null;
    });
  }

  return basemapProxyStatusPromise;
}

export function __resetBasemapProxyStateForTest() {
  basemapProxyAvailability = "unknown";
  basemapProxyStatusPromise = null;
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

function allowSoftDustFallback({
  stats,
  validPixelRatio = 0,
  cloudSuppressedRatio = 0,
  legendMatchedRatio = 0,
  dustSupportRatio = 0,
} = {}) {
  if (!stats) {
    return false;
  }

  return (
    validPixelRatio >= 0.42 &&
    cloudSuppressedRatio <= 0.74 &&
    dustSupportRatio >= 0.025 &&
    (stats.upper >= 0.34 || stats.max >= 0.44) &&
    (stats.contrast >= 0.025 || stats.tailGain >= 0.028 || legendMatchedRatio >= 0.16 || dustSupportRatio >= 0.08)
  );
}

function allowThermalHotspotFallback({
  stats,
  scoreCount = 0,
  validPixelRatio = 0,
  cloudSuppressedRatio = 0,
  thresholdMargin = 0,
  largestComponentRatio = 0,
} = {}) {
  if (!stats || scoreCount < 6) {
    return false;
  }

  return (
    validPixelRatio >= 0.28 &&
    cloudSuppressedRatio <= 0.76 &&
    largestComponentRatio <= 0.04 &&
    stats.max >= 0.74 &&
    stats.upper >= 0.748 &&
    stats.peak >= 0.748 &&
    (stats.tailGain >= 0.012 || thresholdMargin >= -0.018)
  );
}

export function assessDetectionReliability({
  analysisConfig = {},
  taskType = "",
  scoreValues = [],
  validPixelRatio = 0,
  cloudSuppressedRatio = 0,
  legendMatchedRatio = 0,
  dustSupportRatio = 0,
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

  if (validPixelRatio < (isThermalHotspot ? 0.16 : isDust ? 0.15 : 0.24)) {
    confidence -= isThermalHotspot ? 0.2 : isDust ? 0.14 : 0.26;
    reasons.push("valid_pixels_low");
  }

  if (cloudSuppressedRatio > (isThermalHotspot ? 0.72 : isDust ? 0.69 : 0.56)) {
    confidence -= isThermalHotspot ? 0.14 : isDust ? 0.1 : 0.2;
    reasons.push("cloud_suppression_heavy");
  }

  if (stats.contrast < (isThermalHotspot ? 0.07 : isDust ? 0.035 : 0.08)) {
    confidence -= isDust ? 0.1 : 0.24;
    reasons.push("score_contrast_low");
  }

  if (thresholdMargin < (isThermalHotspot ? 0.03 : isDust ? 0.02 : 0.05)) {
    confidence -= isDust ? 0.08 : 0.16;
    reasons.push("peak_not_separated");
  }

  if (!isThermalHotspot && analysisConfig.legendRequired !== false && legendMatchedRatio < (isDust ? 0.015 : 0.06)) {
    confidence -= isDust ? 0.08 : 0.18;
    reasons.push("legend_match_low");
  }

  if (!isThermalHotspot && components.length && largestComponentRatio > (isDust ? 0.72 : 0.32)) {
    confidence -= isDust ? 0.05 : 0.14;
    reasons.push("component_too_broad");
  }

  if (!components.length) {
    confidence -= isDust ? 0.02 : 0.08;
  }

  if (isDust && dustSupportRatio >= 0.04) {
    confidence += Math.min(0.12, dustSupportRatio * 0.28 + 0.02);
  }

  confidence = clamp(confidence, 0, 0.98);

  const standardWindowFallback =
    !isThermalHotspot &&
    confidence >= (isDust ? 0.28 : 0.52) &&
    validPixelRatio >= (isDust ? 0.18 : 0.32) &&
    cloudSuppressedRatio <= (isDust ? 0.78 : 0.58) &&
    stats.contrast >= (isDust && dustSupportRatio >= 0.05 ? 0.024 : isDust ? 0.03 : 0.09) &&
    thresholdMargin >= (isDust && dustSupportRatio >= 0.05 ? 0.012 : isDust ? 0.015 : 0.05);
  const softDustFallback =
    isDust &&
    !components.length &&
    allowSoftDustFallback({
      stats,
      validPixelRatio,
      cloudSuppressedRatio,
      legendMatchedRatio,
      dustSupportRatio,
    });
  const thermalWindowFallback =
    isThermalHotspot &&
    allowThermalHotspotFallback({
      stats,
      scoreCount: scoreValues.length,
      validPixelRatio,
      cloudSuppressedRatio,
      thresholdMargin,
      largestComponentRatio,
    });
  const allowWindowFallback = standardWindowFallback || softDustFallback || thermalWindowFallback;
  const allowMarking = components.length ? confidence >= (isThermalHotspot ? 0.44 : isDust ? 0.36 : 0.5) : allowWindowFallback;

  return {
    confidence: round(confidence, 3),
    allowMarking,
    allowWindowFallback,
    reasons,
    stats,
    abstentionReason: allowMarking ? "" : buildAbstentionReason(reasons, isThermalHotspot),
  };
}

export function shouldRouteToWindowFallback({
  taskType = "",
  componentCount = 0,
  allowWindowFallback = false,
  reliability = null,
} = {}) {
  if (!allowWindowFallback || !reliability?.allowWindowFallback) {
    return false;
  }

  if (componentCount <= 0) {
    return true;
  }

  if (taskType === "wildfire") {
    const reasons = Array.isArray(reliability?.reasons) ? reliability.reasons : [];
    return (
      reliability.allowMarking === false &&
      reliability.confidence >= 0.34 &&
      (reasons.includes("score_contrast_low") || reasons.includes("peak_not_separated"))
    );
  }

  if (taskType !== "dust") {
    return false;
  }

  const reasons = Array.isArray(reliability?.reasons) ? reliability.reasons : [];
  return reasons.includes("component_too_broad") || reliability.allowMarking === false;
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

function parseColorMapValue(rawValue = "", label = "") {
  const text = String(rawValue || "").trim();
  if (text) {
    const parseBound = (rawBound = "") => {
      const normalized = String(rawBound || "").trim();
      if (/^\+?inf$/i.test(normalized)) {
        return Number.POSITIVE_INFINITY;
      }
      if (/^-inf$/i.test(normalized)) {
        return Number.NEGATIVE_INFINITY;
      }
      const value = Number(normalized);
      return Number.isFinite(value) ? value : null;
    };
    const rangeMatch = text.match(
      /^\[\s*(-?(?:\d+(?:\.\d+)?|\+?INF|-INF))\s*,\s*(-?(?:\d+(?:\.\d+)?|\+?INF|-INF))\s*[\)\]]$/i
    );
    if (rangeMatch) {
      const lower = parseBound(rangeMatch[1]);
      const upper = parseBound(rangeMatch[2]);
      if (Number.isFinite(lower) && Number.isFinite(upper)) {
        return (lower + upper) / 2;
      }
      if (Number.isFinite(lower) && upper === Number.POSITIVE_INFINITY) {
        return lower;
      }
      if (lower === Number.NEGATIVE_INFINITY && Number.isFinite(upper)) {
        return upper;
      }
    }

    const singletonMatch = text.match(/^\[\s*(-?\d+(?:\.\d+)?)\s*\]$/);
    if (singletonMatch) {
      const numeric = Number(singletonMatch[1]);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }

    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  const labelMatch = String(label || "").match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (labelMatch) {
    const value = Number(labelMatch[1]);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

export function parseColorMapEntries(xmlText = "") {
  if (!xmlText || typeof xmlText !== "string") {
    return [];
  }

  const entryPattern = /<ColorMapEntry\b([^/>]*?)(?:\/>|>(.*?)<\/ColorMapEntry>)/g;
  const attributePattern = /(\w+)="([^"]*)"/g;
  const entries = [];
  let match = entryPattern.exec(xmlText);

  while (match) {
    const attributes = {};
    let attributeMatch = attributePattern.exec(match[1]);
    while (attributeMatch) {
      attributes[attributeMatch[1]] = attributeMatch[2];
      attributeMatch = attributePattern.exec(match[1]);
    }

    const rgb = String(attributes.rgb || "")
      .split(",")
      .map((value) => Number(value.trim()));
    if (rgb.length === 3 && rgb.every((value) => Number.isFinite(value))) {
      entries.push({
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
        transparent: String(attributes.transparent || "").toLowerCase() === "true",
        value: parseColorMapValue(attributes.value, attributes.label),
        label: attributes.label || "",
      });
    }

    match = entryPattern.exec(xmlText);
  }

  return entries;
}

function matchColorMapEntry(r, g, b, entries = [], distanceThreshold = 42) {
  const matchEntry = scorePixelAgainstLegend(r, g, b, entries);
  if (!matchEntry?.matched || matchEntry.distance > distanceThreshold) {
    return null;
  }

  const entryIndex = Math.round(matchEntry.score * Math.max(0, entries.length - 1));
  return {
    matchEntry,
    entryIndex,
    entry: entries[clamp(entryIndex, 0, Math.max(0, entries.length - 1))],
  };
}

function cloudGuideProbability(entry = null, valueKind = "cloud-fraction") {
  if (!entry || !Number.isFinite(entry.value)) {
    return null;
  }

  if (valueKind === "clear-sky-confidence") {
    return clamp(1 - entry.value, 0, 1);
  }

  if (valueKind === "cloud-fraction") {
    return clamp(entry.value / 100, 0, 1);
  }

  return null;
}

export function buildCloudGuideMask(
  imageData,
  colorMapEntries = [],
  {
    valueKind = "cloud-fraction",
    probabilityThreshold = 0.42,
    distanceThreshold = 42,
  } = {}
) {
  const { width, height, data } = imageData || {};
  const source = data instanceof Uint8ClampedArray ? data : null;
  const entries = Array.isArray(colorMapEntries) ? colorMapEntries.filter((entry) => !entry.transparent) : [];

  if (!width || !height || !source || !entries.length) {
    return null;
  }

  const mask = new Uint8Array(width * height);
  const probabilities = new Float32Array(width * height);
  probabilities.fill(-1);
  let matchedPixels = 0;
  let cloudyPixels = 0;
  let probabilitySum = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (source[offset + 3] < 8) {
      continue;
    }

    const matchedEntry = matchColorMapEntry(
      source[offset],
      source[offset + 1],
      source[offset + 2],
      entries,
      distanceThreshold
    );
    if (!matchedEntry) {
      continue;
    }

    const entry = matchedEntry.entry;
    const probability = cloudGuideProbability(entry, valueKind);
    if (!Number.isFinite(probability)) {
      continue;
    }

    probabilities[pixelIndex] = probability;
    probabilitySum += probability;
    matchedPixels += 1;
    if (probability >= probabilityThreshold) {
      mask[pixelIndex] = 1;
      cloudyPixels += 1;
    }
  }

  if (!matchedPixels) {
    return null;
  }

  return {
    mask,
    probabilities,
    matchedPixels,
    cloudyPixels,
    meanCloudProbability: round(probabilitySum / matchedPixels, 3),
    maskedRatio: round(cloudyPixels / matchedPixels, 3),
    probabilityThreshold: round(probabilityThreshold, 3),
    valueKind,
  };
}

function dustCategoryProbability(entry = null) {
  const label = String(entry?.label || "").toLowerCase();
  if (!label) {
    return null;
  }

  if (label.includes("dust")) {
    return 0.96;
  }
  if (label.includes("mixed")) {
    return 0.58;
  }
  if (label.includes("background")) {
    return 0.04;
  }
  if (label.includes("smoke")) {
    return 0.08;
  }
  if (label.includes("cloud")) {
    return 0.02;
  }
  if (label.includes("fine")) {
    return 0.12;
  }

  return 0.1;
}

function screeningCategoryProbability(entry = null, screeningKind = "") {
  const label = String(entry?.label || "").toLowerCase();
  if (!label) {
    return null;
  }

  if (screeningKind === "water-mask") {
    if (label.includes("water")) {
      return 1;
    }
    if (label.includes("land") || label.includes("no data")) {
      return 0;
    }
  }

  return null;
}

export function buildCategoricalDustSupportMask(
  imageData,
  colorMapEntries = [],
  { distanceThreshold = 20, probabilityThreshold = 0.55 } = {}
) {
  const { width, height, data } = imageData || {};
  const source = data instanceof Uint8ClampedArray ? data : null;
  const entries = Array.isArray(colorMapEntries) ? colorMapEntries.filter((entry) => !entry.transparent) : [];

  if (!width || !height || !source || !entries.length) {
    return null;
  }

  const mask = new Uint8Array(width * height);
  const probabilities = new Float32Array(width * height);
  probabilities.fill(-1);
  let matchedPixels = 0;
  let supportedPixels = 0;
  let probabilitySum = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (source[offset + 3] < 8) {
      continue;
    }

    const matchedEntry = matchColorMapEntry(
      source[offset],
      source[offset + 1],
      source[offset + 2],
      entries,
      distanceThreshold
    );
    if (!matchedEntry) {
      continue;
    }

    const probability = dustCategoryProbability(matchedEntry.entry);
    if (!Number.isFinite(probability)) {
      continue;
    }

    probabilities[pixelIndex] = probability;
    probabilitySum += probability;
    matchedPixels += 1;
    if (probability >= probabilityThreshold) {
      mask[pixelIndex] = 1;
      supportedPixels += 1;
    }
  }

  if (!matchedPixels) {
    return null;
  }

  return {
    width,
    height,
    mask,
    probabilities,
    matchedPixels,
    supportedPixels,
    supportRatio: round(supportedPixels / matchedPixels, 3),
    meanProbability: round(probabilitySum / matchedPixels, 3),
    probabilityThreshold: round(probabilityThreshold, 3),
    supportKind: "categorical-dust",
  };
}

export function buildContinuousDustSupportMask(
  imageData,
  colorMapEntries = [],
  { distanceThreshold = 16, probabilityThreshold = 0.72 } = {}
) {
  const { width, height, data } = imageData || {};
  const source = data instanceof Uint8ClampedArray ? data : null;
  const entries = Array.isArray(colorMapEntries)
    ? colorMapEntries.filter((entry) => !entry.transparent && Number.isFinite(entry.value))
    : [];

  if (!width || !height || !source || !entries.length) {
    return null;
  }

  const minValue = Math.min(...entries.map((entry) => entry.value));
  const maxValue = Math.max(...entries.map((entry) => entry.value));
  const range = Math.max(0.001, maxValue - minValue);
  const mask = new Uint8Array(width * height);
  const probabilities = new Float32Array(width * height);
  probabilities.fill(-1);
  let matchedPixels = 0;
  let supportedPixels = 0;
  let probabilitySum = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (source[offset + 3] < 8) {
      continue;
    }

    const matchedEntry = matchColorMapEntry(
      source[offset],
      source[offset + 1],
      source[offset + 2],
      entries,
      distanceThreshold
    );
    if (!matchedEntry || !Number.isFinite(matchedEntry.entry?.value)) {
      continue;
    }

    const probability = clamp((matchedEntry.entry.value - minValue) / range, 0, 1);
    probabilities[pixelIndex] = probability;
    probabilitySum += probability;
    matchedPixels += 1;
    if (probability >= probabilityThreshold) {
      mask[pixelIndex] = 1;
      supportedPixels += 1;
    }
  }

  if (!matchedPixels) {
    return null;
  }

  return {
    width,
    height,
    mask,
    probabilities,
    matchedPixels,
    supportedPixels,
    supportRatio: round(supportedPixels / matchedPixels, 3),
    meanProbability: round(probabilitySum / matchedPixels, 3),
    probabilityThreshold: round(probabilityThreshold, 3),
    supportKind: "continuous-dust-score",
  };
}

export function buildCategoricalScreeningMask(
  imageData,
  colorMapEntries = [],
  { screeningKind = "", distanceThreshold = 18, probabilityThreshold = 0.55 } = {}
) {
  const { width, height, data } = imageData || {};
  const source = data instanceof Uint8ClampedArray ? data : null;
  const entries = Array.isArray(colorMapEntries) ? colorMapEntries : [];

  if (!width || !height || !source || !entries.length || !screeningKind) {
    return null;
  }

  const mask = new Uint8Array(width * height);
  const probabilities = new Float32Array(width * height);
  probabilities.fill(-1);
  let matchedPixels = 0;
  let maskedPixels = 0;
  let probabilitySum = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (source[offset + 3] < 8) {
      continue;
    }

    const matchedEntry = matchColorMapEntry(
      source[offset],
      source[offset + 1],
      source[offset + 2],
      entries,
      distanceThreshold
    );
    if (!matchedEntry) {
      continue;
    }

    const probability = screeningCategoryProbability(matchedEntry.entry, screeningKind);
    if (!Number.isFinite(probability)) {
      continue;
    }

    probabilities[pixelIndex] = probability;
    probabilitySum += probability;
    matchedPixels += 1;
    if (probability >= probabilityThreshold) {
      mask[pixelIndex] = 1;
      maskedPixels += 1;
    }
  }

  if (!matchedPixels) {
    return null;
  }

  return {
    width,
    height,
    mask,
    probabilities,
    matchedPixels,
    maskedPixels,
    maskedRatio: round(maskedPixels / matchedPixels, 3),
    meanProbability: round(probabilitySum / matchedPixels, 3),
    probabilityThreshold: round(probabilityThreshold, 3),
    screeningKind,
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
  const strictLayerId = analysisConfig?.strictImageryLayerId || strictTaskChain(analysisConfig)?.imageryLayerId;
  if (strictLayerId) {
    return [strictLayerId];
  }

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
  const safeAnalysisConfig = analysisConfig || {};
  const displayHour = nominalObservationHour(visualSource);
  const analysisHour = nominalObservationHour(safeAnalysisConfig);
  const taskHour = observation instanceof Date ? observation.getHours() : null;
  const sameSensor = Boolean(visualSource.sensor && visualSource.sensor === safeAnalysisConfig.sensor);
  const samePlatform = Boolean(visualSource.platform && visualSource.platform === safeAnalysisConfig.platform);

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

  const label = exactAligned ? "同平台同传感器日尺度对齐" : samePlatform ? "同平台日尺度对齐" : sameSensor ? "同传感器近似对齐" : "跨平台日尺度对齐";
  const note = exactAligned
    ? "当前底图与异常分析层已优先对齐到同平台同传感器日尺度链路，可直接进行目视比对。"
    : samePlatform
      ? "当前底图与异常分析层保持同卫星平台日尺度对齐；若传感器不同，目视解译需要结合传感器差异理解。"
      : "当前展示仍属于日尺度近似对齐，底图与分析层并非同卫星平台，目视比对需要结合对齐提示理解。";

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

export function summarizeVisualSourceQuality(imageData) {
  const { width, height, data } = imageData || {};
  const source = data instanceof Uint8ClampedArray ? data : null;
  if (!width || !height || !source) {
    return {
      opaquePixelCount: 0,
      cloudLikeRatio: 1,
      meanBrightness: 0,
      meanSaturation: 0,
      meanColorfulness: 0,
      textureScore: 0,
      clearViewScore: 0,
    };
  }

  const brightnessValues = new Float32Array(width * height);
  const opaqueMask = new Uint8Array(width * height);
  let opaquePixelCount = 0;
  let cloudLikeCount = 0;
  let brightnessSum = 0;
  let saturationSum = 0;
  let colorfulnessSum = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (source[offset + 3] < 8) {
      continue;
    }

    const sample = cloudScorePixel(source[offset], source[offset + 1], source[offset + 2]);
    brightnessValues[pixelIndex] = sample.brightness;
    opaqueMask[pixelIndex] = 1;
    opaquePixelCount += 1;
    brightnessSum += sample.brightness;
    saturationSum += sample.saturation;
    colorfulnessSum += sample.colorfulness;

    if (
      sample.score >= 0.74 &&
      sample.brightness >= 0.62 &&
      sample.saturation <= 0.28 &&
      sample.colorfulness <= 0.22
    ) {
      cloudLikeCount += 1;
    }
  }

  if (!opaquePixelCount) {
    return {
      opaquePixelCount: 0,
      cloudLikeRatio: 1,
      meanBrightness: 0,
      meanSaturation: 0,
      meanColorfulness: 0,
      textureScore: 0,
      clearViewScore: 0,
    };
  }

  let textureSum = 0;
  let textureEdges = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!opaqueMask[index]) {
        continue;
      }

      if (x > 0 && opaqueMask[index - 1]) {
        textureSum += Math.abs(brightnessValues[index] - brightnessValues[index - 1]);
        textureEdges += 1;
      }
      if (y > 0 && opaqueMask[index - width]) {
        textureSum += Math.abs(brightnessValues[index] - brightnessValues[index - width]);
        textureEdges += 1;
      }
    }
  }

  const cloudLikeRatio = round(cloudLikeCount / Math.max(1, opaquePixelCount), 3);
  const meanBrightness = round(brightnessSum / opaquePixelCount, 3);
  const meanSaturation = round(saturationSum / opaquePixelCount, 3);
  const meanColorfulness = round(colorfulnessSum / opaquePixelCount, 3);
  const textureScore = round(clamp((textureSum / Math.max(1, textureEdges)) * 7.2, 0, 1), 3);
  const clearViewScore = round(
    clamp(
      (1 - cloudLikeRatio) * 0.58 +
        textureScore * 0.22 +
        Math.min(1, meanSaturation * 2.2) * 0.1 +
        Math.min(1, meanColorfulness * 2.8) * 0.1,
      0.02,
      0.98
    ),
    3
  );

  return {
    opaquePixelCount,
    cloudLikeRatio,
    meanBrightness,
    meanSaturation,
    meanColorfulness,
    textureScore,
    clearViewScore,
  };
}

export function selectVisualSourceCandidate(candidates = [], analysisConfig = null, observation = null) {
  const strictLayerId = analysisConfig?.strictImageryLayerId || strictTaskChain(analysisConfig)?.imageryLayerId;
  const usableCandidates = strictLayerId
    ? candidates.filter((candidate) => candidate?.layerId === strictLayerId)
    : candidates;
  const ranked = usableCandidates
    .filter(Boolean)
    .map((candidate) => {
      const alignment = candidate.alignment || buildObservationAlignment(candidate, analysisConfig, observation);
      const visualQuality = candidate.visualQuality || {};
      const clearViewScore = Number.isFinite(visualQuality.clearViewScore) ? visualQuality.clearViewScore : 0.45;
      const cloudLikeRatio = Number.isFinite(visualQuality.cloudLikeRatio) ? visualQuality.cloudLikeRatio : 0.5;
      const selectionScore = round(
        clamp(clearViewScore * 0.54 + alignment.score * 0.34 + (1 - cloudLikeRatio) * 0.12, 0.02, 0.99),
        3
      );

      return {
        ...candidate,
        alignment,
        visualQuality,
        selectionScore,
      };
    })
    .sort((left, right) => {
      const scoreDiff = right.selectionScore - left.selectionScore;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const alignmentDiff = (right.alignment?.score || 0) - (left.alignment?.score || 0);
      if (alignmentDiff !== 0) {
        return alignmentDiff;
      }
      return (left.defaultPriority || 99) - (right.defaultPriority || 99);
    });

  const selected = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  let selectionReason = strictLayerId
    ? "当前任务链路启用严格卫星绑定，只允许同平台底图参与显示和后续去云。"
    : "当前候选中仅保留了这一条可用底图链路。";

  if (!strictLayerId && selected && runnerUp) {
    const selectedClearView = selected.visualQuality?.clearViewScore || 0;
    const runnerUpClearView = runnerUp.visualQuality?.clearViewScore || 0;
    if (selectedClearView >= runnerUpClearView + 0.12 && !selected.alignment?.exactAligned) {
      selectionReason = `已评估 ${ranked.length} 条可用底图，当前底图比 ${runnerUp.label} 更清晰，适合做场景演示。`;
    } else if (selected.alignment?.exactAligned) {
      selectionReason = `已评估 ${ranked.length} 条可用底图，当前底图与分析层保持同平台对齐，且清晰度未明显落后于其他候选。`;
    } else if (selected.alignment?.sameSensor) {
      selectionReason = `已评估 ${ranked.length} 条可用底图，当前底图在清晰度与同传感器对齐之间取得了更稳的平衡。`;
    } else {
      selectionReason = `已评估 ${ranked.length} 条可用底图，当前底图在清晰度和时相匹配上更稳妥。`;
    }
  }

  return {
    selected,
    ranked,
    selectionReason,
  };
}

function cloudScorePixel(r, g, b) {
  const { brightness, saturation, colorfulness, warmness } = rgbStats(r, g, b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const neutrality = clamp(1 - colorfulness, 0, 1);
  const blueLift = clamp((b - r + 255) / 510, 0, 1);
  const whiteness = clamp(1 - (max - min) / 96, 0, 1);
  return {
    brightness,
    saturation,
    neutrality,
    colorfulness,
    warmness,
    blueLift,
    whiteness,
    score: 0.48 * brightness + 0.18 * (1 - saturation) + 0.16 * neutrality + 0.1 * blueLift + 0.08 * whiteness,
  };
}

function isWarmDustLike(sample = {}) {
  return (
    sample.warmness >= 0.58 &&
    sample.saturation >= 0.18 &&
    sample.colorfulness >= 0.12 &&
    sample.brightness <= 0.84
  );
}

export function buildCloudSuppressionMask(
  imageData,
  { estimatedCoverage = 0, confidence = 0, guideMaskResult = null } = {}
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
  const relaxedThreshold = clamp(
    threshold - clamp(0.04 + estimatedCoverage * 0.08 + confidence * 0.05, 0.04, 0.13),
    0.38,
    0.95
  );
  let maskedCount = 0;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (data[offset + 3] < 8) {
      continue;
    }

    const sample = cloudScorePixel(data[offset], data[offset + 1], data[offset + 2]);
    const strongCloudCandidate =
      sample.score >= threshold &&
      sample.brightness >= 0.62 &&
      sample.saturation <= 0.4 &&
      sample.neutrality >= 0.34;
    const softCloudCandidate =
      sample.score >= relaxedThreshold &&
      sample.brightness >= 0.72 &&
      sample.saturation <= 0.24 &&
      sample.colorfulness <= 0.22 &&
      sample.whiteness >= 0.42;

    if ((strongCloudCandidate || softCloudCandidate) && !(isWarmDustLike(sample) && sample.score < threshold + 0.08)) {
      rawMask[pixelIndex] = 1;
      maskedCount += 1;
    }
  }

  let mask = maskedCount && width >= 8 && height >= 8 ? closeMask(rawMask, width, height) : rawMask;
  if (
    guideMaskResult?.mask instanceof Uint8Array &&
    guideMaskResult.mask.length === width * height &&
    guideMaskResult.probabilities instanceof Float32Array &&
    guideMaskResult.probabilities.length === width * height
  ) {
    const fusedMask = new Uint8Array(mask.length);
    for (let index = 0; index < mask.length; index += 1) {
      const guideProbability = guideMaskResult.probabilities[index];
      const guideMatched = guideProbability >= 0;
      const guideCloudy = guideMaskResult.mask[index] === 1;
      const heuristicCloudy = mask[index] === 1;
      fusedMask[index] =
        guideCloudy || (heuristicCloudy && (!guideMatched || guideProbability >= 0.22))
          ? 1
          : 0;
    }
    mask = fusedMask;
  }

  const closedMaskedCount = mask.reduce((sum, value) => sum + value, 0);
  const guideApplied = Boolean(guideMaskResult?.matchedPixels);

  return {
    mask,
    maskedRatio: round(closedMaskedCount / Math.max(1, opaquePixels), 3),
    threshold: round(threshold, 3),
    applied: closedMaskedCount >= Math.max(1, opaquePixels * 0.01),
    guideApplied,
    guideMaskedRatio: guideApplied ? guideMaskResult.maskedRatio : null,
    guideSourceLabel: guideApplied ? guideMaskResult.sourceLabel || "official-cloud-guide" : "",
    methodLabel: guideApplied ? "官方云导引层 + RGB 兜底抑制" : "RGB 启发式云抑制",
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
    note: `该预览与异常检测共用同一套云抑制掩膜，当前采用 ${
      cloudSuppression.methodLabel || "去云掩膜"
    }，约 ${Math.round(preview.maskedRatio * 100)}% 的像元被视为云并从展示图中剔除。`,
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
  { percentileRatio = 0.84, baseThreshold = null, minComponentPixels = 1, captureComponentPixels = false } = {}
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
    const components = extractComponents(mask, scores, width, height, minComponentPixels, {
      capturePixels: captureComponentPixels,
    });
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

function extractComponents(mask, scores, width, height, minPixels, { capturePixels = false } = {}) {
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
    const pixels = capturePixels ? [] : null;

    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      scoreSum += scores[current];
      if (pixels) {
        pixels.push(current);
      }
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
      pixels,
    });
  }

  return components.sort((left, right) => componentScore(right) - componentScore(left));
}

function dustComponentShape(component = {}) {
  const boxWidth = Math.max(1, component.maxX - component.minX + 1);
  const boxHeight = Math.max(1, component.maxY - component.minY + 1);
  const longerSide = Math.max(boxWidth, boxHeight);
  const shorterSide = Math.max(1, Math.min(boxWidth, boxHeight));
  return {
    boxWidth,
    boxHeight,
    aspectRatio: longerSide / shorterSide,
    fillRatio: component.pixelCount / Math.max(1, boxWidth * boxHeight),
  };
}

function summarizeDustSupportForPixels(pixelIndexes = [], dustSupportProbabilities = null) {
  if (!(dustSupportProbabilities instanceof Float32Array) || !Array.isArray(pixelIndexes) || !pixelIndexes.length) {
    return {
      matchedPixels: 0,
      supportedPixels: 0,
      meanProbability: 0,
      supportRatio: 0,
      matchedRatio: 0,
    };
  }

  let matchedPixels = 0;
  let supportedPixels = 0;
  let probabilitySum = 0;

  for (const pixelIndex of pixelIndexes) {
    const probability = dustSupportProbabilities[pixelIndex];
    if (!Number.isFinite(probability) || probability < 0) {
      continue;
    }
    matchedPixels += 1;
    probabilitySum += probability;
    if (probability >= 0.55) {
      supportedPixels += 1;
    }
  }

  return {
    matchedPixels,
    supportedPixels,
    meanProbability: matchedPixels ? probabilitySum / matchedPixels : 0,
    supportRatio: matchedPixels ? supportedPixels / matchedPixels : 0,
    matchedRatio: pixelIndexes.length ? matchedPixels / pixelIndexes.length : 0,
  };
}

function shouldRejectDustComponent(component = {}, dustSupportProbabilities = null) {
  const support = summarizeDustSupportForPixels(component.pixels, dustSupportProbabilities);
  if (support.matchedPixels <= 0 || support.matchedRatio < 0.32) {
    return false;
  }

  const shape = dustComponentShape(component);
  return (
    support.meanProbability < 0.14 &&
    support.supportRatio < 0.04 &&
    shape.aspectRatio <= 1.55 &&
    shape.fillRatio >= 0.4
  );
}

function summarizeDustSupportInRoi(roi = {}, width = 0, height = 0, validMask = null, dustSupportProbabilities = null) {
  if (
    !(validMask instanceof Uint8Array) ||
    !(dustSupportProbabilities instanceof Float32Array) ||
    !roi?.box ||
    !width ||
    !height
  ) {
    return {
      matchedPixels: 0,
      supportedPixels: 0,
      meanProbability: 0,
      supportRatio: 0,
      matchedRatio: 0,
      validPixels: 0,
    };
  }

  const left = clamp(Math.floor((Number(roi.box.left) / 100) * width), 0, Math.max(0, width - 1));
  const top = clamp(Math.floor((Number(roi.box.top) / 100) * height), 0, Math.max(0, height - 1));
  const right = clamp(
    Math.ceil(((Number(roi.box.left) + Number(roi.box.width)) / 100) * width),
    left + 1,
    width
  );
  const bottom = clamp(
    Math.ceil(((Number(roi.box.top) + Number(roi.box.height)) / 100) * height),
    top + 1,
    height
  );

  let validPixels = 0;
  let matchedPixels = 0;
  let supportedPixels = 0;
  let probabilitySum = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixelIndex = y * width + x;
      if (!validMask[pixelIndex]) {
        continue;
      }
      validPixels += 1;
      const probability = dustSupportProbabilities[pixelIndex];
      if (!Number.isFinite(probability) || probability < 0) {
        continue;
      }
      matchedPixels += 1;
      probabilitySum += probability;
      if (probability >= 0.55) {
        supportedPixels += 1;
      }
    }
  }

  return {
    validPixels,
    matchedPixels,
    supportedPixels,
    meanProbability: matchedPixels ? probabilitySum / matchedPixels : 0,
    supportRatio: matchedPixels ? supportedPixels / matchedPixels : 0,
    matchedRatio: validPixels ? matchedPixels / validPixels : 0,
  };
}

function shouldKeepDustFallbackRoi(roi = {}, width = 0, height = 0, validMask = null, dustSupportProbabilities = null) {
  const support = summarizeDustSupportInRoi(roi, width, height, validMask, dustSupportProbabilities);
  if (support.matchedPixels <= 0 || support.matchedRatio < 0.2) {
    return true;
  }

  return support.meanProbability >= 0.16 || support.supportRatio >= 0.045;
}

function overlapArea(left, right) {
  const xOverlap = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX));
  const yOverlap = Math.max(0, Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY));
  return xOverlap * yOverlap;
}

export function fallbackWindows(scores, validMask, width, height, maxRois, prefix, options = {}) {
  const minMeanScore = Number(options.minMeanScore) || 0;
  const minPeakScore = Number(options.minPeakScore) || 0;
  const stepDivisor = clamp(Math.round(Number(options.stepDivisor) || 5), 3, 24);
  const minWindowPx = Math.max(12, Math.round(Number(options.minWindowPx) || 24));
  const strideRatio = clamp(Number(options.strideRatio) || 0.7, 0.4, 0.92);
  const windows = [];
  const stepX = Math.max(minWindowPx, Math.floor(width / stepDivisor));
  const stepY = Math.max(minWindowPx, Math.floor(height / stepDivisor));
  const strideX = Math.max(8, Math.floor(stepX * strideRatio));
  const strideY = Math.max(8, Math.floor(stepY * strideRatio));

  for (let top = 0; top < height - stepY; top += strideY) {
    for (let left = 0; left < width - stepX; left += strideX) {
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
    if (mode === "fallback") {
      return `基于 ${label} 已回退到 ${rois.length} 个保守热异常窗口。`;
    }
    return `基于 ${label} 自动确认到 ${rois.length} 个热异常热点簇。`;
  }

  if (mode === "fallback") {
    return `AOD 高值连通域不足，已回退到 ${rois.length} 个高分窗口。`;
  }

  return `基于 ${label} 自动提取到 ${rois.length} 个异常聚类。`;
}

export function buildRois(
  imageData,
  scenario,
  {
    visualImageData = null,
    cloudMaskResult = null,
    legendPalette = null,
    cloudGuideResult = null,
    dustSupportResult = null,
    dustScreeningResult = null,
  } = {}
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
          guideMaskResult: cloudGuideResult,
        })
      : {
          mask: new Uint8Array(width * height),
          maskedRatio: 0,
          threshold: null,
          applied: false,
          guideApplied: false,
          guideMaskedRatio: null,
          guideSourceLabel: "",
          methodLabel: "未启用去云抑制",
        };
  const scoreValues = [];
  let opaquePixels = 0;
  let suppressedCloudPixels = 0;
  let legendMatchedPixels = 0;
  let dustSupportedPixels = 0;
  let dustScreenedPixels = 0;
  const dustSupportProbabilities =
    scenario.type === "dust" &&
    dustSupportResult?.probabilities instanceof Float32Array &&
    dustSupportResult.probabilities.length === width * height
      ? dustSupportResult.probabilities
      : null;
  const dustWaterMask =
    scenario.type === "dust" &&
    dustScreeningResult?.screeningKind === "water-mask" &&
    dustScreeningResult?.mask instanceof Uint8Array &&
    dustScreeningResult.mask.length === width * height
      ? dustScreeningResult.mask
      : null;

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
    if (dustWaterMask?.[pixelIndex]) {
      dustScreenedPixels += 1;
      continue;
    }

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const legendMatch = scorePixelAgainstLegend(r, g, b, legendPalette);
    let score = legendMatch?.matched ? legendMatch.score : scorePixel(r, g, b, scenario.type);
    const dustSupportProbability = dustSupportProbabilities ? dustSupportProbabilities[pixelIndex] : -1;
    if (scenario.type === "dust" && Number.isFinite(dustSupportProbability) && dustSupportProbability >= 0) {
      if (dustSupportProbability >= 0.55) {
        const supportWeight = dustSupportProbability >= 0.82 ? 0.3 : 0.22;
        score = clamp(Math.max(score, score * (1 - supportWeight) + dustSupportProbability * supportWeight), 0, 1);
      } else if (dustSupportProbability <= 0.08) {
        score = clamp(score * 0.58, 0, 1);
      } else if (dustSupportProbability <= 0.18) {
        score = clamp(score * 0.74, 0, 1);
      }
      if (dustSupportProbability >= 0.55) {
        dustSupportedPixels += 1;
      }
    }

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
    const dustSupportRatio = round(dustSupportedPixels / Math.max(1, scoreValues.length || 1), 3);
    const reliability = assessDetectionReliability({
      analysisConfig,
      taskType: scenario.type,
      scoreValues,
      validPixelRatio,
      cloudSuppressedRatio,
      legendMatchedRatio: 0,
      dustSupportRatio,
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
        surfaceMask: dustWaterMask,
        source: "analysis-grid",
      },
      validPixelRatio,
      cloudSuppressedRatio,
      cloudSuppressionApplied: cloudSuppression.applied || Boolean(analysisConfig.cloudFilteredProduct),
      threshold: null,
      scoreMode: legendMatchedPixels > 0 ? "legend-calibrated" : "rgb-heuristic",
      legendMatchedRatio: 0,
      dustSupportRatio,
      dustSupportApplied: Boolean(dustSupportResult?.matchedPixels),
      dustSupportSourceLabel: dustSupportResult?.sourceLabel || "",
      dustScreenedRatio: round(dustScreenedPixels / Math.max(1, opaquePixels), 3),
      dustScreeningApplied: Boolean(dustScreeningResult?.matchedPixels),
      dustScreeningSourceLabel: dustScreeningResult?.sourceLabel || "",
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
    captureComponentPixels: scenario.type === "dust",
  });
  const components =
    scenario.type === "dust"
      ? adaptiveSelection.components.filter((component) => !shouldRejectDustComponent(component, dustSupportProbabilities))
      : adaptiveSelection.components;
  const largestComponentRatio = components[0]
    ? round(componentFootprint(components[0], width, height, scoreValues.length).coverageRatio, 3)
    : 0;
  const validPixelRatio = isThermalHotspot
    ? estimateThermalValidPixelRatio(scenario, cloudMaskResult)
    : round(scoreValues.length / Math.max(1, opaquePixels), 3);
  const cloudSuppressedRatio = isThermalHotspot
    ? round(clamp(Number(cloudMaskResult?.estimatedCoverage) || scenario.baseCloudCover || 0, 0, 0.88), 3)
    : round(suppressedCloudPixels / Math.max(1, opaquePixels), 3);
  const legendMatchedRatio = round(legendMatchedPixels / Math.max(1, scoreValues.length), 3);
  const dustSupportRatio = round(dustSupportedPixels / Math.max(1, scoreValues.length), 3);
  const reliability = assessDetectionReliability({
    analysisConfig,
    taskType: scenario.type,
    scoreValues,
    validPixelRatio,
    cloudSuppressedRatio,
    legendMatchedRatio,
    dustSupportRatio,
    components,
    threshold: adaptiveSelection.threshold ?? baseThreshold,
    largestComponentRatio,
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
  } else if (
    shouldRouteToWindowFallback({
      taskType: scenario.type,
      componentCount: components.length,
      allowWindowFallback,
      reliability,
    })
  ) {
    const fallbackThreshold = adaptiveSelection.threshold ?? baseThreshold;
    const thermalFallback = isThermalHotspot;
    rois = fallbackWindows(
      scores,
      validMask,
      width,
      height,
      scenario.analysisProfile.maxRois,
      scenario.analysisProfile.prefix,
      {
        minMeanScore: thermalFallback
          ? Math.max(
              0.72,
              Math.min(
                0.9,
                Math.max(reliability.stats?.median ?? 0, reliability.stats?.peak ?? 0, fallbackThreshold) - 0.014
              )
            )
          : Math.min(0.96, fallbackThreshold + (scenario.type === "dust" ? -0.015 : 0.02)),
        minPeakScore: thermalFallback
          ? Math.max(
              0.74,
              Math.min(
                0.94,
                Math.max(reliability.stats?.upper ?? 0, reliability.stats?.max ?? 0, fallbackThreshold) - 0.004
              )
            )
          : Math.min(0.99, fallbackThreshold + (scenario.type === "dust" ? 0.015 : 0.06)),
        stepDivisor: thermalFallback ? 18 : scenario.type === "dust" ? 6 : 5,
        minWindowPx: thermalFallback ? 12 : scenario.type === "dust" ? 18 : 24,
        strideRatio: thermalFallback ? 0.48 : scenario.type === "dust" ? 0.58 : 0.7,
      }
    ).map((roi) => ({
      ...roi,
      detectionConfidence: round(
        clamp(reliability.confidence - (thermalFallback ? 0.06 : scenario.type === "dust" ? 0.04 : 0.08), 0.08, 0.94),
        3
      ),
      detectionMode: thermalFallback ? "thermal-window-fallback" : "window-fallback",
    }));
    if (scenario.type === "dust") {
      rois = rois.filter((roi) => shouldKeepDustFallbackRoi(roi, width, height, validMask, dustSupportProbabilities));
    }
    if (!rois.length && scenario.type === "dust") {
      rois = fallbackWindows(
        scores,
        validMask,
        width,
        height,
        scenario.analysisProfile.maxRois,
        scenario.analysisProfile.prefix,
        {
          minMeanScore: Math.max(0.16, Math.min(0.92, (adaptiveSelection.threshold ?? baseThreshold) - 0.045)),
          minPeakScore: Math.max(0.2, Math.min(0.96, (adaptiveSelection.threshold ?? baseThreshold) - 0.005)),
          stepDivisor: 8,
          minWindowPx: 14,
          strideRatio: 0.5,
        }
      ).map((roi) => ({
        ...roi,
        detectionConfidence: round(clamp(reliability.confidence - 0.08, 0.08, 0.9), 3),
        detectionMode: "window-fallback-soft",
      }));
      rois = rois.filter((roi) => shouldKeepDustFallbackRoi(roi, width, height, validMask, dustSupportProbabilities));
    }
    overlayPoints = buildOverlayPointsFromRois(rois, {
      validRegion: {
        width,
        height,
        validMask,
        cloudMask: cloudSuppression.mask,
        surfaceMask: dustWaterMask,
        source: "analysis-grid",
      },
      minPointsPerRoi: 3,
    });
    const sampledOverlayPoints = buildOverlayPointsFromScoreWindows(rois, scores, validMask, width, height, {
      maxPointsPerRoi: 72,
      minPointsPerRoi: 3,
      minScore: Math.max(0, (adaptiveSelection.threshold ?? baseThreshold) - (scenario.type === "dust" ? 0.12 : 0.03)),
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
      dustSupportRatio,
      dustSupportApplied: Boolean(dustSupportResult?.matchedPixels),
      dustSupportSourceLabel: dustSupportResult?.sourceLabel || "",
      dustScreenedRatio: round(dustScreenedPixels / Math.max(1, opaquePixels), 3),
      dustScreeningApplied: Boolean(dustScreeningResult?.matchedPixels),
      dustScreeningSourceLabel: dustScreeningResult?.sourceLabel || "",
      largestComponentRatio,
    reliability,
    abstained,
    abstentionReason,
    decloudPreview: buildDecloudPreviewAsset(visualImageData, cloudSuppression),
    summary:
      abstained
        ? abstentionReason
        : fallbackUsed && rois.length
        ? detectionSummary(analysisConfig, rois, "fallback")
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

function shiftDay(date, offsetDays = 0) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + offsetDays);
  return shifted;
}

function bboxSpan(bbox = []) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return { lonSpan: 0, latSpan: 0 };
  }

  return {
    lonSpan: Math.max(0, Number(bbox[2]) - Number(bbox[0])),
    latSpan: Math.max(0, Number(bbox[3]) - Number(bbox[1])),
  };
}

function bboxArea(bbox = []) {
  const { lonSpan, latSpan } = bboxSpan(bbox);
  return lonSpan * latSpan;
}

function intersectBboxes(left = [], right = []) {
  if (!Array.isArray(left) || left.length !== 4 || !Array.isArray(right) || right.length !== 4) {
    return null;
  }

  const west = Math.max(Number(left[0]), Number(right[0]));
  const south = Math.max(Number(left[1]), Number(right[1]));
  const east = Math.min(Number(left[2]), Number(right[2]));
  const north = Math.min(Number(left[3]), Number(right[3]));

  if (!(east > west && north > south)) {
    return null;
  }

  return [west, south, east, north];
}

function bboxCenter(bbox = []) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }

  return {
    lon: (Number(bbox[0]) + Number(bbox[2])) / 2,
    lat: (Number(bbox[1]) + Number(bbox[3])) / 2,
  };
}

export function shouldSearchSentinelOpportunity(profile = {}) {
  const bbox = profile?.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return false;
  }

  const { lonSpan, latSpan } = bboxSpan(bbox);
  return lonSpan > 0 && latSpan > 0 && lonSpan <= SENTINEL_OPPORTUNITY_MAX_LON_SPAN && latSpan <= SENTINEL_OPPORTUNITY_MAX_LAT_SPAN;
}

function sentinelPreviewUrl(feature = {}) {
  if (feature.thumbnailUrl) {
    return feature.thumbnailUrl;
  }

  const primary = String(feature.primaryAssetUrl || "");
  return /\.(jpe?g|png|webp)$/i.test(primary) ? primary : null;
}

function formatSentinelOpportunityTime(datetime) {
  if (!datetime) {
    return "unknown-time";
  }

  const parsed = new Date(datetime);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown-time";
  }

  return `${dayString(parsed)} ${pad2(parsed.getUTCHours())}:${pad2(parsed.getUTCMinutes())}Z`;
}

function scoreSentinelOpportunityCandidate(feature = {}, requestedBbox = [], observation = null) {
  const previewUrl = sentinelPreviewUrl(feature);
  const candidateBbox = Array.isArray(feature.bbox) ? feature.bbox.map((value) => Number(value)) : null;
  if (!previewUrl || !candidateBbox || candidateBbox.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const overlapBbox = intersectBboxes(candidateBbox, requestedBbox);
  if (!overlapBbox) {
    return null;
  }

  const overlapArea = bboxArea(overlapBbox);
  const candidateArea = bboxArea(candidateBbox);
  const requestArea = bboxArea(requestedBbox);
  const overlapToTile = candidateArea ? overlapArea / candidateArea : 0;
  const overlapToRequest = requestArea ? overlapArea / requestArea : 0;
  const cloudCover = Number(feature.cloudCover);
  const cloudRatio = Number.isFinite(cloudCover) ? clamp(cloudCover / 100, 0, 1) : 0.4;
  const cloudScore = 1 - cloudRatio;
  const observationTime = observation instanceof Date ? observation.getTime() : null;
  const candidateTime = feature.datetime ? new Date(feature.datetime).getTime() : null;
  const daysOffset =
    observationTime !== null && Number.isFinite(candidateTime)
      ? Math.abs(candidateTime - observationTime) / (24 * 60 * 60 * 1000)
      : SENTINEL_OPPORTUNITY_SEARCH_WINDOW_DAYS;
  const requestedLocalDay = localDayKey(observation);
  const candidateLocalDay = feature.datetime ? localDayKey(new Date(feature.datetime)) : "";
  const localDayOffset =
    requestedLocalDay && candidateLocalDay
      ? Math.abs(new Date(`${candidateLocalDay}T00:00:00`).getTime() - new Date(`${requestedLocalDay}T00:00:00`).getTime()) /
        (24 * 60 * 60 * 1000)
      : null;
  const timeScore = clamp(1 - daysOffset / (SENTINEL_OPPORTUNITY_SEARCH_WINDOW_DAYS + 1), 0, 1);
  const requestCenter = bboxCenter(requestedBbox);
  const candidateCenter = bboxCenter(candidateBbox);
  const centerDistanceScore =
    requestCenter && candidateCenter
      ? clamp(
          1 -
            Math.hypot(candidateCenter.lon - requestCenter.lon, candidateCenter.lat - requestCenter.lat) /
              Math.max(1, Math.hypot(...Object.values(bboxSpan(requestedBbox)))),
          0,
          1
        )
      : 0.5;
  const selectionScore = round(
    clamp(
      overlapToTile * 0.44 + overlapToRequest * 0.1 + cloudScore * 0.24 + timeScore * 0.12 + centerDistanceScore * 0.1,
      0,
      1
    ),
    3
  );

  return {
    ...feature,
    previewUrl,
    overlapToTile: round(overlapToTile, 3),
    overlapToRequest: round(overlapToRequest, 3),
    cloudRatio: round(cloudRatio, 3),
    daysOffset: round(daysOffset, 2),
    localDayOffset: Number.isFinite(localDayOffset) ? localDayOffset : null,
    sameLocalDay: localDayOffset === 0,
    centerDistanceScore: round(centerDistanceScore, 3),
    selectionScore,
    observationLabel: formatSentinelOpportunityTime(feature.datetime),
  };
}

export function selectSentinelOpportunityCandidate(features = [], requestedBbox = [], observation = null) {
  const ranked = features
    .map((feature) => scoreSentinelOpportunityCandidate(feature, requestedBbox, observation))
    .filter(Boolean)
    .sort((left, right) => {
      const scoreDiff = right.selectionScore - left.selectionScore;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const overlapDiff = right.overlapToTile - left.overlapToTile;
      if (overlapDiff !== 0) {
        return overlapDiff;
      }
      return (left.cloudCover ?? 100) - (right.cloudCover ?? 100);
    });
  const preferredPool = ranked.some((candidate) => candidate.sameLocalDay)
    ? ranked.filter((candidate) => candidate.sameLocalDay)
    : ranked;

  const pickTier = (predicate) =>
    preferredPool
      .filter(predicate)
      .sort((left, right) => {
        const timeDiff = (left.localDayOffset ?? left.daysOffset) - (right.localDayOffset ?? right.daysOffset);
        if (Math.abs(timeDiff) > 0.35) {
          return timeDiff;
        }
        const cloudDiff = (left.cloudCover ?? 100) - (right.cloudCover ?? 100);
        if (Math.abs(cloudDiff) > 4) {
          return cloudDiff;
        }
        return right.selectionScore - left.selectionScore;
      })[0] || null;

  const selected =
    pickTier((candidate) => candidate.overlapToTile >= 0.3 && (candidate.cloudCover ?? 100) <= 25) ||
    pickTier((candidate) => candidate.overlapToTile >= 0.35 && (candidate.cloudCover ?? 100) <= 40) ||
    pickTier((candidate) => candidate.overlapToTile >= 0.45 && (candidate.cloudCover ?? 100) <= 80) ||
    pickTier((candidate) => candidate.overlapToTile >= 0.3) ||
    preferredPool[0] ||
    ranked[0] ||
    null;

  return {
    selected,
    ranked,
  };
}

async function fetchSentinelOpportunityPreview(scenario, observation, { signal } = {}) {
  const profile = scenario?.imageryProfile;
  if (!shouldSearchSentinelOpportunity(profile) || typeof fetch !== "function") {
    return null;
  }

  const bbox = profile.bbox.map((value) => Number(value));
  const startDate = dayString(shiftDay(observation, -SENTINEL_OPPORTUNITY_SEARCH_WINDOW_DAYS));
  const endDate = dayString(shiftDay(observation, SENTINEL_OPPORTUNITY_SEARCH_WINDOW_DAYS));
  const cacheKey = `${bbox.join(",")}:${dayString(observation)}:${scenario?.type || "unknown"}`;

  if (!sentinelOpportunityCache.has(cacheKey)) {
    const request = fetch("/api/stac-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        providerId: "earth-search",
        collections: ["sentinel-2-l2a"],
        bbox,
        startDate,
        endDate,
        limit: 12,
        sourceLabel: profile.label || scenario?.title || "scene-area",
      }),
      signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        const payload = await response.json();
        const selection = selectSentinelOpportunityCandidate(payload.features || [], bbox, observation);
        const candidate = selection.selected;
        if (!candidate || candidate.selectionScore < 0.4 || candidate.sameLocalDay !== true) {
          const hasNearbyOffDay = selection.ranked.some(
            (item) => item.selectionScore >= 0.4 && item.sameLocalDay !== true
          );
          return {
            available: false,
            providerLabel: payload.providerLabel || "Earth Search v1",
            note: hasNearbyOffDay
              ? "当前窗口只命中错日 Sentinel-2 景。为避免把补充图误读成同日证据，本次不展示高分补充卡片。"
              : "当前窗口内没有命中可直接用于高分解释的同日 Sentinel-2 局部景。",
            rankedCandidates: selection.ranked.slice(0, 3),
            temporal_class: "T3",
            role: "refine",
            can_affect_detection: false,
            can_only_explain: true,
          };
        }

        return {
          available: true,
          providerLabel: payload.providerLabel || "Earth Search v1",
          sourceLabel: "Sentinel-2 L2A 局部高分补充",
          title: "Sentinel-2 局部高分补充",
          src: candidate.previewUrl,
          observationLabel: candidate.observationLabel,
          cloudCover: Number.isFinite(Number(candidate.cloudCover)) ? round(Number(candidate.cloudCover), 1) : null,
          overlapToTile: candidate.overlapToTile,
          overlapToRequest: candidate.overlapToRequest,
          tileId: candidate.id,
          sensor: "Sentinel-2 L2A",
          acquisition_start_utc: candidate.datetime || null,
          acquisition_end_utc: candidate.datetime || null,
          time_offset_min: Number.isFinite(Number(candidate.daysOffset)) ? Math.round(Number(candidate.daysOffset) * 24 * 60) : null,
          role: "refine",
          temporal_class: candidate.sameLocalDay ? "T2" : "T3",
          can_affect_detection: false,
          can_only_explain: true,
          note: `命中 ${candidate.observationLabel} 的 Sentinel-2 局部景，云量 ${
            Number.isFinite(Number(candidate.cloudCover)) ? `${round(Number(candidate.cloudCover), 1)}%` : "unknown"
          }。该视图只用于高分解释和局部核验，不参与当前异常定量与去云门禁。`,
          detail:
            candidate.overlapToRequest >= 0.18
              ? "当前局部高分景已覆盖当前区域的重要部分，可用于向导师快速解释纹理、云边界和局部异常背景。"
              : "当前局部高分景只覆盖所选区域的一部分，更适合作为局部核验和展示细节，不替代当前主检测底图。",
          rankedCandidates: selection.ranked.slice(0, 3),
        };
      })
      .catch((error) => {
        if (isAbortError(error)) {
          sentinelOpportunityCache.delete(cacheKey);
          throw error;
        }
        return null;
      });

    sentinelOpportunityCache.set(cacheKey, request);
    trimCache(sentinelOpportunityCache, SENTINEL_OPPORTUNITY_CACHE_LIMIT, cacheKey);
  }

  return sentinelOpportunityCache.get(cacheKey);
}

export function shouldSearchModis250mSupplement(scenario = {}) {
  const profile = scenario?.imageryProfile;
  const bbox = Array.isArray(profile?.bbox) ? profile.bbox.map((value) => Number(value)) : [];
  return scenario?.type === "wildfire" && bbox.length === 4 && bbox.every((value) => Number.isFinite(value));
}

export function selectModis250mSupplementCandidate(candidates = [], observation = null) {
  const taskHour = observation instanceof Date ? observation.getHours() + observation.getMinutes() / 60 : null;
  const ranked = candidates
    .filter(Boolean)
    .map((candidate) => {
      const visualQuality = candidate.visualQuality || {};
      const clearViewScore = Number.isFinite(visualQuality.clearViewScore) ? visualQuality.clearViewScore : 0.45;
      const cloudLikeRatio = Number.isFinite(visualQuality.cloudLikeRatio) ? visualQuality.cloudLikeRatio : 0.5;
      const sensorHour = nominalObservationHour(candidate);
      const taskVsDisplayHours =
        Number.isFinite(taskHour) && sensorHour !== null ? round(Math.abs(taskHour - sensorHour), 1) : null;
      const timeScore =
        taskVsDisplayHours === null ? 0.5 : clamp(1 - Math.min(taskVsDisplayHours, 12) / 12, 0, 1);
      const resolutionScore = Number(candidate.spatialResolutionMeters) === 250 ? 1 : 0.72;
      const selectionScore = round(
        clamp(clearViewScore * 0.48 + (1 - cloudLikeRatio) * 0.2 + timeScore * 0.22 + resolutionScore * 0.1, 0.02, 0.99),
        3
      );

      return {
        ...candidate,
        taskVsDisplayHours,
        selectionScore,
      };
    })
    .sort((left, right) => {
      const scoreDiff = right.selectionScore - left.selectionScore;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const clearDiff = (right.visualQuality?.clearViewScore || 0) - (left.visualQuality?.clearViewScore || 0);
      if (clearDiff !== 0) {
        return clearDiff;
      }
      return (left.defaultPriority || 99) - (right.defaultPriority || 99);
    });

  return {
    selected: ranked[0] || null,
    ranked,
  };
}

async function fetchModis250mSupplementPreview(scenario, observation, { signal } = {}) {
  if (!shouldSearchModis250mSupplement(scenario)) {
    return null;
  }

  const profile = scenario.imageryProfile;
  const bbox = profile.bbox.map((value) => Number(value));
  const day = dayString(observation);
  const availableCandidates = [];

  for (const layerId of MODIS_250M_SUPPLEMENT_LAYER_IDS) {
    const imageryConfig = getImageryLayerConfig(layerId);
    if (Number(imageryConfig.spatialResolutionMeters) !== 250) {
      continue;
    }
    if (await probeLayerAvailability(imageryConfig.layer, bbox, day, { signal })) {
      const visualQuality = await fetchVisualSourceQuality(imageryConfig, profile, day, { signal }).catch((error) => {
        if (isAbortError(error)) {
          throw error;
        }
        return null;
      });

      availableCandidates.push({
        layerId,
        layer: imageryConfig.layer,
        label: imageryConfig.label,
        sensor: imageryConfig.sensor,
        platform: imageryConfig.platform,
        nominalObservationHour: imageryConfig.nominalObservationHour,
        spatialResolutionMeters: imageryConfig.spatialResolutionMeters,
        resolutionLabel: imageryConfig.resolutionLabel || `${imageryConfig.spatialResolutionMeters}m`,
        defaultPriority: imageryConfig.defaultPriority,
        providerLabel: imageryConfig.provider,
        visualQuality,
      });
    }
  }

  const selection = selectModis250mSupplementCandidate(availableCandidates, observation);
  const candidate = selection.selected;
  if (!candidate) {
    return null;
  }

  const width = Math.max(320, Number(profile.displayWidth) || 640);
  const height = Math.max(180, Number(profile.displayHeight) || Math.round(width / 1.7));

  return {
    available: true,
    kind: "modis-250m",
    role: "visual-context",
    can_affect_detection: false,
    can_only_explain: true,
    providerLabel: candidate.providerLabel || "NASA GIBS",
    sourceLabel: "MODIS 250m true-color supplement",
    title: `${candidate.label} ${candidate.resolutionLabel || "250m"}`,
    src: buildGetMapUrl({
      layer: candidate.layer,
      bbox,
      width,
      height,
      time: day,
      format: "image/jpeg",
      transparent: false,
    }),
    layerId: candidate.layerId,
    layer: candidate.layer,
    sensor: candidate.sensor,
    platform: candidate.platform,
    spatialResolutionMeters: candidate.spatialResolutionMeters,
    resolutionLabel: candidate.resolutionLabel || "250m",
    observationLabel:
      candidate.taskVsDisplayHours === null
        ? `${day} nominal ${candidate.platform || "MODIS"} overpass`
        : `${day} nominal ${candidate.platform || "MODIS"} overpass, task offset ${candidate.taskVsDisplayHours}h`,
    clearViewScore: candidate.visualQuality?.clearViewScore ?? null,
    cloudLikeRatio: candidate.visualQuality?.cloudLikeRatio ?? null,
    note: "Official MODIS 250m true-color context; it does not replace FIRMS/VIIRS wildfire detection.",
    detail:
      "This panel adds same-day MODIS 250m visual context for texture, smoke, burn perimeter hints and manual review. FIRMS live/local-cache points and the strict VIIRS thermal chain remain the detection sources.",
    rankedCandidates: selection.ranked.slice(0, 2),
  };
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

export function resolvePreferredCloudMaskProductId(visualSource = {}, analysisConfig = {}) {
  const strictChain = strictTaskChain(analysisConfig);
  if (strictChain?.cloudMaskProductId) {
    return strictChain.cloudMaskProductId;
  }

  if (analysisConfig.applyVisualCloudSuppression !== false && visualSource.preferredCloudMaskProductId) {
    return visualSource.preferredCloudMaskProductId;
  }

  return analysisConfig.preferredCloudMaskProductId || visualSource.preferredCloudMaskProductId || null;
}

function preferredCloudMaskProductId(visualSource = {}, analysisConfig = {}) {
  return resolvePreferredCloudMaskProductId(visualSource, analysisConfig);
}

export function resolveCloudGuideConfig(analysisConfig = {}, observation = null) {
  const selectionMode = analysisConfig.cloudGuideSelectionMode || "observation-hour";
  const hour = observation instanceof Date ? observation.getHours() : 12;
  const useNightLayer = selectionMode === "day-night" && (hour <= 6 || hour >= 18);
  const layer = useNightLayer
    ? analysisConfig.cloudGuideLayerNight || analysisConfig.cloudGuideLayerDay
    : analysisConfig.cloudGuideLayerDay || analysisConfig.cloudGuideLayerNight;
  if (!layer || !analysisConfig.cloudGuideColorMapId || !analysisConfig.cloudGuideValueKind) {
    return null;
  }

  return {
    layer,
    colorMapId: analysisConfig.cloudGuideColorMapId,
    valueKind: analysisConfig.cloudGuideValueKind,
    selectionMode,
    useNightLayer,
  };
}

async function fetchCloudGuideColorMap(colorMapId, { signal } = {}) {
  if (!colorMapId || typeof fetch !== "function") {
    return null;
  }

  const url = `https://gibs.earthdata.nasa.gov/colormaps/v1.0/${colorMapId}.xml`;
  if (!cloudGuideColorMapCache.has(url)) {
    const request = fetch(url, { signal })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const xmlText = await response.text();
        const entries = parseColorMapEntries(xmlText);
        return entries.length ? entries : null;
      })
      .catch((error) => {
        if (isAbortError(error)) {
          cloudGuideColorMapCache.delete(url);
          throw error;
        }
        return null;
      });

    cloudGuideColorMapCache.set(url, request);
    trimCache(cloudGuideColorMapCache, CLOUD_GUIDE_COLORMAP_CACHE_LIMIT, url);
  }

  return cloudGuideColorMapCache.get(url);
}

async function fetchCloudGuideAsset(
  scenario,
  analysisConfig,
  observation,
  width,
  height,
  { signal } = {}
) {
  const guideConfig = resolveCloudGuideConfig(analysisConfig, observation);
  const bbox = scenario?.imageryProfile?.bbox;
  const time = dayString(observation);
  if (!guideConfig || !Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }

  const key = `${guideConfig.layer}:${guideConfig.colorMapId}:${time}:${bbox.join(",")}:${width}x${height}`;
  if (!cloudGuideCache.has(key)) {
    const request = Promise.all([
      loadImageData(
        buildGetMapUrl({
          layer: guideConfig.layer,
          bbox,
          width,
          height,
          time,
          format: "image/png",
          transparent: true,
        }),
        width,
        height,
        { signal }
      ),
      fetchCloudGuideColorMap(guideConfig.colorMapId, { signal }),
    ])
      .then(([guideImage, colorMapEntries]) => {
        if (!guideImage?.imageData || !colorMapEntries?.length) {
          return null;
        }

        const guideMask = buildCloudGuideMask(guideImage.imageData, colorMapEntries, {
          valueKind: guideConfig.valueKind,
          probabilityThreshold: guideConfig.valueKind === "clear-sky-confidence" ? 0.38 : 0.36,
          distanceThreshold: guideConfig.valueKind === "clear-sky-confidence" ? 26 : 28,
        });

        return guideMask
          ? {
              ...guideMask,
              layer: guideConfig.layer,
              colorMapId: guideConfig.colorMapId,
              sourceLabel: guideConfig.layer,
            }
          : null;
      })
      .catch((error) => {
        if (isAbortError(error)) {
          cloudGuideCache.delete(key);
          throw error;
        }
        return null;
      });

    cloudGuideCache.set(key, request);
    trimCache(cloudGuideCache, CLOUD_GUIDE_CACHE_LIMIT, key);
  }

  return cloudGuideCache.get(key);
}

export function resolveDustSupportConfigs(analysisConfig = {}, visualSource = {}) {
  const configs = Array.isArray(analysisConfig?.dustSupportLayers) ? analysisConfig.dustSupportLayers : [];
  const strictChain = strictDustChain(analysisConfig);
  const strictPlatform = String(strictChain?.platform || "").toLowerCase();
  const preferredPlatform = String(visualSource?.platform || "").toLowerCase();

  return configs
    .filter((config) => config?.layer && config?.colorMapId && config?.supportKind)
    .filter((config) => !strictPlatform || String(config.platform || "").toLowerCase() === strictPlatform)
    .map((config) => {
      const platform = String(config.platform || "").toLowerCase();
      const platformPenalty = preferredPlatform && platform === preferredPlatform ? -20 : 0;
      return {
        ...config,
        __priority: (Number(config.priority) || 99) + platformPenalty,
      };
    })
    .sort((left, right) => left.__priority - right.__priority)
    .slice(0, 3);
}

export function resolveDustScreeningConfigs(analysisConfig = {}) {
  const strictChain = strictDustChain(analysisConfig);
  const strictPlatform = String(strictChain?.platform || "").toLowerCase();

  return (Array.isArray(analysisConfig?.dustScreeningLayers) ? analysisConfig.dustScreeningLayers : [])
    .filter((config) => config?.layer && config?.colorMapId && config?.screeningKind)
    .filter((config) => !strictPlatform || String(config.platform || "").toLowerCase() === strictPlatform)
    .sort((left, right) => (Number(left.priority) || 99) - (Number(right.priority) || 99))
    .slice(0, 2);
}

async function fetchDustScreeningAsset(config, scenario, observation, width, height, { signal } = {}) {
  const bbox = scenario?.imageryProfile?.bbox;
  const time = dayString(observation);
  if (!config?.layer || !config?.colorMapId || !config?.screeningKind || !Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }

  const key = `${config.layer}:${config.colorMapId}:${config.screeningKind}:${time}:${bbox.join(",")}:${width}x${height}`;
  if (!dustScreeningCache.has(key)) {
    const request = Promise.all([
      loadImageData(
        buildGetMapUrl({
          layer: config.layer,
          bbox,
          width,
          height,
          time,
          format: "image/png",
          transparent: true,
        }),
        width,
        height,
        { signal }
      ),
      fetchCloudGuideColorMap(config.colorMapId, { signal }),
    ])
      .then(([screeningImage, colorMapEntries]) => {
        if (!screeningImage?.imageData || !colorMapEntries?.length) {
          return null;
        }

        const screening = buildCategoricalScreeningMask(screeningImage.imageData, colorMapEntries, {
          screeningKind: config.screeningKind,
          probabilityThreshold: config.screeningKind === "water-mask" ? 0.92 : 0.55,
        });

        return screening
          ? {
              ...screening,
              layer: config.layer,
              sourceLabel: config.label || config.layer,
            }
          : null;
      })
      .catch((error) => {
        if (isAbortError(error)) {
          dustScreeningCache.delete(key);
          throw error;
        }
        return null;
      });

    dustScreeningCache.set(key, request);
    trimCache(dustScreeningCache, DUST_SCREENING_CACHE_LIMIT, key);
  }

  return dustScreeningCache.get(key);
}

function combineDustScreeningResults(results = []) {
  const usable = results.filter(Boolean);
  if (!usable.length) {
    return null;
  }

  const primary = usable[0];
  const pixelCount = primary.width * primary.height;
  const probabilities = new Float32Array(pixelCount);
  probabilities.fill(-1);
  const mask = new Uint8Array(pixelCount);
  let matchedPixels = 0;
  let maskedPixels = 0;
  let probabilitySum = 0;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    let combined = -1;
    for (const result of usable) {
      const probability = result.probabilities?.[pixelIndex];
      if (!Number.isFinite(probability) || probability < 0) {
        continue;
      }
      combined = Math.max(combined, clamp(probability, 0, 1));
    }

    if (combined < 0) {
      continue;
    }

    probabilities[pixelIndex] = combined;
    probabilitySum += combined;
    matchedPixels += 1;
    if (combined >= 0.92) {
      mask[pixelIndex] = 1;
      maskedPixels += 1;
    }
  }

  if (!matchedPixels) {
    return null;
  }

  return {
    width: primary.width,
    height: primary.height,
    mask,
    probabilities,
    matchedPixels,
    maskedPixels,
    maskedRatio: round(maskedPixels / matchedPixels, 3),
    meanProbability: round(probabilitySum / matchedPixels, 3),
    sourceLabel: usable.map((result) => result.sourceLabel).join(" + "),
    screeningKind: primary.screeningKind,
  };
}

async function fetchDustSupportAsset(config, scenario, observation, width, height, { signal } = {}) {
  const bbox = scenario?.imageryProfile?.bbox;
  const time = dayString(observation);
  if (!config?.layer || !config?.colorMapId || !Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }

  const key = `${config.layer}:${config.colorMapId}:${time}:${bbox.join(",")}:${width}x${height}`;
  if (!dustSupportCache.has(key)) {
    const request = Promise.all([
      loadImageData(
        buildGetMapUrl({
          layer: config.layer,
          bbox,
          width,
          height,
          time,
          format: "image/png",
          transparent: true,
        }),
        width,
        height,
        { signal }
      ),
      fetchCloudGuideColorMap(config.colorMapId, { signal }),
    ])
      .then(([supportImage, colorMapEntries]) => {
        if (!supportImage?.imageData || !colorMapEntries?.length) {
          return null;
        }

        const support =
          config.supportKind === "categorical-dust"
            ? buildCategoricalDustSupportMask(supportImage.imageData, colorMapEntries)
            : buildContinuousDustSupportMask(supportImage.imageData, colorMapEntries);

        return support
          ? {
              ...support,
              layer: config.layer,
              sourceLabel: config.label || config.layer,
              weight: Number.isFinite(Number(config.weight)) ? Number(config.weight) : 1,
            }
          : null;
      })
      .catch((error) => {
        if (isAbortError(error)) {
          dustSupportCache.delete(key);
          throw error;
        }
        return null;
      });

    dustSupportCache.set(key, request);
    trimCache(dustSupportCache, DUST_SUPPORT_CACHE_LIMIT, key);
  }

  return dustSupportCache.get(key);
}

function combineDustSupportResults(results = []) {
  const usable = results.filter(Boolean);
  if (!usable.length) {
    return null;
  }

  const primary = usable[0];
  const pixelCount = primary.width * primary.height;
  const probabilities = new Float32Array(pixelCount);
  probabilities.fill(-1);
  const mask = new Uint8Array(pixelCount);
  let matchedPixels = 0;
  let supportedPixels = 0;
  let probabilitySum = 0;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    let combined = -1;
    for (const result of usable) {
      const probability = result.probabilities?.[pixelIndex];
      if (!Number.isFinite(probability) || probability < 0) {
        continue;
      }
      combined = Math.max(combined, clamp(probability * (result.weight ?? 1), 0, 1));
    }

    if (combined < 0) {
      continue;
    }

    probabilities[pixelIndex] = combined;
    probabilitySum += combined;
    matchedPixels += 1;
    if (combined >= 0.55) {
      mask[pixelIndex] = 1;
      supportedPixels += 1;
    }
  }

  if (!matchedPixels) {
    return null;
  }

  return {
    width: primary.width,
    height: primary.height,
    mask,
    probabilities,
    matchedPixels,
    supportedPixels,
    supportRatio: round(supportedPixels / matchedPixels, 3),
    meanProbability: round(probabilitySum / matchedPixels, 3),
    sourceLabel: usable.map((result) => result.sourceLabel).join(" + "),
    sources: usable.map((result) => ({
      sourceLabel: result.sourceLabel,
      supportKind: result.supportKind,
      matchedPixels: result.matchedPixels,
      supportedPixels: result.supportedPixels,
      supportRatio: result.supportRatio,
      meanProbability: result.meanProbability,
    })),
  };
}

async function fetchDustSupport(scenario, visualSource, analysisConfig, observation, width, height, { signal } = {}) {
  if (scenario?.type !== "dust") {
    return null;
  }

  const configs = resolveDustSupportConfigs(analysisConfig, visualSource);
  if (!configs.length) {
    return null;
  }

  const results = await Promise.all(
    configs.map((config) =>
      fetchDustSupportAsset(config, scenario, observation, width, height, { signal }).catch((error) => {
        if (isAbortError(error)) {
          throw error;
        }
        return null;
      })
    )
  );

  return combineDustSupportResults(results);
}

async function fetchDustScreening(scenario, analysisConfig, observation, width, height, { signal } = {}) {
  if (scenario?.type !== "dust") {
    return null;
  }

  const configs = resolveDustScreeningConfigs(analysisConfig);
  if (!configs.length) {
    return null;
  }

  const results = await Promise.all(
    configs.map((config) =>
      fetchDustScreeningAsset(config, scenario, observation, width, height, { signal }).catch((error) => {
        if (isAbortError(error)) {
          throw error;
        }
        return null;
      })
    )
  );

  return combineDustScreeningResults(results);
}

async function fetchVisualSourceQuality(imageryConfig, profile, day, { signal } = {}) {
  const { width, height } = thumbnailDimensions(profile?.displayWidth, profile?.displayHeight, 96);
  const key = `${imageryConfig.id}:${day}:${profile?.bbox?.join(",") || ""}:${width}x${height}`;

  if (!visualSourceQualityCache.has(key)) {
    const request = loadImageData(
      buildGetMapUrl({
        layer: imageryConfig.layer,
        bbox: profile.bbox,
        width,
        height,
        time: day,
        format: "image/jpeg",
        transparent: false,
      }),
      width,
      height,
      { signal }
    )
      .then(({ imageData }) => summarizeVisualSourceQuality(imageData))
      .catch((error) => {
        if (isAbortError(error)) {
          visualSourceQualityCache.delete(key);
          throw error;
        }
        return null;
      });

    visualSourceQualityCache.set(key, request);
    trimCache(visualSourceQualityCache, VISUAL_SOURCE_QUALITY_CACHE_LIMIT, key);
  }

  return visualSourceQualityCache.get(key);
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
  const availableCandidates = [];

  for (const layerId of candidates) {
    const imageryConfig = getImageryLayerConfig(layerId);
    if (await probeLayerAvailability(imageryConfig.layer, profile.bbox, day, { signal })) {
      const visualQuality = await fetchVisualSourceQuality(imageryConfig, profile, day, { signal }).catch((error) => {
        if (isAbortError(error)) {
          throw error;
        }
        return null;
      });

      availableCandidates.push({
        layerId,
        layer: imageryConfig.layer,
        label: imageryConfig.label,
        sensor: imageryConfig.sensor,
        platform: imageryConfig.platform,
        nominalObservationHour: imageryConfig.nominalObservationHour,
        spatialResolutionMeters: imageryConfig.spatialResolutionMeters ?? null,
        resolutionLabel: imageryConfig.resolutionLabel || "",
        defaultPriority: imageryConfig.defaultPriority,
        preferredCloudMaskProductId: imageryConfig.preferredCloudMaskProductId,
        cadenceNote: imageryConfig.cadenceLabel,
        visualQuality,
      });
    }
  }

  if (availableCandidates.length) {
    const selection = selectVisualSourceCandidate(availableCandidates, analysisConfig, observation);
    const selected = selection.selected;
    if (selected) {
      return {
        ...selected,
        time: day,
        note:
          observation.getHours() === 0
            ? `当前显示的是 ${day} 的 ${selected.label}。${selection.selectionReason}`
            : `当前显示的是 ${day} 的 ${selected.label}；小时滑块用于设置任务发生时刻，而不是切换小时级底图。${selection.selectionReason}`,
        candidatesEvaluated: selection.ranked.map((candidate) => ({
          layerId: candidate.layerId,
          label: candidate.label,
          selectionScore: candidate.selectionScore,
          alignmentScore: candidate.alignment?.score || null,
          clearViewScore: candidate.visualQuality?.clearViewScore ?? null,
          cloudLikeRatio: candidate.visualQuality?.cloudLikeRatio ?? null,
        })),
        selectionReason: selection.selectionReason,
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
    spatialResolutionMeters: fallbackConfig.spatialResolutionMeters ?? null,
    resolutionLabel: fallbackConfig.resolutionLabel || "",
    preferredCloudMaskProductId: fallbackConfig.preferredCloudMaskProductId,
    time: day,
    cadenceNote: fallbackConfig.cadenceLabel,
    note: `当前优先使用 ${day} 的 ${fallbackConfig.label}。`,
  };
}

export async function fetchGlobalOverview(observationDate, { signal } = {}) {
  await ensureBasemapProxyReady();
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

function applyWildfireFirmsFirstStage(baseScenario, firmsOverlay = null, detected = null, analysisConfig = null) {
  if (!firmsOverlay?.available) {
    return baseScenario;
  }

  const nextScenario = {
    ...baseScenario,
    rois: firmsOverlay.rois,
    anomalyDensity:
      firmsOverlay.rois.length > 0
        ? Math.min(1, Math.max(Number(baseScenario.anomalyDensity) || 0, firmsOverlay.rois.length / 8))
        : baseScenario.anomalyDensity,
    analysis: {
      ...baseScenario.analysis,
      sourceLabel: "NASA FIRMS 官方火点 / VIIRS NRT",
      summary: `${firmsOverlay.description} 当前 wildfire 第一阶段优先使用官方 FIRMS 火点作为热点候选源，并按 sensor/acquisition time 执行时间一致性 discovery 与 clustering；去云后有效区域仅用于质量门禁和结果解释，不跨时相否决官方火点。`,
      method: "FIRMS official fire points + time-aware clustering",
      fireOverlay: {
        ...firmsOverlay,
        benchmarkMode: {
          operational: firmsOverlay.queryMode === "standard" ? "standard_snapshot" : "nrt",
          evaluation: "archived_snapshot",
        },
      },
      wmsTimeOverlay: analysisConfig
        ? {
            ...(baseScenario.analysis?.wmsTimeOverlay || {}),
            label: `${analysisConfig.label} WMS-Time`,
          }
        : baseScenario.analysis?.wmsTimeOverlay || null,
      fallbackThermalDetection:
        detected && Array.isArray(detected.rois)
          ? {
              roiCount: detected.rois.length,
              summary: detected.summary,
            }
          : null,
    },
    observation: {
      ...baseScenario.observation,
      summary: `${baseScenario.imagery.note} ${firmsOverlay.description} 当前默认优先展示 FIRMS nominal/high confidence 火点；active-fire detection 仅使用带明确 acquisition time 的近时 T0/T1 证据，既有热异常专题图链路只作为回退。`,
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
  await ensureBasemapProxyReady();
  const scenario = JSON.parse(JSON.stringify(baseScenario));
  const observation = new Date(scenario.observation.iso);
  const profile = scenario.imageryProfile;
  const analysisConfig = getAnalysisLayerConfig(scenario.analysisProfile.layerId);
  const pollutionChain = strictPollutionChain(analysisConfig);
  const dustChain = strictDustChain(analysisConfig);
  const thermalChain = strictThermalChain(analysisConfig);
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
    sourceLabel: `${visualSource.label}${visualSource.resolutionLabel ? ` / ${visualSource.resolutionLabel}` : ""} 路 ${visualSource.cadenceNote}`,
    note: `${visualSource.note} ${alignment.note}`,
    decloudPreviewSrc: "",
    decloudPreviewAvailable: false,
    decloudPreviewMaskedRatio: null,
    decloudPreviewNote: "",
    supplementalPreview: null,
    supplementalPreviews: [],
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
    dustModel:
      scenario.type === "dust"
        ? {
            id: dustChain?.modelId || "official-deep-blue-dust-identification",
            label: dustChain?.modelLabel || analysisConfig.dustModelLabel || "官方 Deep Blue 沙尘识别",
            method: dustChain?.method || analysisConfig.dustModelMethodLabel || analysisConfig.defaultMethodLabel || "dust-prior-supported-aod",
            analysisLayerLabel: analysisConfig.label,
            imageryLayerId: dustChain?.imageryLayerId || null,
            cloudMaskProductId: dustChain?.cloudMaskProductId || null,
            supportSourceLabel: "",
          }
        : null,
    dustSupport: null,
    thermalModel:
      isThermalHotspot && thermalChain
        ? {
            id: thermalChain.modelId,
            label: thermalChain.modelLabel,
            method: thermalChain.method,
            analysisLayerLabel: analysisConfig.label,
            imageryLayerId: thermalChain.imageryLayerId,
            cloudMaskProductId: thermalChain.cloudMaskProductId,
          }
        : null,
    pollutionModel:
      scenario.type === "pollution" && pollutionChain
        ? {
            id: pollutionChain.modelId,
            label: pollutionChain.modelLabel,
            method: pollutionChain.method,
            analysisLayerLabel: analysisConfig.label,
            imageryLayerId: pollutionChain.imageryLayerId,
            cloudMaskProductId: pollutionChain.cloudMaskProductId,
          }
        : null,
    fireOverlay: null,
    wmsTimeOverlay: {
      src: analysisUrl,
      label: `${analysisConfig.label} WMS-Time`,
      enabledByDefault: Boolean(scenario.fireDetectionProfile?.useWmsTimeOverlay),
    },
  };

  const modis250mSupplementPromise = fetchModis250mSupplementPreview(scenario, observation, { signal }).catch((error) => {
    if (isAbortError(error)) {
      throw error;
    }
    return null;
  });

  try {
    const [
      analysisImage,
      analysisVisualImage,
      autoCloudMask,
      analysisLegendPalette,
      cloudGuideResult,
      dustSupportResult,
      dustScreeningResult,
      sentinelOpportunity,
      modis250mSupplement,
      firmsFireOverlay,
    ] = await Promise.all([
      loadImageData(analysisUrl, analysisWidth, analysisHeight, { signal }),
      loadImageData(analysisVisualUrl, analysisWidth, analysisHeight, { signal }).catch((error) => {
        if (isAbortError(error)) {
          throw error;
        }
        return null;
      }),
      fetchAutoCloudMaskSummary(scenario, visualSource, analysisConfig, { signal }),
      fetchAnalysisLegendPalette(analysisConfig, { signal }),
      analysisConfig.applyVisualCloudSuppression !== false
        ? fetchCloudGuideAsset(scenario, analysisConfig, observation, analysisWidth, analysisHeight, { signal })
        : Promise.resolve(null),
      fetchDustSupport(scenario, visualSource, analysisConfig, observation, analysisWidth, analysisHeight, { signal }),
      fetchDustScreening(scenario, analysisConfig, observation, analysisWidth, analysisHeight, { signal }),
      fetchSentinelOpportunityPreview(scenario, observation, { signal }),
      modis250mSupplementPromise,
      isThermalHotspot
        ? fetchFirmsFireOverlay(scenario, observation, scenario.fireDetectionProfile || {}, { signal })
        : Promise.resolve(null),
    ]);
    const detected = buildRois(analysisImage.imageData, scenario, {
      visualImageData: analysisVisualImage?.imageData ?? null,
      cloudMaskResult: autoCloudMask,
      legendPalette: analysisLegendPalette,
      cloudGuideResult,
      dustSupportResult,
      dustScreeningResult,
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
    )}% 已参与异常提取。${
      cloudGuideResult?.matchedPixels
        ? ` 当前去云优先参考官方云导引层 ${cloudGuideResult.sourceLabel}。`
        : ""
    }${
      detected.dustScreeningApplied
        ? ` 当前沙尘链已先用 ${detected.dustScreeningSourceLabel} 剔除稳定水体，避免把湖面和内陆水体误判为沙尘异常。`
        : ""
    }${
      detected.dustSupportApplied
        ? ` 当前沙尘链额外参考 ${detected.dustSupportSourceLabel}，优先保留被官方 dust 先验支持的有效像元。`
        : ""
    }${detected.scoreMode === "legend-calibrated" ? " 当前评分已按官方专题图例色带校准。" : ""}${alignment.note}`;
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
    scenario.analysis.dustModel =
      scenario.type === "dust"
        ? {
            id: dustChain?.modelId || "official-deep-blue-dust-identification",
            label: dustChain?.modelLabel || analysisConfig.dustModelLabel || "官方 Deep Blue 沙尘识别",
            method: dustChain?.method || analysisConfig.dustModelMethodLabel || analysisConfig.defaultMethodLabel || "dust-prior-supported-aod",
            analysisLayerLabel: analysisConfig.label,
            imageryLayerId: dustChain?.imageryLayerId || null,
            cloudMaskProductId: dustChain?.cloudMaskProductId || null,
            supportSourceLabel: detected.dustSupportSourceLabel || "",
          }
        : null;
    scenario.analysis.thermalModel =
      isThermalHotspot && thermalChain
        ? {
            id: thermalChain.modelId,
            label: thermalChain.modelLabel,
            method: thermalChain.method,
            analysisLayerLabel: analysisConfig.label,
            imageryLayerId: thermalChain.imageryLayerId,
            cloudMaskProductId: thermalChain.cloudMaskProductId,
          }
        : null;
    scenario.analysis.dustSupport = detected.dustSupportApplied
      ? {
          sourceLabel: detected.dustSupportSourceLabel,
          supportRatio: detected.dustSupportRatio,
          sources: dustSupportResult?.sources || [],
        }
      : null;
    scenario.analysis.dustScreening = detected.dustScreeningApplied
      ? {
          sourceLabel: detected.dustScreeningSourceLabel,
          screenedRatio: detected.dustScreenedRatio,
          screeningKind: dustScreeningResult?.screeningKind || "water-mask",
        }
      : null;
    scenario.analysis.fireOverlay = firmsFireOverlay
      ? {
          ...firmsFireOverlay,
          benchmarkMode: {
            operational: firmsFireOverlay.queryMode === "standard" ? "standard_snapshot" : "nrt",
            evaluation: "archived_snapshot",
          },
        }
      : null;
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
        ? `当前异常检测已经在去云后的有效区域上执行${
            cloudGuideResult?.matchedPixels ? "，并优先参考官方云导引层" : ""
          }，但这次没有生成可切换的去云预览图。`
        : "当前显示的是原始遥感底图。");
    scenario.imagery.supplementalPreviews = [sentinelOpportunity, modis250mSupplement].filter(
      (preview) => preview?.available && preview?.src
    );
    scenario.imagery.supplementalPreview = scenario.imagery.supplementalPreviews[0] || null;
    scenario.observation.summary = isThermalHotspot
      ? `${visualSource.note} ${detected.summary} 已优先保持底图与热异常专题层对齐。${detected.scoreMode === "legend-calibrated" ? " 热异常强度评分已参考官方图例色带顺序。" : ""}`
      : `${visualSource.note} ${detected.summary} 已对亮白云区做抑制，并优先保持底图与分析层对齐。${detected.scoreMode === "legend-calibrated" ? " 异常强度评分已参考官方图例色带顺序。" : ""}`;
    if (sentinelOpportunity?.available) {
      scenario.observation.summary = `${scenario.observation.summary} 同时命中一景 Sentinel-2 局部高分补充，可用于结果解释与局部核验。`;
    }
    if (modis250mSupplement?.available) {
      scenario.observation.summary = `${scenario.observation.summary} MODIS 250m true-color supplement is available as visual context only; it does not change wildfire detection.`;
    }

    if (isThermalHotspot && firmsFireOverlay?.available) {
      return applyWildfireFirmsFirstStage(scenario, firmsFireOverlay, detected, analysisConfig);
    }
    if (isThermalHotspot && firmsFireOverlay && !firmsFireOverlay.available) {
      scenario.analysis.summary = `${scenario.analysis.summary} FIRMS 火点源当前不可用，已自动回退到既有热异常专题图链路。`;
    }

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
    const modis250mSupplement = await modis250mSupplementPromise;
    if (modis250mSupplement?.available && modis250mSupplement?.src) {
      scenario.imagery.supplementalPreviews = [modis250mSupplement];
      scenario.imagery.supplementalPreview = modis250mSupplement;
      scenario.observation.summary = `${scenario.observation.summary} MODIS 250m true-color supplement is available as visual context only; it does not change wildfire detection.`;
    }
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
    visualSourceQualityCacheSize: visualSourceQualityCache.size,
    cloudGuideCacheSize: cloudGuideCache.size,
    cloudGuideColorMapCacheSize: cloudGuideColorMapCache.size,
    dustSupportCacheSize: dustSupportCache.size,
    dustScreeningCacheSize: dustScreeningCache.size,
    sentinelOpportunityCacheSize: sentinelOpportunityCache.size,
  };
}
