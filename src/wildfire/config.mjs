const REQUESTED_WINDOW_DAYS = [1, 3, 5, 7];
const API_WINDOW_DAYS = [1, 2, 3, 4, 5];

export const wildfireTemporalDefaults = {
  discovery_bin_h: 6,
  max_cross_sensor_merge_min: 120,
  max_refine_offset_h: 24,
  stale_context_cannot_veto: true,
  time_policy: "strict_temporal_consistency_v1",
};

export const wildfireDefaultSensors = [
  "VIIRS_NOAA21_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_SNPP_NRT",
];

export const wildfireOptionalSensors = ["MODIS_NRT"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toUtcMidnight(dateString = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) {
    return null;
  }
  const parsed = new Date(`${dateString}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeWildfireRequestedDayRange(dayRange = 1) {
  const normalized = Math.round(Number(dayRange) || 1);
  return REQUESTED_WINDOW_DAYS.includes(normalized) ? normalized : 1;
}

export function normalizeFirmsApiDayRange(dayRange = 1) {
  const normalized = Math.round(Number(dayRange) || 1);
  if (!API_WINDOW_DAYS.includes(normalized)) {
    throw new Error("FIRMS Area API only supports day ranges between 1 and 5 days.");
  }
  return normalized;
}

export function windowHoursForDayRange(dayRange = 1) {
  return (
    {
      1: 24,
      3: 72,
      5: 120,
      7: 168,
    }[normalizeWildfireRequestedDayRange(dayRange)] || 24
  );
}

export function wildfireWindowLabel(dayRange = 1) {
  return (
    {
      1: "24h",
      3: "72h",
      5: "5d",
      7: "7d",
    }[normalizeWildfireRequestedDayRange(dayRange)] || `${dayRange}d`
  );
}

export function addUtcDays(dateString = "", offsetDays = 0) {
  const base = toUtcMidnight(dateString);
  if (!base) {
    return null;
  }
  const shifted = new Date(base.getTime() + Math.round(Number(offsetDays) || 0) * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function normalizeUtcDateString(date = null) {
  if (!date) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  }
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return String(date);
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return normalizeUtcDateString(null);
  }
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}

export function buildFirmsQuerySlices(dayRange = 1, anchorDate = null) {
  const requestedWindowDays = normalizeWildfireRequestedDayRange(dayRange);
  const safeAnchorDate = normalizeUtcDateString(anchorDate);

  if (requestedWindowDays !== 7) {
    return [
      {
        sliceId: `window-${requestedWindowDays}d`,
        requestedWindowDays,
        apiDayRange: normalizeFirmsApiDayRange(requestedWindowDays),
        date: safeAnchorDate,
        label: wildfireWindowLabel(requestedWindowDays),
        segmentStartDate: addUtcDays(safeAnchorDate, -(requestedWindowDays - 1)),
        segmentEndDate: safeAnchorDate,
      },
    ];
  }

  const olderAnchor = addUtcDays(safeAnchorDate, -5);
  return [
    {
      sliceId: "window-7d-older-2d",
      requestedWindowDays,
      apiDayRange: 2,
      date: olderAnchor,
      label: "7d segment 1/2",
      segmentStartDate: addUtcDays(olderAnchor, -1),
      segmentEndDate: olderAnchor,
    },
    {
      sliceId: "window-7d-recent-5d",
      requestedWindowDays,
      apiDayRange: 5,
      date: safeAnchorDate,
      label: "7d segment 2/2",
      segmentStartDate: addUtcDays(safeAnchorDate, -4),
      segmentEndDate: safeAnchorDate,
    },
  ];
}

export function buildWildfireQueryPlan(dayRange = 1, anchorDate = null) {
  const requestedWindowDays = normalizeWildfireRequestedDayRange(dayRange);
  const slices = buildFirmsQuerySlices(requestedWindowDays, anchorDate);
  const composed = requestedWindowDays === 7;
  return {
    requestedWindowDays,
    requestedWindowHours: windowHoursForDayRange(requestedWindowDays),
    windowLabel: wildfireWindowLabel(requestedWindowDays),
    anchorDate: normalizeUtcDateString(anchorDate),
    composed,
    sliceCount: slices.length,
    slices,
    label: composed
      ? "7d via stitched FIRMS Area API slices (2d + 5d)"
      : `${wildfireWindowLabel(requestedWindowDays)} via single FIRMS Area API slice`,
  };
}

export function normalizeWildfireTemporalPolicy(policy = {}) {
  const source = policy && typeof policy === "object" ? policy : {};
  return {
    discovery_bin_h: clamp(Math.round(Number(source.discovery_bin_h) || wildfireTemporalDefaults.discovery_bin_h), 1, 24),
    max_cross_sensor_merge_min: clamp(
      Math.round(Number(source.max_cross_sensor_merge_min) || wildfireTemporalDefaults.max_cross_sensor_merge_min),
      15,
      24 * 60
    ),
    max_refine_offset_h: clamp(
      Math.round(Number(source.max_refine_offset_h) || wildfireTemporalDefaults.max_refine_offset_h),
      1,
      7 * 24
    ),
    stale_context_cannot_veto:
      typeof source.stale_context_cannot_veto === "boolean"
        ? source.stale_context_cannot_veto
        : wildfireTemporalDefaults.stale_context_cannot_veto,
    time_policy: String(source.time_policy || wildfireTemporalDefaults.time_policy),
  };
}
