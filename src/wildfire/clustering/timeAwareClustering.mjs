function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function detectionDistanceKm(left = {}, right = {}) {
  const latFactor = 111;
  const lonFactor = 111 * Math.cos((((Number(left.lat) || 0) + (Number(right.lat) || 0)) / 2) * (Math.PI / 180));
  const dLat = (Number(left.lat) || 0) - (Number(right.lat) || 0);
  const dLon = (Number(left.lon) || 0) - (Number(right.lon) || 0);
  return Math.hypot(dLat * latFactor, dLon * lonFactor);
}

function thresholdKmForPair(left, right) {
  const footprint = Math.max(
    Number(left?.scanKm) || 0.8,
    Number(left?.trackKm) || 0.8,
    Number(right?.scanKm) || 0.8,
    Number(right?.trackKm) || 0.8
  );
  return clamp(footprint * 4.5, 3, 14);
}

function minutesBetweenUtc(left = null, right = null) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return null;
  }
  return Math.round((leftDate.getTime() - rightDate.getTime()) / (60 * 1000));
}

function temporalSpanMinutes(points = []) {
  const times = points
    .map((item) => new Date(item?.acquisition_start_utc || item?.acqTimeUtc).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (times.length <= 1) {
    return 0;
  }
  return Math.round((times[times.length - 1] - times[0]) / (60 * 1000));
}

function dominantConfidenceMix(points = []) {
  const mix = { high: 0, nominal: 0, low: 0, unknown: 0 };
  (Array.isArray(points) ? points : []).forEach((item) => {
    const level = item?.confidence?.level || "unknown";
    mix[level] = (mix[level] || 0) + 1;
  });
  return mix;
}

function frpSummary(points = []) {
  const values = points.map((item) => Number(item?.frpMw)).filter((value) => Number.isFinite(value) && value >= 0);
  if (!values.length) {
    return {
      totalMw: 0,
      maxMw: 0,
      meanMw: 0,
    };
  }
  const totalMw = values.reduce((sum, value) => sum + value, 0);
  return {
    totalMw: round(totalMw, 3),
    maxMw: round(Math.max(...values), 3),
    meanMw: round(totalMw / values.length, 3),
  };
}

function recencyScore(points = [], temporalState = {}) {
  const anchor = temporalState?.canonical_event_time_utc || temporalState?.request_anchor_utc;
  const latestPoint = (Array.isArray(points) ? points : [])
    .map((item) => item?.acquisition_start_utc || item?.acqTimeUtc)
    .filter(Boolean)
    .sort((left, right) => String(right).localeCompare(String(left)))[0];
  if (!anchor || !latestPoint) {
    return 0.24;
  }
  const offsetMin = Math.abs(minutesBetweenUtc(anchor, latestPoint) || 0);
  const binMin = Math.max(60, (Number(temporalState.discovery_bin_h) || 6) * 60);
  return round(clamp(1 - offsetMin / binMin, 0.04, 1), 4);
}

function spatialCompactness(points = []) {
  if (!Array.isArray(points) || points.length <= 1) {
    return 1;
  }
  const centroid = {
    lat: points.reduce((sum, item) => sum + (Number(item.lat) || 0), 0) / points.length,
    lon: points.reduce((sum, item) => sum + (Number(item.lon) || 0), 0) / points.length,
  };
  const meanDistance = points.reduce((sum, item) => sum + detectionDistanceKm(item, centroid), 0) / points.length;
  return round(clamp(1 - meanDistance / 15, 0.05, 1), 4);
}

function multiSatelliteAgreement(points = [], temporalState = {}) {
  const sensors = [...new Set(points.map((item) => item?.sensor || item?.product).filter(Boolean))];
  if (sensors.length <= 1) {
    return {
      sensorCount: sensors.length,
      score: points.length >= 2 ? 0.28 : 0.12,
    };
  }
  const times = points
    .map((item) => item?.acquisition_start_utc || item?.acqTimeUtc)
    .filter(Boolean)
    .sort((left, right) => String(left).localeCompare(String(right)));
  const minTime = times[0] || null;
  const maxTime = times[times.length - 1] || null;
  const offsetMin = Math.abs(minutesBetweenUtc(maxTime, minTime) || 0);
  const thresholdMin = Math.max(15, Number(temporalState.max_cross_sensor_merge_min) || 120);
  return {
    sensorCount: sensors.length,
    score: round(clamp(0.32 + Math.max(0, 1 - offsetMin / thresholdMin) * 0.52, 0.12, 1), 4),
  };
}

function buildStaticSourceSuppression(points = [], {
  staticPenalty = 0,
  frp = { totalMw: 0, maxMw: 0 },
  agreement = { sensorCount: 0, score: 0 },
  compactness = 0,
  spanMin = 0,
} = {}) {
  const pointCount = Array.isArray(points) ? points.length : 0;
  const suspiciousPointCount = (Array.isArray(points) ? points : []).filter((item) => item?.likelyNonVegetationHeatSource).length;
  const suspiciousRatio = pointCount > 0 ? suspiciousPointCount / pointCount : 0;
  const suspiciousStaticSource = suspiciousPointCount > 0 || staticPenalty >= 0.18;
  const suppressionReasons = [];
  let suppressionPenalty = 0;

  if (suspiciousStaticSource) {
    const overlapPenalty = clamp(staticPenalty * 0.22 + suspiciousRatio * 0.08, 0, 0.2);
    if (overlapPenalty > 0) {
      suppressionPenalty += overlapPenalty;
      suppressionReasons.push("suspicious_region_overlap");
    }
    if (pointCount <= 3 && compactness >= 0.9 && spanMin <= 60) {
      suppressionPenalty += 0.07;
      suppressionReasons.push("repeated_fixed_hotspot_pattern");
    }
    if ((frp?.totalMw || 0) <= 15 && (frp?.maxMw || 0) <= 2.5) {
      suppressionPenalty += 0.09;
      suppressionReasons.push("low_support_frp_pattern");
    }
    if ((agreement?.sensorCount || 0) < 3 || (agreement?.score || 0) < 0.72) {
      suppressionPenalty += 0.05;
      suppressionReasons.push("weak_multi_satellite_corroboration");
    }
  }

  return {
    suspiciousStaticSource,
    suspiciousPointCount,
    suspiciousRatio: round(suspiciousRatio, 4),
    suppressionPenalty: round(clamp(suppressionPenalty, 0, 0.45), 4),
    suppressionReasons,
  };
}

function percentForPoint(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 50;
  }
  return round(clamp(((value - min) / (max - min)) * 100, 0, 100), 3);
}

