import fs from "node:fs/promises";
import path from "node:path";

import { clusterFireDetectionsLegacy } from "../legacy/fireDetectionsFlatLegacy.mjs";
import { clusterHotspotsTimeAware } from "../clustering/timeAwareClustering.mjs";
import { runWildfireDiscovery } from "../discovery/hotspotDiscovery.mjs";
import { buildFireOverlayPresentation } from "../presenter/fireOverlayPresenter.mjs";
import { buildProviderParityReport } from "./temporalMetrics.mjs";
import { buildRawResponseArtifact, withArtifactMetadata } from "./replayMetadata.mjs";
import { normalizeWildfireRequest } from "../request/normalizeRequest.mjs";
import { buildEvidenceFromFirmsPayload, summarizeTimeHistogram } from "../providers/firmsAreaIngestion.mjs";

export function timestampLabel(date = new Date()) {
  const pad2 = (value) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    "T",
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    "Z",
  ].join("");
}

export function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function sanitizeFileLabel(value = "") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "artifact";
}

function scaleBBoxAboutCenter(bbox = null, scale = 1) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return bbox;
  }
  const numericScale = Number(scale);
  if (!Number.isFinite(numericScale) || numericScale <= 0 || Math.abs(numericScale - 1) < 1e-9) {
    return bbox.map((value) => Number(value));
  }
  const [west, south, east, north] = bbox.map((value) => Number(value));
  const centerLon = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const halfWidth = ((east - west) / 2) * numericScale;
  const halfHeight = ((north - south) / 2) * numericScale;
  return [round(centerLon - halfWidth, 6), round(centerLat - halfHeight, 6), round(centerLon + halfWidth, 6), round(centerLat + halfHeight, 6)];
}

export async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function writeText(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, String(contents || ""), "utf8");
}

export async function writeBuffer(filePath, buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

export function buildReplayRequest(
  caseDefinition = {},
  {
    includeLowConfidence = true,
    bboxScale = null,
    queryAttempt = "default",
  } = {}
) {
  const defaultScale =
    Number(caseDefinition?.query_policy?.default_bbox_scale) > 0
      ? Number(caseDefinition.query_policy.default_bbox_scale)
      : Number(caseDefinition.query_bbox_scale) > 0
        ? Number(caseDefinition.query_bbox_scale)
        : 1;
  const effectiveScale = Number(bboxScale) > 0 ? Number(bboxScale) : defaultScale;
  const requestBBox = scaleBBoxAboutCenter(caseDefinition.aoi, effectiveScale);
  const request = normalizeWildfireRequest(
    {
      imageryProfile: {
        bbox: requestBBox,
      },
    },
    new Date(caseDefinition.anchorUtc),
    {
      dayRange: caseDefinition.requestedWindowDays,
      products: caseDefinition.sensor_priority,
      mode: caseDefinition.time_semantics === "archive_sp" ? "standard" : "nrt",
      includeLowConfidence,
    }
  );
  request.queryPolicy = caseDefinition?.query_policy || null;
  request.queryAudit = {
    attempt: String(queryAttempt || "default"),
    bbox_scale: effectiveScale,
    default_bbox_scale: defaultScale,
  };
  if (request?.queryPlan) {
    request.queryPlan = {
      ...request.queryPlan,
      bboxScale: effectiveScale,
      attempt: String(queryAttempt || "default"),
    };
  }
  return request;
}

function bboxContainsPoint(bbox = null, point = {}) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return false;
  }
  const lon = Number(point?.lon);
  const lat = Number(point?.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return false;
  }
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

export function confidenceDistribution(detections = []) {
  return (Array.isArray(detections) ? detections : []).reduce(
    (accumulator, item) => {
      const level = item?.confidence?.level || "unknown";
      accumulator[level] = (accumulator[level] || 0) + 1;
      return accumulator;
    },
    { high: 0, nominal: 0, low: 0, unknown: 0 }
  );
}

