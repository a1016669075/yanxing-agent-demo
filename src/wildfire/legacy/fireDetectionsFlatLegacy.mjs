function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDaynight(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "N" ? "night" : normalized === "D" ? "day" : "unknown";
}

function normalizeFireConfidence(rawConfidence, product = "") {
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
    if (product.startsWith("MODIS")) {
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

function parseAcqTimeUtc(acqDate = "", acqTime = "") {
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
  if (product.includes("NOAA21")) {
    return "NOAA-21";
  }
  if (product.includes("NOAA20")) {
    return "NOAA-20";
  }
  if (product.includes("SNPP")) {
    return "SNPP";
  }
  if (product.includes("MODIS")) {
    return "MODIS";
  }
  return source || "unknown";
}

function providerProvenance({
  provider = "firms",
  product = "",
  url = "",
  queryMode = "nrt",
  dayRange = 1,
} = {}) {
  return {
    provider,
    product,
    url,
    queryMode,
    dayRange,
    generatedAt: new Date().toISOString(),
  };
}

export function buildFireDetectionsFromFirmsRowsLegacy(rows = [], {
  provider = "firms",
  queryMode = "nrt",
  dayRange = 1,
} = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({
      id:
        row.id ||
        [
          provider,
          row.product || "product",
          row.latitude || index,
          row.longitude || index,
          row.acq_date || "date",
          row.acq_time || "time",
        ].join(":"),
      source: provider,
      product: row.product || "",
      satellite: satelliteLabel(row, row.product || ""),
      lat: round(Number(row.latitude) || 0, 6),
      lon: round(Number(row.longitude) || 0, 6),
      acqTimeUtc: parseAcqTimeUtc(row.acq_date, row.acq_time),
      confidence: normalizeFireConfidence(row.confidence, row.product || ""),
      frpMw: Number.isFinite(Number(row.frp)) ? round(Number(row.frp), 3) : null,
      daynight: normalizeDaynight(row.daynight),
      scanKm: Number.isFinite(Number(row.scan)) ? round(Number(row.scan), 3) : null,
      trackKm: Number.isFinite(Number(row.track)) ? round(Number(row.track), 3) : null,
      provenance: providerProvenance({
        provider,
        product: row.product || "",
        url: row.requestedUrl || "",
        queryMode,
        dayRange,
      }),
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
}

function confidenceLevelValue(level = "unknown") {
  return (
    {
      low: 1,
      nominal: 2,
      high: 3,
      unknown: 0,
    }[level] || 0
  );
}

function detectionDistanceKm(left, right) {
  const latFactor = 111;
  const lonFactor = 111 * Math.cos((((Number(left.lat) || 0) + (Number(right.lat) || 0)) / 2) * (Math.PI / 180));
  const dLat = (Number(left.lat) || 0) - (Number(right.lat) || 0);
  const dLon = (Number(left.lon) || 0) - (Number(right.lon) || 0);
  return Math.hypot(dLat * latFactor, dLon * lonFactor);
}

function thresholdKmForPair(left, right) {
  const footprint =
    Math.max(Number(left.scanKm) || 0.8, Number(left.trackKm) || 0.8, Number(right.scanKm) || 0.8, Number(right.trackKm) || 0.8);
  return clamp(footprint * 4.5, 3, 14);
}

function percentForPoint(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 50;
  }
  return round(clamp(((value - min) / (max - min)) * 100, 0, 100), 3);
}

export function clusterFireDetectionsLegacy(detections = [], { bbox = null } = {}) {
  const source = Array.isArray(detections) ? detections : [];
  const groups = [];

  source.forEach((detection) => {
    const match = groups.find((group) =>
      group.points.some((point) => detectionDistanceKm(point, detection) <= thresholdKmForPair(point, detection))
    );
    if (match) {
      match.points.push(detection);
      return;
    }
    groups.push({
      id: `cluster-${groups.length + 1}`,
      points: [detection],
    });
  });

  const [west, south, east, north] = Array.isArray(bbox) && bbox.length === 4 ? bbox : [-180, -90, 180, 90];
  return groups.map((group, index) => {
    const lats = group.points.map((point) => Number(point.lat) || 0);
    const lons = group.points.map((point) => Number(point.lon) || 0);
    const centroidLat = lats.reduce((sum, value) => sum + value, 0) / Math.max(1, lats.length);
    const centroidLon = lons.reduce((sum, value) => sum + value, 0) / Math.max(1, lons.length);
    const totalFrpMw = group.points.reduce((sum, point) => sum + (Number(point.frpMw) || 0), 0);
    const maxConfidence = group.points.reduce(
      (best, point) =>
        confidenceLevelValue(point?.confidence?.level) > confidenceLevelValue(best?.confidence?.level) ? point : best,
      group.points[0]
    );
    const timeValues = group.points
      .map((point) => point.acqTimeUtc)
      .filter(Boolean)
      .sort((left, right) => String(left).localeCompare(String(right)));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    return {
      id: `fire-cluster-${index + 1}`,
      source: "firms",
      count: group.points.length,
      centroidLat: round(centroidLat, 6),
      centroidLon: round(centroidLon, 6),
      totalFrpMw: round(totalFrpMw, 3),
      confidence: clone(maxConfidence?.confidence || normalizeFireConfidence("unknown")),
      daynight:
        group.points.every((point) => point.daynight === "night")
          ? "night"
          : group.points.every((point) => point.daynight === "day")
            ? "day"
            : "mixed",
      products: [...new Set(group.points.map((point) => point.product))],
      satellites: [...new Set(group.points.map((point) => point.satellite))],
      pointIds: group.points.map((point) => point.id),
      acqTimeStartUtc: timeValues[0] || null,
      acqTimeEndUtc: timeValues[timeValues.length - 1] || null,
      bounds: {
        west: round(minLon, 6),
        south: round(minLat, 6),
        east: round(maxLon, 6),
        north: round(maxLat, 6),
      },
      display: {
        x: percentForPoint(centroidLon, west, east),
        y: percentForPoint(centroidLat, south, north),
        left: percentForPoint(minLon, west, east),
        right: percentForPoint(maxLon, west, east),
        top: 100 - percentForPoint(maxLat, south, north),
        bottom: 100 - percentForPoint(minLat, south, north),
      },
    };
  });
}

export function fireClustersToRoisLegacy(clusters = [], {
  maxRois = 6,
} = {}) {
  return (Array.isArray(clusters) ? clusters : [])
    .slice()
    .sort((left, right) => (right.totalFrpMw || 0) - (left.totalFrpMw || 0))
    .slice(0, Math.max(1, Number(maxRois) || 6))
    .map((cluster, index) => {
      const left = Math.min(cluster.display.left, cluster.display.right);
      const right = Math.max(cluster.display.left, cluster.display.right);
      const top = Math.min(cluster.display.top, cluster.display.bottom);
      const bottom = Math.max(cluster.display.top, cluster.display.bottom);
      const width = Math.max(6, right - left + 4);
      const height = Math.max(6, bottom - top + 4);
      const confidenceScore = Number(cluster?.confidence?.score) || 0.6;

      return {
        id: cluster.id || `R${index + 1}`,
        name: `FIRMS legacy cluster ${index + 1}`,
        risk: round(clamp(0.46 + confidenceScore * 0.34 + Math.min(0.18, (cluster.totalFrpMw || 0) / 500), 0.1, 0.99), 4),
        signal: round(clamp(0.42 + Math.min(0.34, (cluster.totalFrpMw || 0) / 320), 0.1, 0.98), 4),
        cloud: 0.08,
        area: Math.max(16, Math.round(cluster.count * 8)),
        detectionConfidence: round(confidenceScore, 4),
        detectionMode: "firms-flat-legacy",
        firePointCount: cluster.count,
        frpMw: cluster.totalFrpMw,
        box: {
          left: round(clamp(left - 2, 0, 100), 3),
          top: round(clamp(top - 2, 0, 100), 3),
          width: round(clamp(width, 4, 100), 3),
          height: round(clamp(height, 4, 100), 3),
        },
      };
    });
}

export function summarizeFireOverlayLegacy(detections = [], clusters = []) {
  const fireDetections = Array.isArray(detections) ? detections : [];
  const fireClusters = Array.isArray(clusters) ? clusters : [];
  const totalFrpMw = fireDetections.reduce((sum, item) => sum + (Number(item.frpMw) || 0), 0);

  return {
    pointCount: fireDetections.length,
    clusterCount: fireClusters.length,
    totalFrpMw: round(totalFrpMw, 3),
    highConfidenceCount: fireDetections.filter((item) => item?.confidence?.level === "high").length,
    nominalConfidenceCount: fireDetections.filter((item) => item?.confidence?.level === "nominal").length,
    lowConfidenceCount: fireDetections.filter((item) => item?.confidence?.level === "low").length,
  };
}