function shouldMergeWithCluster(cluster = {}, hotspot = {}, temporalState = {}) {
  const hotspotPoints = hotspot?.detections || [];
  const clusterPoints = cluster?.points || [];
  if (!clusterPoints.length || !hotspotPoints.length) {
    return false;
  }

  const spatiallyCompatible = hotspotPoints.some((candidate) =>
    clusterPoints.some((existing) => detectionDistanceKm(candidate, existing) <= thresholdKmForPair(candidate, existing))
  );
  if (!spatiallyCompatible) {
    return false;
  }

  const thresholdMin = Math.max(15, Number(temporalState.max_cross_sensor_merge_min) || 120);
  const sameSensorThresholdMin = Math.max(60, (Number(temporalState.discovery_bin_h) || 6) * 60);
  return hotspotPoints.some((candidate) =>
    clusterPoints.some((existing) => {
      const offsetMin = Math.abs(
        minutesBetweenUtc(candidate?.acquisition_start_utc || candidate?.acqTimeUtc, existing?.acquisition_start_utc || existing?.acqTimeUtc) || 0
      );
      const sameSensor = (candidate?.sensor || candidate?.product) === (existing?.sensor || existing?.product);
      return offsetMin <= (sameSensor ? sameSensorThresholdMin : thresholdMin);
    })
  );
}