export function frpSummary(detections = []) {
  const values = (Array.isArray(detections) ? detections : [])
    .map((item) => Number(item?.frpMw))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!values.length) {
    return { totalMw: 0, maxMw: 0, meanMw: 0 };
  }
  const totalMw = values.reduce((sum, value) => sum + value, 0);
  return {
    totalMw: round(totalMw, 3),
    maxMw: round(Math.max(...values), 3),
    meanMw: round(totalMw / values.length, 3),
  };
}

export function annotateStaticSources(ingestion = {}, caseDefinition = {}) {
  const suspiciousRegions = Array.isArray(caseDefinition?.suspiciousRegions) ? caseDefinition.suspiciousRegions : [];
  if (!suspiciousRegions.length) {
    return ingestion;
  }

  const annotatePoint = (point = {}) => {
    const hits = suspiciousRegions.filter((region) => bboxContainsPoint(region?.bbox, point));
    const staticSourceSuspicion = hits.length ? Math.min(1, 0.65 + (point?.staticSourceSuspicion || 0)) : point?.staticSourceSuspicion || 0;
    return {
      ...point,
      staticSourceSuspicion,
      likelyNonVegetationHeatSource: staticSourceSuspicion >= 0.35,
      suspiciousRegions: hits.map((region) => ({
        id: region.id,
        label: region.label,
        reason: region.reason,
      })),
    };
  };

  const rawArchive = (Array.isArray(ingestion?.rawArchive) ? ingestion.rawArchive : []).map(annotatePoint);
  return {
    ...ingestion,
    rawArchive,
    detectionArchive: rawArchive.filter((item) => item?.can_affect_detection),
    sensorStreams: Array.isArray(ingestion?.sensorStreams)
      ? ingestion.sensorStreams.map((stream) => ({
          ...stream,
          rawEvidence: rawArchive.filter((item) => item?.sensor === stream.sensor),
          detectionEvidence: rawArchive.filter((item) => item?.sensor === stream.sensor && item?.can_affect_detection),
        }))
      : [],
  };
}

export function combineSensorPayloads(payloads = [], request = {}) {
  const rows = payloads.flatMap((payload) => payload?.rows || []);
  const segments = payloads.flatMap((payload) => payload?.segments || []);
  return {
    provider: "firms",
    mode: request?.mode || "nrt",
    dayRange: request?.requestedWindowDays || 1,
    date: request?.anchorDate || null,
    bbox: request?.bbox || null,
    products: payloads.flatMap((payload) => payload?.products || []),
    segments,
    rows,
  };
}

export function buildRawPointsGeoJson(caseDefinition = {}, ingestion = {}) {
  return {
    type: "FeatureCollection",
    features: (Array.isArray(ingestion?.rawArchive) ? ingestion.rawArchive : []).map((point) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(point.lon), Number(point.lat)],
      },
      properties: {
        caseId: caseDefinition.id,
        case_type: caseDefinition.case_type,
        time_semantics: caseDefinition.time_semantics,
        sensor: point.sensor,
        product: point.product,
        satellite: point.satellite,
        acquisition_start_utc: point.acquisition_start_utc,
        acquisition_end_utc: point.acquisition_end_utc,
        confidence_level: point?.confidence?.level || "unknown",
        confidence_label: point?.confidence?.label || "unknown",
        frp_mw: point.frpMw,
        daynight: point.daynight,
        temporal_class: point.temporal_class,
        can_affect_detection: Boolean(point.can_affect_detection),
        can_only_explain: Boolean(point.can_only_explain),
        time_offset_min: point.time_offset_min,
        suspicious: Boolean(point.likelyNonVegetationHeatSource),
      },
    })),
  };
}

