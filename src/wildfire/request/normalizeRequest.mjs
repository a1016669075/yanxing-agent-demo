import {
  buildWildfireQueryPlan,
  normalizeUtcDateString,
  normalizeWildfireRequestedDayRange,
  normalizeWildfireTemporalPolicy,
  wildfireDefaultSensors,
  wildfireWindowLabel,
  windowHoursForDayRange,
} from "../config.mjs";

function normalizeBBox(bbox = null) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }
  const normalized = bbox.map((value) => Number(value));
  return normalized.every((value) => Number.isFinite(value)) ? normalized : null;
}

function normalizeProducts(products = wildfireDefaultSensors) {
  const source = Array.isArray(products) ? products : wildfireDefaultSensors;
  const normalized = source
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : [...wildfireDefaultSensors];
}

function normalizeAnchorUtc(observation = null) {
  if (observation instanceof Date && !Number.isNaN(observation.getTime())) {
    return observation.toISOString();
  }
  if (typeof observation?.toISOString === "function") {
    const iso = observation.toISOString();
    if (iso) {
      return iso;
    }
  }
  if (typeof observation === "string") {
    const parsed = new Date(observation);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  const parsed = new Date(observation?.iso || observation?.request_anchor_utc || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function normalizeWildfireRequest(scenario, observation, config = {}) {
  const bbox = normalizeBBox(scenario?.focusSelection?.bbox || scenario?.imageryProfile?.bbox);
  const requestAnchorUtc = normalizeAnchorUtc(observation || scenario?.observation?.iso);
  const anchorDate = normalizeUtcDateString(requestAnchorUtc);
  const requestedWindowDays = normalizeWildfireRequestedDayRange(config.dayRange);
  const temporalPolicy = normalizeWildfireTemporalPolicy(config.temporal_state || config.temporalPolicy || {});
  const queryPlan = buildWildfireQueryPlan(requestedWindowDays, anchorDate);
  const products = normalizeProducts(config.products);
  const minimumConfidenceLevel = config.includeLowConfidence ? "low" : "nominal";

  return {
    provider: config.provider || "firms",
    mode: config.mode === "standard" ? "standard" : "nrt",
    bbox,
    anchorDate,
    requestAnchorUtc,
    queryPlan,
    products,
    requestedWindowDays,
    requestedWindowHours: windowHoursForDayRange(requestedWindowDays),
    minimumConfidenceLevel,
    includeLowConfidence: Boolean(config.includeLowConfidence),
    useWmsTimeOverlay: Boolean(config.useWmsTimeOverlay),
    windowLabel: wildfireWindowLabel(requestedWindowDays),
    temporalState: {
      request_anchor_utc: requestAnchorUtc,
      request_window_h: windowHoursForDayRange(requestedWindowDays),
      discovery_bin_h: temporalPolicy.discovery_bin_h,
      max_cross_sensor_merge_min: temporalPolicy.max_cross_sensor_merge_min,
      max_refine_offset_h: temporalPolicy.max_refine_offset_h,
      canonical_event_time_utc: requestAnchorUtc,
      evidence_time_span_min: 0,
      time_policy: temporalPolicy.time_policy,
      stale_context_cannot_veto: temporalPolicy.stale_context_cannot_veto,
    },
  };
}