function summarizeCluster(cluster = {}, { bbox = null, temporalState = {} } = {}) {
  const points = Array.isArray(cluster?.points) ? cluster.points : [];
  const lats = points.map((item) => Number(item.lat) || 0);
  const lons = points.map((item) => Number(item.lon) || 0);
  const centroidLat = lats.reduce((sum, value) => sum + value, 0) / Math.max(1, lats.length);
  const centroidLon = lons.reduce((sum, value) => sum + value, 0) / Math.max(1, lons.length);
  const bounds = {
    west: round(Math.min(...lons), 6),
    south: round(Math.min(...lats), 6),
    east: round(Math.max(...lons), 6),
    north: round(Math.max(...lats), 6),
  };
  const [west, south, east, north] = Array.isArray(bbox) && bbox.length === 4 ? bbox : [-180, -90, 180, 90];
  const confidenceMix = dominantConfidenceMix(points);
  const frp = frpSummary(points);
  const recency = recencyScore(points, temporalState);
  const compactness = spatialCompactness(points);
  const agreement = multiSatelliteAgreement(points, temporalState);
  const spanMin = temporalSpanMinutes(points);
  const staticPenalty =
    points.reduce((sum, item) => sum + (Number(item?.staticSourceSuspicion) || 0), 0) / Math.max(1, points.length);
  const confidenceScore =
    points.reduce((sum, item) => sum + (Number(item?.confidence?.score) || 0.4), 0) / Math.max(1, points.length);
  const frpScore = clamp((frp.totalMw || 0) / 160, 0, 1);
  const rawScore = round(
    clamp(
      confidenceScore * 0.28 +
        frpScore * 0.18 +
        recency * 0.18 +
        agreement.score * 0.16 +
        compactness * 0.1 +
        Math.min(0.1, Math.max(0, points.length - 1) * 0.03) -
        staticPenalty * 0.16,
      0,
      1
    ),
    4
  );
  const staticSuppression = buildStaticSourceSuppression(points, {
    staticPenalty,
    frp,
    agreement,
    compactness,
    spanMin,
  });
  const adjustedScore = round(clamp(rawScore - staticSuppression.suppressionPenalty, 0, 1), 4);
  const temporalThresholdMin = Math.max(
    Number(temporalState.max_cross_sensor_merge_min) || 120,
    (Number(temporalState.discovery_bin_h) || 6) * 60
  );
  const needsReviewByTemporal = spanMin > temporalThresholdMin;
  const needsReviewByStatic =
    staticSuppression.suspiciousStaticSource &&
    staticSuppression.suppressionPenalty >= 0.12 &&
    (rawScore >= 0.58 || adjustedScore >= 0.44);
  const needsReview = needsReviewByTemporal || needsReviewByStatic;
  const status = needsReview ? "needs-review" : adjustedScore >= 0.58 ? "positive" : "fallback";
  const bestConfidencePoint = points.reduce(
    (best, point) => ((point?.confidence?.score || 0) > (best?.confidence?.score || 0) ? point : best),
    points[0] || null
  );
  const timeValues = points
    .map((item) => item?.acquisition_start_utc || item?.acqTimeUtc)
    .filter(Boolean)
    .sort((left, right) => String(left).localeCompare(String(right)));

  return {
    id: cluster.id,
    source: "firms",
    status,
    needsReview,
    count: points.length,
    pointCount: points.length,
    pointIds: points.map((item) => item.id),
    confidence: bestConfidencePoint?.confidence || { level: "unknown", label: "unknown", score: 0.5 },
    confidenceMix,
    confidence_mix: confidenceMix,
    frpSummary: frp,
    totalFrpMw: frp.totalMw,
    recency,
    multiSatelliteAgreement: agreement,
    spatialCompactness: compactness,
    temporalSpanMin: spanMin,
    temporal_span_min: spanMin,
    rawEventScore: rawScore,
    eventScore: adjustedScore,
    event_score: adjustedScore,
    staticSourceSuspicionMean: round(staticPenalty, 4),
    suspiciousPointCount: staticSuppression.suspiciousPointCount,
    suspiciousPointRatio: staticSuppression.suspiciousRatio,
    suspiciousStaticSource: staticSuppression.suspiciousStaticSource,
    suppressionPenalty: staticSuppression.suppressionPenalty,
    suppressionReasons: staticSuppression.suppressionReasons,
    centroidLat: round(centroidLat, 6),
    centroidLon: round(centroidLon, 6),
    products: [...new Set(points.map((item) => item.product).filter(Boolean))],
    satellites: [...new Set(points.map((item) => item.satellite).filter(Boolean))],
    sensors: [...new Set(points.map((item) => item.sensor).filter(Boolean))],
    daynight:
      points.every((item) => item.daynight === "night")
        ? "night"
        : points.every((item) => item.daynight === "day")
          ? "day"
          : "mixed",
    acqTimeStartUtc: timeValues[0] || null,
    acqTimeEndUtc: timeValues[timeValues.length - 1] || null,
    bounds,
    display: {
      x: percentForPoint(centroidLon, west, east),
      y: 100 - percentForPoint(centroidLat, south, north),
      left: percentForPoint(bounds.west, west, east),
      right: percentForPoint(bounds.east, west, east),
      top: 100 - percentForPoint(bounds.north, south, north),
      bottom: 100 - percentForPoint(bounds.south, south, north),
    },
    points,
  };
}