export function buildProviderParityArtifact(caseDefinition = {}, request = {}, payloads = [], ingestion = {}, overlay = {}) {
  const parityBase = buildProviderParityReport({
    segments: payloads.flatMap((payload) => payload?.segments || []),
    sensorStreams: ingestion?.sensorStreams || [],
    rawArchive: ingestion?.rawArchive || [],
  });
  const bySensor = (Array.isArray(ingestion?.sensorStreams) ? ingestion.sensorStreams : []).map((stream) => ({
    sensor: stream.sensor,
    rawCount: stream.rawCount,
    detectionCount: stream.detectionCount,
    confidenceDistribution: confidenceDistribution(stream.rawEvidence || []),
    frpSummary: frpSummary(stream.rawEvidence || []),
    timeDistribution: summarizeTimeHistogram(stream.rawEvidence || [], { binMinutes: 60 }),
    slices: (Array.isArray(stream.slices) ? stream.slices : []).map((slice) => ({
      sliceId: slice.sliceId,
      date: slice.date,
      apiDayRange: slice.apiDayRange,
      rawCount: slice.rawCount,
      detectionCount: slice.detectionCount,
    })),
  }));
  return {
    caseId: caseDefinition.id,
    label: caseDefinition.label,
    case_type: caseDefinition.case_type,
    case_semantics: caseDefinition.case_semantics || null,
    report_group: caseDefinition.report_group || null,
    time_semantics: caseDefinition.time_semantics,
    counts_for_reviewed_af_recall: Boolean(caseDefinition.counts_for_reviewed_af_recall),
    counts_for_af_canary_hit_rate: Boolean(caseDefinition.counts_for_af_canary_hit_rate),
    primary_eval_metric: caseDefinition.primary_eval_metric,
    requestedWindowDays: request?.requestedWindowDays || 1,
    queryPlan: request?.queryPlan || null,
    queryPolicy: request?.queryPolicy || caseDefinition?.query_policy || null,
    queryAudit: request?.queryAudit || null,
    rawCountBySensor: bySensor.map((entry) => ({
      sensor: entry.sensor,
      rawCount: entry.rawCount,
      detectionCount: entry.detectionCount,
    })),
    bySensor,
    confidenceDistribution: confidenceDistribution(ingestion?.rawArchive || []),
    frpSummary: frpSummary(ingestion?.rawArchive || []),
    timeDistribution: summarizeTimeHistogram(ingestion?.rawArchive || [], { binMinutes: 60 }),
    parityStatus:
      (parityBase.provider_count_parity ?? 0) >= 0.999 && (parityBase.time_histogram_parity ?? 0) >= 0.999
        ? "pass"
        : "partial",
    providerCountParity: parityBase.provider_count_parity,
    timeHistogramParity: parityBase.time_histogram_parity,
    timeParityReport: overlay?.timeParityReport || parityBase,
    stitchedSubqueries: payloads.flatMap((payload) =>
      (Array.isArray(payload?.segments) ? payload.segments : []).map((segment) => ({
        sensor: segment.product,
        sliceId: segment.sliceId,
        apiDayRange: segment.apiDayRange,
        date: segment.date,
        requestedWindowDays: segment.requestedWindowDays,
      }))
    ),
  };
}

export function buildStaticSourceReport(caseDefinition = {}, ingestion = {}, clusters = []) {
  const suspiciousPoints = (Array.isArray(ingestion?.rawArchive) ? ingestion.rawArchive : []).filter(
    (item) => item?.likelyNonVegetationHeatSource
  );
  const suspiciousClusters = (Array.isArray(clusters) ? clusters : []).filter((cluster) =>
    (Array.isArray(cluster?.points) ? cluster.points : []).some((item) => item?.likelyNonVegetationHeatSource)
  );
  const positiveClusters = (Array.isArray(clusters) ? clusters : []).filter((cluster) => cluster?.status === "positive");
  const needsReviewClusters = (Array.isArray(clusters) ? clusters : []).filter((cluster) => cluster?.status === "needs-review");
  return {
    caseId: caseDefinition.id,
    case_type: caseDefinition.case_type,
    suspiciousPointCount: suspiciousPoints.length,
    suspiciousClusterCount: suspiciousClusters.length,
    positiveClusterCount: positiveClusters.length,
    needsReviewClusterCount: needsReviewClusters.length,
    suspiciousClusterIds: suspiciousClusters.map((cluster) => cluster.id),
    suppressedClusterIds: needsReviewClusters
      .filter((cluster) => Array.isArray(cluster?.suppressionReasons) && cluster.suppressionReasons.length > 0)
      .map((cluster) => cluster.id),
    suppressionReasons: [...new Set(needsReviewClusters.flatMap((cluster) => cluster?.suppressionReasons || []))],
    suspiciousRegions: caseDefinition?.suspiciousRegions || [],
    scoreReductionExplanation:
      suspiciousPoints.length > 0
        ? "Raw official points were preserved, and static-source penalties can now demote suspicious low-support clusters to needs-review instead of leaving them positive by default."
        : "No suspicious static-source overlap was detected in this replay.",
  };
}

