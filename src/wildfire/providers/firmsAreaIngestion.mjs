import { annotatePersistentHotspots } from "../memory/persistentHotspotMemory.mjs";

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeDaynight(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "N" ? "night" : normalized === "D" ? "day" : "unknown";
}

export function confidenceLevelValue(level = "unknown") {
  return (
    {
      low: 1,
      nominal: 2,
      high: 3,
      unknown: 0,
    }[String(level || "unknown").toLowerCase()] || 0
  );
}

export function normalizeFireConfidence(rawConfidence, product = "") {
  const raw = rawConfidence == null ? "" : String(rawConfidence).trim();
  const lower = raw.toLowerCase();
  const numeric = Number(raw);

  if (["high", "h", "9"].includes(lower)) {
    return { raw, level: "high", score: 0.92, label: "high" };
  }
  if (["nominal", "n", "7", "8"].includes(lower)) {
    return { raw, level: "nominal", score: 0.74, label: "nominal" };
  }
  if (["low", "l", "5", "6"].includes(lower)) {
    return { raw, level: "low", score: 0.42, label: "low" };
  }

  if (Number.isFinite(numeric)) {
    if (String(product || "").startsWith("MODIS")) {
      if (numeric >= 80) {
        return { raw, level: "high", score: 0.9, label: `${Math.round(numeric)}%` };
      }
      if (numeric >= 30) {
        return { raw, level: "nominal", score: 0.68, label: `${Math.round(numeric)}%` };
      }
      return { raw, level: "low", score: 0.36, label: `${Math.round(numeric)}%` };
    }

    if (numeric >= 80) {
      return { raw, level: "high", score: 0.9, label: `${Math.round(numeric)}%` };
    }
    if (numeric >= 50) {
      return { raw, level: "nominal", score: 0.7, label: `${Math.round(numeric)}%` };
    }
    return { raw, level: "low", score: 0.38, label: `${Math.round(numeric)}%` };
  }

  return {
    raw,
    level: "unknown",
    score: 0.5,
    label: raw || "unknown",
  };
}

export function parseAcqTimeUtc(acqDate = "", acqTime = "") {
  const cleanDate = String(acqDate || "").trim();
  const cleanTime = String(acqTime || "").trim().padStart(4, "0");
  if (!cleanDate || !/^\d{4}$/.test(cleanTime)) {
    return null;
  }
  const hour = cleanTime.slice(0, 2);
  const minute = cleanTime.slice(2, 4);
  const iso = `${cleanDate}T${hour}:${minute}:00.000Z`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function minutesBetweenUtc(left = null, right = null) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return null;
  }
  return Math.round((leftDate.getTime() - rightDate.getTime()) / (60 * 1000));
}

function sameUtcDay(left = null, right = null) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return false;
  }
  return (
    leftDate.getUTCFullYear() === rightDate.getUTCFullYear() &&
    leftDate.getUTCMonth() === rightDate.getUTCMonth() &&
    leftDate.getUTCDate() === rightDate.getUTCDate()
  );
}

function satelliteLabel(row = {}, product = "") {
  const source = String(row.satellite || row.instrument || "").trim().toUpperCase();
  if (source === "J1") {
    return "NOAA-20";
  }
  if (source === "J2") {
    return "NOAA-21";
  }
  if (source === "N") {
    return "SNPP";
  }
  if (source === "T") {
    return "Terra";
  }
  if (source === "A") {
    return "Aqua";
  }
  if (String(product || "").includes("NOAA21")) {
    return "NOAA-21";
  }
  if (String(product || "").includes("NOAA20")) {
    return "NOAA-20";
  }
  if (String(product || "").includes("SNPP")) {
    return "SNPP";
  }
  if (String(product || "").includes("MODIS")) {
    return "MODIS";
  }
  return source || "unknown";
}

function roleForTemporalClass(temporalClass = "T3") {
  return (
    {
      T0: "primary",
      T1: "corroboration",
      T2: "context",
      T3: "refine",
    }[temporalClass] || "context"
  );
}

function providerProvenance({
  provider = "firms",
  product = "",
  url = "",
  queryMode = "nrt",
  dayRange = 1,
  requestedWindowDays = dayRange,
  sliceId = "",
} = {}) {
  return {
    provider,
    product,
    url,
    queryMode,
    dayRange,
    requestedWindowDays,
    sliceId,
    generatedAt: new Date().toISOString(),
  };
}

