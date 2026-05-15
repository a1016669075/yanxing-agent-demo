import {
  buildBeforeAfterClusterComparison,
  buildKnownTemporalLimitations,
  buildProviderParityReport,
  buildTemporalTrace,
  buildWildfireMetrics,
} from "../eval/temporalMetrics.mjs";

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function fireClustersToRois(clusters = [], {
  maxRois = 6,
} = {}) {
  return (Array.isArray(clusters) ? clusters : [])
    .slice()
    .sort((left, right) => {
      if ((right.eventScore || 0) !== (left.eventScore || 0)) {
        return (right.eventScore || 0) - (left.eventScore || 0);
      }
      return (right.totalFrpMw || 0) - (left.totalFrpMw || 0);
    })
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
        name: `Temporal wildfire cluster ${index + 1}`,
        risk: round(
          clamp(
            0.24 +
              confidenceScore * 0.24 +
              Math.min(0.2, (cluster?.eventScore || 0) * 0.28) +
              Math.min(0.16, (cluster?.totalFrpMw || 0) / 500),
            0.08,
            0.99
          ),
          4
        ),
        signal: round(clamp(0.24 + Math.min(0.42, (cluster?.eventScore || 0) * 0.52), 0.08, 0.98), 4),
        cloud: 0.08,
        area: Math.max(16, Math.round((cluster?.pointCount || cluster?.count || 1) * 8)),
        detectionConfidence: round(confidenceScore, 4),
        detectionMode: cluster?.status === "needs-review" ? "firms-temporal-needs-review" : "firms-temporal-cluster",
        firePointCount: cluster?.pointCount || cluster?.count || 0,
        frpMw: cluster?.totalFrpMw || 0,
        temporalSpanMin: cluster?.temporalSpanMin || 0,
        eventScore: cluster?.eventScore || 0,
        box: {
          left: round(clamp(left - 2, 0, 100), 3),
          top: round(clamp(top - 2, 0, 100), 3),
          width: round(clamp(width, 4, 100), 3),
          height: round(clamp(height, 4, 100), 3),
        },
      };
    });
}

export function summarizeFireOverlay(detections = [], clusters = [], { rawArchive = [] } = {}) {
  const visibleDetections = Array.isArray(detections) ? detections : [];
  const fireClusters = Array.isArray(clusters) ? clusters : [];
  const rawDetections = Array.isArray(rawArchive) ? rawArchive : [];
  const totalFrpMw = visibleDetections.reduce((sum, item) => sum + (Number(item.frpMw) || 0), 0);
  const suspiciousClusterCount = fireClusters.filter(
    (cluster) =>
      cluster?.suspiciousStaticSource ||
      (Array.isArray(cluster?.suppressionReasons) && cluster.suppressionReasons.length > 0) ||
      (Number(cluster?.suspiciousPointCount) || 0) > 0
  ).length;

  return {
    pointCount: visibleDetections.length,
    rawPointCount: rawDetections.length,
    clusterCount: fireClusters.length,
    positiveClusterCount: fireClusters.filter((cluster) => cluster?.status === "positive").length,
    needsReviewCount: fireClusters.filter((cluster) => cluster?.status === "needs-review").length,
    fallbackClusterCount: fireClusters.filter((cluster) => cluster?.status === "fallback").length,
    suspiciousClusterCount,
    totalFrpMw: round(totalFrpMw, 3),
    highConfidenceCount: visibleDetections.filter((item) => item?.confidence?.level === "high").length,
    nominalConfidenceCount: visibleDetections.filter((item) => item?.confidence?.level === "nominal").length,
    lowConfidenceCount: visibleDetections.filter((item) => item?.confidence?.level === "low").length,
  };
}