function compactJson(value) {
  return JSON.stringify(value);
}

export function buildCaseSummaryMarkdown(
  caseDefinition = {},
  overlay = {},
  providerParity = {},
  staticSourceReport = {},
  transactionBudget = {},
  artifactMetadata = {}
) {
  const lines = [
    `# ${caseDefinition.label}`,
    "",
    `- case_id: \`${caseDefinition.id}\``,
    `- case_type: \`${caseDefinition.case_type}\``,
    `- case_semantics: \`${caseDefinition.case_semantics || "unknown"}\``,
    `- time_semantics: \`${caseDefinition.time_semantics}\``,
    `- validation_status: \`${caseDefinition.validationStatus}\``,
    `- expected_outcome: \`${compactJson(caseDefinition.expected_outcome)}\``,
    `- primary_eval_metric: \`${caseDefinition.primary_eval_metric}\``,
    `- counts_for_reviewed_af_recall: \`${String(Boolean(caseDefinition.counts_for_reviewed_af_recall))}\``,
    `- counts_for_af_canary_hit_rate: \`${String(Boolean(caseDefinition.counts_for_af_canary_hit_rate))}\``,
    `- acceptable_time_offset: \`${compactJson(caseDefinition.acceptable_time_offset)}\``,
    `- sensor_priority: \`${compactJson(caseDefinition.sensor_priority)}\``,
    `- sensor_coverage: \`${compactJson(caseDefinition.sensor_coverage || [])}\``,
    `- query_policy: \`${compactJson(caseDefinition.query_policy || null)}\``,
    `- archive_source: \`${caseDefinition.archive_source || "n/a"}\``,
    `- bundle_version: \`${caseDefinition.bundle_version || "n/a"}\``,
    `- requested_window: \`${overlay?.config?.windowLabel || `${caseDefinition.requestedWindowDays}d`}\``,
    `- replay_status: \`${overlay?.status || "unknown"}\``,
    `- raw_points: ${overlay?.summary?.rawPointCount || 0}`,
    `- detection_points: ${overlay?.summary?.pointCount || 0}`,
    `- clusters: ${overlay?.summary?.clusterCount || 0}`,
    `- positive_clusters: ${overlay?.summary?.positiveClusterCount || 0}`,
    `- needs_review_clusters: ${overlay?.summary?.needsReviewCount || 0}`,
    `- provider_parity_status: \`${providerParity.parityStatus || "unknown"}\``,
    `- provider_count_parity: ${providerParity.providerCountParity ?? "n/a"}`,
    `- time_histogram_parity: ${providerParity.timeHistogramParity ?? "n/a"}`,
    `- request_count: ${transactionBudget.requestCount || 0}`,
    `- total_response_bytes: ${transactionBudget.totalResponseBytes || 0}`,
    `- stitched_segment_count: ${transactionBudget.stitchedSegmentCount || 0}`,
    `- git_sha: \`${artifactMetadata.git_sha || "unknown"}\``,
    `- git_branch: \`${artifactMetadata.git_branch || "unknown"}\``,
    `- worktree_dirty: \`${String(Boolean(artifactMetadata.worktree_dirty))}\``,
    `- case_manifest_version: \`${artifactMetadata.case_manifest_version || "unknown"}\``,
    `- config_hash: \`${artifactMetadata.config_hash || "unknown"}\``,
    `- runner_version: \`${artifactMetadata.runner_version || "unknown"}\``,
    `- timestamp_utc: \`${artifactMetadata.timestamp_utc || "unknown"}\``,
  ];

  if (caseDefinition.case_type === "static_trap") {
    lines.push(`- suspicious_points: ${staticSourceReport.suspiciousPointCount || 0}`);
    lines.push(`- suspicious_clusters: ${staticSourceReport.suspiciousClusterCount || 0}`);
  }
  if (overlay?.config?.queryPolicyAudit) {
    lines.push(`- query_policy_audit: \`${compactJson(overlay.config.queryPolicyAudit)}\``);
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const note of caseDefinition.notes || []) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("## Temporal");
  lines.push("");
  lines.push(`- canonical_event_time_utc: ${overlay?.temporalState?.canonical_event_time_utc || "unknown"}`);
  lines.push(`- time_policy: ${overlay?.temporalState?.time_policy || "unknown"}`);
  lines.push(`- query_plan: ${overlay?.config?.queryPlanLabel || "unknown"}`);
  return `${lines.join("\n")}\n`;
}