function classifyTemporalFields({
  acquisitionStartUtc = null,
  anchorUtc = null,
  temporalState = {},
  confidenceLevel = "unknown",
  minimumConfidenceLevel = "low",
} = {}) {
  if (!acquisitionStartUtc || !anchorUtc) {
    return {
      time_offset_min: null,
      temporal_class: "T3",
      role: roleForTemporalClass("T3"),
      can_affect_detection: false,
      can_only_explain: true,
    };
  }

  const offsetMin = minutesBetweenUtc(acquisitionStartUtc, anchorUtc);
  const absOffset = Math.abs(Number(offsetMin) || 0);
  const discoveryWindowMin = Math.max(60, (Number(temporalState.discovery_bin_h) || 6) * 60);
  const crossSensorWindowMin = Math.max(15, Number(temporalState.max_cross_sensor_merge_min) || 120);
  const meetsConfidence =
    confidenceLevelValue(confidenceLevel) >= confidenceLevelValue(minimumConfidenceLevel || "low");

  let temporalClass = "T3";
  if (absOffset <= crossSensorWindowMin) {
    temporalClass = "T0";
  } else if (absOffset <= discoveryWindowMin) {
    temporalClass = "T1";
  } else if (sameUtcDay(acquisitionStartUtc, anchorUtc)) {
    temporalClass = "T2";
  }

  const temporalAllowsDetection = temporalClass === "T0" || temporalClass === "T1";
  const canAffectDetection = temporalAllowsDetection && meetsConfidence;

  return {
    time_offset_min: offsetMin,
    temporal_class: temporalClass,
    role: roleForTemporalClass(temporalClass),
    can_affect_detection: canAffectDetection,
    can_only_explain: !canAffectDetection,
  };
}

export function createFireDetection({
  id,
  source = "firms",
  product = "",
  sensor = "",
  satellite = "",
  lat,
  lon,
  acquisitionStartUtc = null,
  acquisitionEndUtc = null,
  confidence = null,
  frpMw = null,
  daynight = "unknown",
  scanKm = null,
  trackKm = null,
  provenance = null,
  querySlice = null,
  rawRow = null,
  temporalState = {},
  minimumConfidenceLevel = "low",
} = {}) {
  const normalizedConfidence = confidence || normalizeFireConfidence("", product);
  const acquisitionStart = acquisitionStartUtc || null;
  const acquisitionEnd = acquisitionEndUtc || acquisitionStart;
  const temporalFields = classifyTemporalFields({
    acquisitionStartUtc: acquisitionStart,
    anchorUtc: temporalState?.canonical_event_time_utc || temporalState?.request_anchor_utc || null,
    temporalState,
    confidenceLevel: normalizedConfidence.level,
    minimumConfidenceLevel,
  });

  return {
    id: id || `fire-${Math.random().toString(36).slice(2, 10)}`,
    source,
    product,
    sensor: sensor || product,
    satellite,
    lat: round(Number(lat) || 0, 6),
    lon: round(Number(lon) || 0, 6),
    acquisition_start_utc: acquisitionStart,
    acquisition_end_utc: acquisitionEnd,
    acqTimeUtc: acquisitionStart,
    confidence: clone(normalizedConfidence),
    frpMw: Number.isFinite(Number(frpMw)) ? round(Number(frpMw), 3) : null,
    daynight,
    scanKm: Number.isFinite(Number(scanKm)) ? round(Number(scanKm), 3) : null,
    trackKm: Number.isFinite(Number(trackKm)) ? round(Number(trackKm), 3) : null,
    provenance: provenance || providerProvenance({ provider: source, product }),
    querySlice: querySlice ? clone(querySlice) : null,
    rawRow: rawRow ? clone(rawRow) : null,
    ...temporalFields,
  };
}

function latestAcquisitionTime(detections = [], minimumConfidenceLevel = "low") {
  return (Array.isArray(detections) ? detections : [])
    .filter((item) => item?.acquisition_start_utc)
    .filter(
      (item) =>
        confidenceLevelValue(item?.confidence?.level) >= confidenceLevelValue(minimumConfidenceLevel || "low")
    )
    .map((item) => item.acquisition_start_utc)
    .sort((left, right) => String(right).localeCompare(String(left)))[0] || null;
}

export function reclassifyFireDetections(
  detections = [],
  {
    temporalState = {},
    canonicalEventTimeUtc = null,
    minimumConfidenceLevel = "low",
  } = {}
) {
  const effectiveAnchorUtc =
    canonicalEventTimeUtc ||
    latestAcquisitionTime(detections, minimumConfidenceLevel) ||
    temporalState?.canonical_event_time_utc ||
    temporalState?.request_anchor_utc ||
    null;
  const nextTemporalState = {
    ...temporalState,
    canonical_event_time_utc: effectiveAnchorUtc,
  };

  return annotatePersistentHotspots(
    (Array.isArray(detections) ? detections : []).map((item) => ({
      ...item,
      ...classifyTemporalFields({
        acquisitionStartUtc: item?.acquisition_start_utc || item?.acqTimeUtc,
        anchorUtc: effectiveAnchorUtc,
        temporalState: nextTemporalState,
        confidenceLevel: item?.confidence?.level,
        minimumConfidenceLevel,
      }),
    }))
  );
}

