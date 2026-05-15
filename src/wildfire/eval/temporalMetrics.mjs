import { parseAcqTimeUtc, summarizeTimeHistogram } from "../providers/firmsAreaIngestion.mjs";

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values = []) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!sorted.length) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function histogramFromSegments(segments = [], { binMinutes = 60 } = {}) {
  const rows = (Array.isArray(segments) ? segments : []).flatMap((segment) =>
    (Array.isArray(segment?.rows) ? segment.rows : []).map((row) => ({
      sensor: segment?.product || row.product || "unknown",
      acquisition_start_utc: parseAcqTimeUtc(row.acq_date, row.acq_time),
    }))
  );
  return summarizeTimeHistogram(rows, { binMinutes });
}

export function buildProviderParityReport({ segments = [], sensorStreams = [], rawArchive = [] } = {}) {
  const upstreamCount = (Array.isArray(segments) ? segments : []).reduce(
    (sum, segment) => sum + (Array.isArray(segment?.rows) ? segment.rows.length : 0),
    0
  );
  const retainedCount = Array.isArray(rawArchive) ? rawArchive.length : 0;
  const upstreamHistogram = histogramFromSegments(segments);
  const retainedHistogram = summarizeTimeHistogram(rawArchive);
  const upstreamMap = new Map(upstreamHistogram.map((entry) => [entry.key, entry.count]));
  const retainedMap = new Map(retainedHistogram.map((entry) => [entry.key, entry.count]));
  const keys = [...new Set([...upstreamMap.keys(), ...retainedMap.keys()])];
  const histogramDiff = keys.reduce(
    (sum, key) => sum + Math.abs((upstreamMap.get(key) || 0) - (retainedMap.get(key) || 0)),
    0
  );

  return {
    upstreamCount,
    retainedCount,
    provider_count_parity: upstreamCount > 0 ? round(retainedCount / upstreamCount, 4) : 1,
    time_histogram_parity:
      upstreamCount > 0 ? round(Math.max(0, 1 - histogramDiff / Math.max(upstreamCount, retainedCount, 1)), 4) : 1,
    bySensor: (Array.isArray(sensorStreams) ? sensorStreams : []).map((stream) => ({
      sensor: stream.sensor,
      rawCount: Number(stream.rawCount) || 0,
      detectionCount: Number(stream.detectionCount) || 0,
      sliceCount: Array.isArray(stream.slices) ? stream.slices.length : 0,
    })),
  };
}

export function buildTemporalTrace({ request = {}, sensorStreams = [], clusters = [] } = {}) {
  return {
    request_anchor_utc: request?.temporalState?.request_anchor_utc || null,
    canonical_event_time_utc: request?.temporalState?.canonical_event_time_utc || null,
    request_window_h: request?.temporalState?.request_window_h || null,
    discovery_bin_h: request?.temporalState?.discovery_bin_h || null,
    sensors: (Array.isArray(sensorStreams) ? sensorStreams : []).map((stream) => ({
      sensor: stream.sensor,
      rawCount: stream.rawCount,
      detectionCount: stream.detectionCount,
      firstEvidenceUtc: stream.rawEvidence?.[0]?.acquisition_start_utc || null,
      lastEvidenceUtc:
        stream.rawEvidence
          ?.map((item) => item?.acquisition_start_utc)
          .filter(Boolean)
          .sort((left, right) => String(right).localeCompare(String(left)))[0] || null,
      slices: (Array.isArray(stream.slices) ? stream.slices : []).map((slice) => ({
        sliceId: slice.sliceId,
        date: slice.date,
        apiDayRange: slice.apiDayRange,
        rawCount: slice.rawCount,
        detectionCount: slice.detectionCount,
      })),
    })),
    clusters: (Array.isArray(clusters) ? clusters : []).map((cluster) => ({
      id: cluster.id,
      status: cluster.status,
      pointCount: cluster.pointCount,
      temporalSpanMin: cluster.temporalSpanMin,
      eventScore: cluster.eventScore,
      sensors: cluster.sensors || [],
      acqTimeStartUtc: cluster.acqTimeStartUtc,
      acqTimeEndUtc: cluster.acqTimeEndUtc,
    })),
  };
}

export function buildBeforeAfterClusterComparison({ legacyClusters = [], newClusters = [] } = {}) {
  return {
    legacyClusterCount: Array.isArray(legacyClusters) ? legacyClusters.length : 0,
    newClusterCount: Array.isArray(newClusters) ? newClusters.length : 0,
    legacyPointCount: (Array.isArray(legacyClusters) ? legacyClusters : []).reduce((sum, cluster) => sum + (cluster?.count || 0), 0),
    newPointCount: (Array.isArray(newClusters) ? newClusters : []).reduce((sum, cluster) => sum + (cluster?.pointCount || 0), 0),
    legacyTemporalAware: false,
    newTemporalAware: true,
    newNeedsReviewCount: (Array.isArray(newClusters) ? newClusters : []).filter((cluster) => cluster?.status === "needs-review").length,
  };
}