function segmentRawResponseArtifact(segment = {}, options = {}) {
  const fileStem = `${sanitizeFileLabel(segment.product)}__${sanitizeFileLabel(segment.sliceId || segment.label || "segment")}__raw_response`;
  if (segment.rawFormat === "csv" && typeof segment.rawText === "string") {
    return {
      fileName: `${fileStem}.csv`,
      ...(buildRawResponseArtifact(
        {
          fileName: `${fileStem}.csv`,
          rawText: segment.rawText.endsWith("\n") ? segment.rawText : `${segment.rawText}\n`,
        },
        options
      )),
    };
  }
  const payload = segment.rawPayload ?? segment.rows ?? [];
  return {
    fileName: `${fileStem}.json`,
    ...(buildRawResponseArtifact(
      {
        fileName: `${fileStem}.json`,
        rawText: `${JSON.stringify(payload, null, 2)}\n`,
      },
      options
    )),
  };
}

function normalizeTransactionBudget(transactionBudget = {}, payloads = []) {
  const stitchedSegments = payloads.flatMap((payload) =>
    (Array.isArray(payload?.segments) ? payload.segments : []).filter(
      (segment) => Number(segment?.requestedWindowDays || 0) > Number(segment?.apiDayRange || 0)
    )
  );
  const requestCount = Number(transactionBudget.requestCount) || 0;
  const totalLatencyMs = Number(transactionBudget.totalLatencyMs) || 0;
  return {
    requestCount,
    responseCount: Number(transactionBudget.responseCount) || requestCount,
    successCount: Number(transactionBudget.successCount) || 0,
    errorCount: Number(transactionBudget.errorCount) || 0,
    totalResponseBytes: Number(transactionBudget.totalResponseBytes) || 0,
    totalLatencyMs,
    maxLatencyMs: Number(transactionBudget.maxLatencyMs) || 0,
    averageLatencyMs: requestCount > 0 ? round(totalLatencyMs / requestCount, 2) : 0,
    stitchedSegmentCount: stitchedSegments.length,
    stitchedSegments: stitchedSegments.map((segment) => ({
      product: segment.product,
      sliceId: segment.sliceId,
      apiDayRange: segment.apiDayRange,
      requestedWindowDays: segment.requestedWindowDays,
      date: segment.date,
    })),
  };
}