export function buildFireDetectionsFromFirmsRows(
  rows = [],
  {
    provider = "firms",
    queryMode = "nrt",
    dayRange = 1,
    requestedWindowDays = dayRange,
    minimumConfidenceLevel = "low",
    temporalState = {},
    product = "",
    sensor = "",
    slice = null,
  } = {}
) {
  const sliceMeta = slice
    ? {
        sliceId: slice.sliceId || null,
        label: slice.label || "",
        product: slice.product || product || sensor || "",
        apiDayRange: Number(slice.apiDayRange || dayRange || 1),
        date: slice.date || null,
        requestedWindowDays: Number(slice.requestedWindowDays || requestedWindowDays || dayRange || 1),
      }
    : null;
  const created = (Array.isArray(rows) ? rows : [])
    .map((row, index) =>
      createFireDetection({
        id:
          row.id ||
          [
            provider,
            row.product || product || sensor || "product",
            row.latitude || index,
            row.longitude || index,
            row.acq_date || "date",
            row.acq_time || "time",
          ].join(":"),
        source: provider,
        product: row.product || product || sensor || "",
        sensor: sensor || row.product || product || "",
        satellite: satelliteLabel(row, row.product || product || sensor || ""),
        lat: row.latitude,
        lon: row.longitude,
        acquisitionStartUtc: parseAcqTimeUtc(row.acq_date, row.acq_time),
        acquisitionEndUtc: parseAcqTimeUtc(row.acq_date, row.acq_time),
        confidence: normalizeFireConfidence(row.confidence, row.product || product || sensor || ""),
        frpMw: row.frp,
        daynight: normalizeDaynight(row.daynight),
        scanKm: row.scan,
        trackKm: row.track,
        provenance: providerProvenance({
          provider,
          product: row.product || product || sensor || "",
          url: row.requestedUrl || "",
          queryMode,
          dayRange,
          requestedWindowDays,
          sliceId: sliceMeta?.sliceId || "",
        }),
        querySlice: sliceMeta,
        rawRow: null,
        temporalState,
        minimumConfidenceLevel,
      })
    )
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));

  return reclassifyFireDetections(created, {
    temporalState,
    minimumConfidenceLevel,
  });
}

export function filterFireDetectionsByConfidence(detections = [], minimumLevel = "nominal") {
  const threshold = confidenceLevelValue(minimumLevel);
  return (Array.isArray(detections) ? detections : []).filter(
    (item) => confidenceLevelValue(item?.confidence?.level) >= threshold
  );
}

function normalizeSegments(payload = {}, request = {}) {
  if (Array.isArray(payload?.segments) && payload.segments.length) {
    return payload.segments.map((segment, index) => ({
      sliceId: segment.sliceId || `segment-${index + 1}`,
      product: segment.product || "",
      rows: Array.isArray(segment.rows) ? segment.rows : [],
      apiDayRange: Number(segment.apiDayRange || segment.dayRange || request?.requestedWindowDays || 1),
      date: segment.date || request?.anchorDate || null,
      requestedWindowDays: Number(segment.requestedWindowDays || request?.requestedWindowDays || 1),
      label: segment.label || "",
    }));
  }

  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const products = Array.isArray(payload?.products) && payload.products.length ? payload.products : request?.products || [];
  return products.map((product, index) => ({
    sliceId: `payload-product-${index + 1}`,
    product,
    rows: rows.filter((row) => String(row.product || product) === String(product)),
    apiDayRange: Number(payload.dayRange || request?.requestedWindowDays || 1),
    date: payload.date || request?.anchorDate || null,
    requestedWindowDays: Number(request?.requestedWindowDays || payload.dayRange || 1),
    label: "",
  }));
}