export function clusterHotspotsTimeAware(discovery = {}, { bbox = null, temporalState = {} } = {}) {
  const hotspots = Array.isArray(discovery?.hotspots) ? discovery.hotspots : [];
  const groups = [];

  hotspots.forEach((hotspot) => {
    const match = groups.find((cluster) => shouldMergeWithCluster(cluster, hotspot, temporalState));
    if (match) {
      match.points.push(...hotspot.detections);
      match.hotspotIds.push(hotspot.id);
      return;
    }
    groups.push({
      id: `fire-cluster-${groups.length + 1}`,
      hotspotIds: [hotspot.id],
      points: [...hotspot.detections],
    });
  });

  return groups
    .map((cluster) => summarizeCluster(cluster, { bbox, temporalState }))
    .sort((left, right) => {
      if ((right.eventScore || 0) !== (left.eventScore || 0)) {
        return (right.eventScore || 0) - (left.eventScore || 0);
      }
      return (right.totalFrpMw || 0) - (left.totalFrpMw || 0);
    });
}

export function clusterFireDetections(detections = [], { bbox = null, temporalState = null } = {}) {
  const safeTemporalState =
    temporalState ||
    ({
      request_anchor_utc:
        (Array.isArray(detections) ? detections : [])
          .map((item) => item?.acquisition_start_utc || item?.acqTimeUtc)
          .filter(Boolean)
          .sort((left, right) => String(right).localeCompare(String(left)))[0] || new Date().toISOString(),
      canonical_event_time_utc:
        (Array.isArray(detections) ? detections : [])
          .map((item) => item?.acquisition_start_utc || item?.acqTimeUtc)
          .filter(Boolean)
          .sort((left, right) => String(right).localeCompare(String(left)))[0] || new Date().toISOString(),
      discovery_bin_h: 6,
      max_cross_sensor_merge_min: 120,
    });
  const hotspots = (Array.isArray(detections) ? detections : [])
    .filter((item) => item?.can_affect_detection !== false)
    .map((item, index) => ({
      id: `compat-hotspot-${index + 1}`,
      sensor: item?.sensor || item?.product || "unknown",
      coarseTileScore: Number(item?.confidence?.score) || 0.4,
      detections: [item],
    }));
  return clusterHotspotsTimeAware({ hotspots }, { bbox, temporalState: safeTemporalState });
}