export function buildReplayCaseResult(
  caseDefinition = {},
  request = {},
  payloads = [],
  {
    requestLog = [],
    responseLog = [],
    transactionBudget = {},
    sourceMode = "live",
    artifactMetadata = {},
    rawResponseOptions = {},
    queryPolicyAudit = null,
  } = {}
) {
  const mergedPayload = combineSensorPayloads(payloads, request);
  const baseIngestion = buildEvidenceFromFirmsPayload(mergedPayload, request);
  const ingestion = annotateStaticSources(baseIngestion, caseDefinition);
  const discovery = runWildfireDiscovery(ingestion.detectionArchive, {
    bbox: request.bbox,
    temporalState: ingestion.temporalState,
  });
  const clusters = clusterHotspotsTimeAware(discovery, {
    bbox: request.bbox,
    temporalState: ingestion.temporalState,
  });
  const legacyClusters = clusterFireDetectionsLegacy(
    ingestion.detectionArchive.map((item) => ({
      ...item,
      acqTimeUtc: item.acquisition_start_utc || item.acqTimeUtc,
    })),
    { bbox: request.bbox }
  );
  const overlay = buildFireOverlayPresentation({
    request,
    ingestion,
    clusters,
    legacyClusters,
    fallbackUsed: false,
    latencyMs: Number(transactionBudget.totalLatencyMs) || 0,
    caseDefinition,
    maxRois: 6,
  });
  const providerParity = buildProviderParityArtifact(caseDefinition, request, payloads, ingestion, overlay);
  const staticSourceReport = buildStaticSourceReport(caseDefinition, ingestion, clusters);
  const timeHistogram = {
    caseId: caseDefinition.id,
    case_type: caseDefinition.case_type,
    time_semantics: caseDefinition.time_semantics,
    rawArchiveHistogram: summarizeTimeHistogram(ingestion.rawArchive || [], { binMinutes: 60 }),
    detectionHistogram: summarizeTimeHistogram(ingestion.detectionArchive || [], { binMinutes: 60 }),
    upstreamHistogram: payloads.flatMap((payload) =>
      (Array.isArray(payload?.segments) ? payload.segments : []).map((segment) => ({
        sensor: segment.product,
        sliceId: segment.sliceId,
        date: segment.date,
        apiDayRange: segment.apiDayRange,
        rowCount: Array.isArray(segment.rows) ? segment.rows.length : 0,
      }))
    ),
  };
  const normalizedBudget = normalizeTransactionBudget(transactionBudget, payloads);
  const rawResponses = payloads.flatMap((payload) =>
    (Array.isArray(payload?.segments) ? payload.segments : []).map((segment) => ({
      ...segmentRawResponseArtifact(segment, rawResponseOptions),
      product: segment.product,
      sliceId: segment.sliceId,
      sourcePath: segment.sourcePath || null,
    }))
  );

  return {
    caseId: caseDefinition.id,
    label: caseDefinition.label,
    case_type: caseDefinition.case_type,
    case_semantics: caseDefinition.case_semantics || null,
    report_group: caseDefinition.report_group || null,
    time_semantics: caseDefinition.time_semantics,
    sourceMode,
    overlay: {
      ...overlay,
      config: {
        ...(overlay?.config || {}),
        queryPolicyAudit,
      },
    },
    providerParity,
    staticSourceReport,
    timeHistogram,
    transactionBudget: normalizedBudget,
    requestLog: Array.isArray(requestLog) ? requestLog : [],
    responseLog: Array.isArray(responseLog) ? responseLog : [],
    rawResponses,
    stitchedQuerySegments: normalizedBudget.stitchedSegments,
    rawPointsGeoJson: buildRawPointsGeoJson(caseDefinition, ingestion),
    artifactMetadata,
    caseSummaryMarkdown: buildCaseSummaryMarkdown(
      caseDefinition,
      overlay,
      providerParity,
      staticSourceReport,
      normalizedBudget,
      artifactMetadata
    ),
  };
}