function groupSensorStreams(rawArchive = []) {
  const streamMap = new Map();
  (Array.isArray(rawArchive) ? rawArchive : []).forEach((item) => {
    const sensorKey = String(item?.sensor || item?.product || "unknown");
    if (!streamMap.has(sensorKey)) {
      streamMap.set(sensorKey, {
        sensor: sensorKey,
        satelliteLabels: new Set(),
        rawEvidence: [],
        detectionEvidence: [],
        slices: new Map(),
      });
    }
    const stream = streamMap.get(sensorKey);
    stream.satelliteLabels.add(item?.satellite || "unknown");
    stream.rawEvidence.push(item);
    if (item?.can_affect_detection) {
      stream.detectionEvidence.push(item);
    }

    const sliceId = item?.querySlice?.sliceId || "unsliced";
    if (!stream.slices.has(sliceId)) {
      stream.slices.set(sliceId, {
        sliceId,
        label: item?.querySlice?.label || sliceId,
        apiDayRange: item?.querySlice?.apiDayRange || item?.provenance?.dayRange || null,
        date: item?.querySlice?.date || null,
        rawEvidence: [],
        detectionEvidence: [],
      });
    }
    const slice = stream.slices.get(sliceId);
    slice.rawEvidence.push(item);
    if (item?.can_affect_detection) {
      slice.detectionEvidence.push(item);
    }
  });

  return [...streamMap.values()].map((stream) => ({
    sensor: stream.sensor,
    satelliteLabels: [...stream.satelliteLabels],
    rawEvidence: stream.rawEvidence.slice().sort((left, right) => String(left.acquisition_start_utc).localeCompare(String(right.acquisition_start_utc))),
    detectionEvidence: stream.detectionEvidence
      .slice()
      .sort((left, right) => String(left.acquisition_start_utc).localeCompare(String(right.acquisition_start_utc))),
    rawCount: stream.rawEvidence.length,
    detectionCount: stream.detectionEvidence.length,
    slices: [...stream.slices.values()].map((slice) => ({
      ...slice,
      rawCount: slice.rawEvidence.length,
      detectionCount: slice.detectionEvidence.length,
    })),
  }));
}

export function buildEvidenceFromFirmsPayload(payload = {}, request = {}) {
  const segments = normalizeSegments(payload, request);
  const provisional = segments.flatMap((segment) =>
    buildFireDetectionsFromFirmsRows(segment.rows || [], {
      provider: "firms",
      queryMode: payload?.mode || request?.mode || "nrt",
      dayRange: segment.apiDayRange || 1,
      requestedWindowDays: segment.requestedWindowDays || request?.requestedWindowDays || 1,
      minimumConfidenceLevel: request?.minimumConfidenceLevel || "nominal",
      temporalState: request?.temporalState || {},
      product: segment.product,
      sensor: segment.product,
      slice: segment,
    })
  );
  const canonicalEventTimeUtc =
    latestAcquisitionTime(provisional, request?.minimumConfidenceLevel || "nominal") ||
    request?.temporalState?.request_anchor_utc ||
    null;
  const temporalState = {
    ...(request?.temporalState || {}),
    canonical_event_time_utc: canonicalEventTimeUtc,
  };
  const rawArchive = reclassifyFireDetections(provisional, {
    temporalState,
    canonicalEventTimeUtc,
    minimumConfidenceLevel: request?.minimumConfidenceLevel || "nominal",
  });
  const detectionArchive = rawArchive.filter((item) => item.can_affect_detection);
  const latestAcqTimeUtc =
    rawArchive
      .map((item) => item.acquisition_start_utc)
      .filter(Boolean)
      .sort((left, right) => String(right).localeCompare(String(left)))[0] || null;

  return {
    rawArchive,
    detectionArchive,
    sensorStreams: groupSensorStreams(rawArchive),
    latestAcqTimeUtc,
    canonicalEventTimeUtc,
    temporalState: {
      ...temporalState,
      evidence_time_span_min:
        rawArchive.length > 1 && latestAcqTimeUtc
          ? Math.max(
              0,
              ...rawArchive
                .map((item) => minutesBetweenUtc(latestAcqTimeUtc, item?.acquisition_start_utc))
                .filter((value) => Number.isFinite(value))
            )
          : 0,
    },
    providerMeta: {
      mode: payload?.mode || request?.mode || "nrt",
      products: payload?.products || request?.products || [],
      segments,
    },
  };
}

export function summarizeTimeHistogram(detections = [], { binMinutes = 60 } = {}) {
  const histogram = new Map();
  (Array.isArray(detections) ? detections : []).forEach((item) => {
    if (!item?.acquisition_start_utc) {
      return;
    }
    const timestamp = new Date(item.acquisition_start_utc).getTime();
    if (Number.isNaN(timestamp)) {
      return;
    }
    const safeBinMinutes = Math.max(15, Math.round(Number(binMinutes) || 60));
    const bucket = Math.floor(timestamp / (safeBinMinutes * 60 * 1000));
    const key = `${item.sensor}:${bucket}`;
    histogram.set(key, (histogram.get(key) || 0) + 1);
  });
  return [...histogram.entries()].map(([key, count]) => ({
    key,
    count,
  }));
}