export function buildFireOverlayPresentation({
  request = {},
  ingestion = {},
  clusters = [],
  legacyClusters = [],
  fallbackUsed = false,
  latencyMs = 0,
  caseDefinition = null,
  maxRois = 6,
} = {}) {
  const rawArchive = Array.isArray(ingestion?.rawArchive) ? ingestion.rawArchive : [];
  const detectionArchive = Array.isArray(ingestion?.detectionArchive) ? ingestion.detectionArchive : [];
  const sensorStreams = Array.isArray(ingestion?.sensorStreams) ? ingestion.sensorStreams : [];
  const providerMeta = ingestion?.providerMeta || {};
  const summary = summarizeFireOverlay(detectionArchive, clusters, { rawArchive });
  const rois = fireClustersToRois(clusters, { maxRois });
  const providerParityReport = buildProviderParityReport({
    segments: providerMeta.segments || [],
    sensorStreams,
    rawArchive,
  });
  const temporalTrace = buildTemporalTrace({
    request: {
      ...request,
      temporalState: ingestion?.temporalState || request?.temporalState || {},
    },
    sensorStreams,
    clusters,
  });
  const beforeAfterClusterComparison = buildBeforeAfterClusterComparison({
    legacyClusters,
    newClusters: clusters,
  });
  const knownTemporalLimitations = buildKnownTemporalLimitations({
    request: {
      ...request,
      temporalState: ingestion?.temporalState || request?.temporalState || {},
    },
    rawArchive,
    sensorStreams,
    clusters,
    providerMeta,
  });
  const metrics = buildWildfireMetrics({
    request: {
      ...request,
      temporalState: ingestion?.temporalState || request?.temporalState || {},
    },
    rawArchive,
    detectionArchive,
    clusters,
    providerParityReport,
    fallbackUsed,
    caseDefinition,
    latencyMs,
  });
  const status =
    clusters.some((cluster) => cluster?.status === "positive")
      ? "positive"
      : clusters.some((cluster) => cluster?.status === "needs-review")
        ? "needs-review"
        : detectionArchive.length > 0
          ? "fallback"
          : "empty";

  return {
    available: true,
    status,
    caseSemantics: caseDefinition?.case_semantics || null,
    metricEligibility: {
      reviewed_af_recall: Boolean(caseDefinition?.counts_for_reviewed_af_recall),
      af_canary_hit_rate: Boolean(caseDefinition?.counts_for_af_canary_hit_rate),
    },
    bbox: request?.bbox || null,
    config: {
      provider: request?.provider || "firms",
      mode: request?.mode || "nrt",
      dayRange: request?.requestedWindowDays || 1,
      windowLabel: request?.windowLabel || "24h",
      products: request?.products || [],
      includeLowConfidence: Boolean(request?.includeLowConfidence),
      useWmsTimeOverlay: Boolean(request?.useWmsTimeOverlay),
      queryPlanLabel: request?.queryPlan?.label || null,
    },
    queryMode: providerMeta?.mode || request?.mode || "nrt",
    queryPlan: request?.queryPlan || null,
    products: providerMeta?.products || request?.products || [],
    detections: detectionArchive,
    rawDetections: rawArchive,
    sensorStreams,
    clusters,
    rois,
    summary,
    metrics,
    timeParityReport: providerParityReport,
    temporalTrace,
    beforeAfterClusterComparison,
    knownTemporalLimitations,
    latestAcqTimeUtc: ingestion?.latestAcqTimeUtc || null,
    temporalState: ingestion?.temporalState || request?.temporalState || null,
    description:
      detectionArchive.length > 0
        ? `Temporal wildfire core retained ${detectionArchive.length} T0/T1 official points across ${sensorStreams.length} sensor streams and produced ${clusters.length} time-aware clusters.`
        : `Temporal wildfire core retained 0 T0/T1 official points for active-fire detection; raw archive still preserves ${rawArchive.length} official points for context and verification.`,
    popupRows: detectionArchive.slice(0, 12).map((item) => ({
      id: item.id,
      source: item.source,
      product: item.product,
      sensor: item.sensor,
      confidence: item.confidence.label,
      frpMw: item.frpMw,
      daynight: item.daynight,
      acqTimeUtc: item.acquisition_start_utc || item.acqTimeUtc,
      temporalClass: item.temporal_class,
      lat: round(item.lat, 4),
      lon: round(item.lon, 4),
    })),
  };
}