export async function writeCaseReplayArtifacts(caseDir, caseDefinition = {}, replayResult = {}, { metadata = {} } = {}) {
  await fs.mkdir(caseDir, { recursive: true });
  await writeJson(path.join(caseDir, "raw_points.geojson"), withArtifactMetadata(replayResult.rawPointsGeoJson || {}, metadata));
  await writeJson(path.join(caseDir, "provider_parity.json"), withArtifactMetadata(replayResult.providerParity || {}, metadata));
  await writeJson(path.join(caseDir, "time_histogram.json"), withArtifactMetadata(replayResult.timeHistogram || {}, metadata));
  await writeJson(
    path.join(caseDir, "temporal_trace.json"),
    withArtifactMetadata(replayResult.overlay?.temporalTrace || {}, metadata)
  );
  await writeJson(
    path.join(caseDir, "before_after_cluster_comparison.json"),
    withArtifactMetadata(replayResult.overlay?.beforeAfterClusterComparison || {}, metadata)
  );
  await writeJson(path.join(caseDir, "metrics.json"), withArtifactMetadata(replayResult.overlay?.metrics || {}, metadata));
  await writeJson(path.join(caseDir, "request_log.json"), withArtifactMetadata(replayResult.requestLog || [], metadata));
  await writeJson(path.join(caseDir, "response_log.json"), withArtifactMetadata(replayResult.responseLog || [], metadata));
  await writeJson(
    path.join(caseDir, "transaction_budget.json"),
    withArtifactMetadata(replayResult.transactionBudget || {}, metadata)
  );
  await writeJson(
    path.join(caseDir, "stitched_query_segments.json"),
    withArtifactMetadata(replayResult.stitchedQuerySegments || [], metadata)
  );
  await writeJson(
    path.join(caseDir, "raw_response_index.json"),
    withArtifactMetadata(
      (replayResult.rawResponses || []).map((entry) => ({
        fileName: entry.fileName,
        product: entry.product,
        sliceId: entry.sliceId,
        sourcePath: entry.sourcePath || null,
        compressed: Boolean(entry.compressed || entry.buffer),
        rawTextBytes: entry.rawTextBytes || 0,
      })),
      metadata
    )
  );
  if (caseDefinition.case_type === "static_trap") {
    await writeJson(
      path.join(caseDir, "static_source_report.json"),
      withArtifactMetadata(replayResult.staticSourceReport || {}, metadata)
    );
  }
  await writeText(path.join(caseDir, "case_summary.md"), replayResult.caseSummaryMarkdown || "");

  for (const artifact of replayResult.rawResponses || []) {
    if (artifact.buffer) {
      await writeBuffer(path.join(caseDir, "raw_responses", artifact.fileName), artifact.buffer);
    } else {
      await writeText(path.join(caseDir, "raw_responses", artifact.fileName), artifact.content || "");
    }
  }
}

function aggregateNumericMetric(caseResults = [], key = "") {
  const values = caseResults
    .map((entry) => entry?.overlay?.metrics?.[key])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 4);
}

export function buildAggregateMetrics(caseResults = []) {
  return {
    provider_count_parity: aggregateNumericMetric(caseResults, "provider_count_parity"),
    time_histogram_parity: aggregateNumericMetric(caseResults, "time_histogram_parity"),
    event_recall: aggregateNumericMetric(caseResults, "event_recall"),
    reviewed_af_event_recall: aggregateNumericMetric(caseResults, "reviewed_af_event_recall"),
    cluster_purity: aggregateNumericMetric(caseResults, "cluster_purity"),
    empty_scene_specificity: aggregateNumericMetric(caseResults, "empty_scene_specificity"),
    empty_case_specificity: aggregateNumericMetric(caseResults, "empty_case_specificity"),
    trap_rejection_rate: aggregateNumericMetric(caseResults, "trap_rejection_rate"),
    af_canary_hit_rate: aggregateNumericMetric(caseResults, "af_canary_hit_rate"),
    static_source_false_positive_rate: aggregateNumericMetric(caseResults, "static_source_false_positive_rate"),
    temporal_consistency_error_rate: aggregateNumericMetric(caseResults, "temporal_consistency_error_rate"),
    incoherent_cross_sensor_merge_rate: aggregateNumericMetric(caseResults, "incoherent_cross_sensor_merge_rate"),
    median_cluster_time_span: aggregateNumericMetric(caseResults, "median_cluster_time_span"),
    fallback_rate: aggregateNumericMetric(caseResults, "fallback_rate"),
    median_latency: aggregateNumericMetric(caseResults, "median_latency"),
    perCase: caseResults.map((entry) => ({
      caseId: entry.caseId,
      case_type: entry.case_type,
      case_semantics: entry.case_semantics || null,
      report_group: entry.report_group || null,
      time_semantics: entry.time_semantics,
      metrics: entry.overlay.metrics,
    })),
  };
}