export function buildKnownTemporalLimitations({
  request = {},
  rawArchive = [],
  sensorStreams = [],
  clusters = [],
  providerMeta = {},
} = {}) {
  const limitations = [];
  if (!(Array.isArray(rawArchive) && rawArchive.some((item) => item?.acquisition_start_utc))) {
    limitations.push("No wildfire evidence in the current request carries explicit acquisition time.");
  }
  if (!(Array.isArray(sensorStreams) && sensorStreams.length >= 2)) {
    limitations.push("Current request did not capture multi-sensor corroboration, so cross-sensor fusion could not be validated.");
  }
  if ((request?.requestedWindowDays || 1) === 7 && !providerMeta?.segments?.some((segment) => Number(segment?.apiDayRange) === 2)) {
    limitations.push("Requested 7d view is missing the expected stitched 2d + 5d FIRMS query plan.");
  }
  if ((Array.isArray(clusters) ? clusters : []).some((cluster) => cluster?.status === "needs-review")) {
    limitations.push("At least one hotspot cluster exceeded the configured temporal span and was downgraded to needs-review.");
  }
  if (!(Array.isArray(rawArchive) && rawArchive.length)) {
    limitations.push("No official raw fire points were returned for the current AOI/time request.");
  }
  return limitations;
}

export function buildWildfireMetrics({
  request = {},
  rawArchive = [],
  detectionArchive = [],
  clusters = [],
  providerParityReport = {},
  fallbackUsed = false,
  caseDefinition = null,
  latencyMs = 0,
} = {}) {
  const clusterList = Array.isArray(clusters) ? clusters : [];
  const positiveClusters = clusterList.filter((cluster) => cluster?.status === "positive");
  const needsReviewClusters = clusterList.filter((cluster) => cluster?.status === "needs-review");
  const multiSensorClusters = clusterList.filter((cluster) => (cluster?.sensors || []).length > 1);
  const incoherentCrossSensor = multiSensorClusters.filter(
    (cluster) => Number(cluster?.temporalSpanMin || 0) > Math.max(15, Number(request?.temporalState?.max_cross_sensor_merge_min) || 120)
  );
  const invalidTemporalPoints = (Array.isArray(detectionArchive) ? detectionArchive : []).filter(
    (item) => !item?.acquisition_start_utc || !["T0", "T1"].includes(item?.temporal_class)
  );
  const clusterPurity =
    clusterList.length > 0
      ? round(
          clusterList.reduce((sum, cluster) => {
            const spanPenalty = Math.min(1, Number(cluster?.temporalSpanMin || 0) / Math.max(60, Number(request?.temporalState?.discovery_bin_h || 6) * 60));
            return sum + Math.max(0, 1 - spanPenalty);
          }, 0) / clusterList.length,
          4
        )
      : 1;

  const reportGroup = String(caseDefinition?.report_group || "");
  const scoringRole = String(caseDefinition?.expected_outcome?.scoring_role || "");
  const emptyCaseSpecificity = caseDefinition?.case_type === "empty" ? (positiveClusters.length === 0 ? 1 : 0) : null;
  const trapRejectionRate =
    caseDefinition?.case_type === "static_trap"
      ? clusterList.length > 0
        ? round((clusterList.length - positiveClusters.length) / clusterList.length, 4)
        : 1
      : null;
  const reviewedAfEventRecall = scoringRole === "positive_gold" ? (positiveClusters.length > 0 ? 1 : 0) : null;
  const afCanaryHitRate =
    reportGroup === "primary_live_canary"
      ? (Array.isArray(rawArchive) && rawArchive.length > 0 ? 1 : 0)
      : null;

  return {
    provider_count_parity: providerParityReport.provider_count_parity ?? null,
    time_histogram_parity: providerParityReport.time_histogram_parity ?? null,
    event_recall: reviewedAfEventRecall,
    reviewed_af_event_recall: reviewedAfEventRecall,
    af_canary_hit_rate: afCanaryHitRate,
    cluster_purity: clusterPurity,
    empty_scene_specificity: emptyCaseSpecificity,
    empty_case_specificity: emptyCaseSpecificity,
    trap_rejection_rate: trapRejectionRate,
    static_source_false_positive_rate:
      caseDefinition?.case_type === "static_trap" ? round(positiveClusters.length / Math.max(clusterList.length, 1), 4) : null,
    fallback_rate: fallbackUsed ? 1 : 0,
    temporal_consistency_error_rate:
      detectionArchive.length > 0 ? round(invalidTemporalPoints.length / detectionArchive.length, 4) : 0,
    incoherent_cross_sensor_merge_rate:
      multiSensorClusters.length > 0 ? round(incoherentCrossSensor.length / multiSensorClusters.length, 4) : 0,
    median_cluster_time_span: round(median(clusterList.map((cluster) => cluster?.temporalSpanMin || 0)), 2),
    median_latency: round(median([latencyMs]), 2),
    positive_cluster_count: positiveClusters.length,
    needs_review_cluster_count: needsReviewClusters.length,
  };
}

export function passesWildfireRegressionGate(metrics = {}) {
  return (
    Number(metrics?.provider_count_parity) >= 0.999 &&
    Number(metrics?.time_histogram_parity) >= 0.999 &&
    Number(metrics?.temporal_consistency_error_rate) === 0 &&
    Number(metrics?.incoherent_cross_sensor_merge_rate) === 0
  );
}