export function buildAggregateProviderParityReport(caseResults = []) {
  return {
    cases: caseResults.map((entry) => ({
      caseId: entry.caseId,
      label: entry.label,
      case_type: entry.case_type,
      case_semantics: entry.case_semantics || null,
      time_semantics: entry.time_semantics,
      providerParity: entry.providerParity,
    })),
  };
}

export function buildAggregateBeforeAfterComparison(caseResults = []) {
  return {
    cases: caseResults.map((entry) => ({
      caseId: entry.caseId,
      label: entry.label,
      case_type: entry.case_type,
      case_semantics: entry.case_semantics || null,
      time_semantics: entry.time_semantics,
      comparison: entry.overlay.beforeAfterClusterComparison || null,
    })),
  };
}

export function buildAggregateStaticSourceReport(caseResults = []) {
  return {
    cases: caseResults
      .filter((entry) => entry.case_type === "static_trap")
      .map((entry) => ({
        caseId: entry.caseId,
        label: entry.label,
        case_semantics: entry.case_semantics || null,
        report: entry.staticSourceReport,
      })),
  };
}

export function buildAggregateTransactionBudgetReport(caseResults = []) {
  return {
    requestCount: caseResults.reduce((sum, entry) => sum + (Number(entry?.transactionBudget?.requestCount) || 0), 0),
    responseCount: caseResults.reduce((sum, entry) => sum + (Number(entry?.transactionBudget?.responseCount) || 0), 0),
    successCount: caseResults.reduce((sum, entry) => sum + (Number(entry?.transactionBudget?.successCount) || 0), 0),
    errorCount: caseResults.reduce((sum, entry) => sum + (Number(entry?.transactionBudget?.errorCount) || 0), 0),
    totalResponseBytes: caseResults.reduce((sum, entry) => sum + (Number(entry?.transactionBudget?.totalResponseBytes) || 0), 0),
    totalLatencyMs: caseResults.reduce((sum, entry) => sum + (Number(entry?.transactionBudget?.totalLatencyMs) || 0), 0),
    stitchedSegmentCount: caseResults.reduce((sum, entry) => sum + (Number(entry?.transactionBudget?.stitchedSegmentCount) || 0), 0),
    cases: caseResults.map((entry) => ({
      caseId: entry.caseId,
      case_type: entry.case_type,
      case_semantics: entry.case_semantics || null,
      time_semantics: entry.time_semantics,
      budget: entry.transactionBudget,
    })),
  };
}

export function buildKnownLimitationsMarkdown(caseResults = [], { blockedReason = "", metadata = {} } = {}) {
  const items = new Set();
  if (blockedReason) {
    items.add(blockedReason);
  }
  for (const entry of caseResults) {
    const label = entry?.caseId || entry?.label || "unknown-case";
    for (const limitation of entry?.overlay?.knownTemporalLimitations || []) {
      items.add(`[${label}] ${limitation}`);
    }
  }
  const lines = ["# Known Limitations", ""];
  if (metadata && Object.keys(metadata).length) {
    lines.push(`- git_sha: \`${metadata.git_sha || "unknown"}\``);
    lines.push(`- git_branch: \`${metadata.git_branch || "unknown"}\``);
    lines.push(`- worktree_dirty: \`${String(Boolean(metadata.worktree_dirty))}\``);
    lines.push(`- case_manifest_version: \`${metadata.case_manifest_version || "unknown"}\``);
    lines.push(`- config_hash: \`${metadata.config_hash || "unknown"}\``);
    lines.push(`- runner_version: \`${metadata.runner_version || "unknown"}\``);
    lines.push(`- timestamp_utc: \`${metadata.timestamp_utc || "unknown"}\``);
    lines.push("");
  }
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  if (items.size === 0) {
    lines.push("- No additional limitations were captured in this run.");
  }
  return `${lines.join("\n")}\n`;
}
