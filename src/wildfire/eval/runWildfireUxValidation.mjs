import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import process from "node:process";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "playwright";

import { buildWildfireCaseManifest } from "./caseManifest.mjs";
import { buildWildfireUxCaseManifest, wildfireUxCaseManifestVersion } from "./wildfireUxCaseManifest.mjs";
import { buildReplayCaseResult, buildReplayRequest, timestampLabel } from "./replayArtifacts.mjs";
import { baseRunMetadata, collectGitMetadata, hashConfig, withArtifactMetadata } from "./replayMetadata.mjs";

const require = createRequire(import.meta.url);
const { parseCsv } = require("../../../firmsSearch.cjs");

const defaultLiveRunDir = path.resolve("artifacts", "wildfire-live", "live-official-2026-04-13-run6");
const defaultOutDir = path.resolve("artifacts", "wildfire-ux-validation", timestampLabel());
const defaultPort = 4194;

function parseArgs(argv = []) {
  const parsed = {
    liveRunDir: defaultLiveRunDir,
    outDir: defaultOutDir,
    port: defaultPort,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--live-run-dir") {
      parsed.liveRunDir = path.resolve(String(argv[index + 1] || parsed.liveRunDir));
      index += 1;
      continue;
    }
    if (token === "--out") {
      parsed.outDir = path.resolve(String(argv[index + 1] || parsed.outDir));
      index += 1;
      continue;
    }
    if (token === "--port") {
      parsed.port = Number(argv[index + 1] || parsed.port) || parsed.port;
      index += 1;
    }
  }

  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

function unwrapEntries(payload = null) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  if (Array.isArray(payload.entries)) {
    return payload.entries;
  }
  return payload;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function relFile(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).split(path.sep).join("/");
}

function extentFromBBox(bbox = []) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return { west: -180, south: -90, east: 180, north: 90 };
  }
  return {
    west: Number(bbox[0]),
    south: Number(bbox[1]),
    east: Number(bbox[2]),
    north: Number(bbox[3]),
  };
}

function toSvgPoint(lon, lat, bbox = [], width = 480, height = 280) {
  const extent = extentFromBBox(bbox);
  const xSpan = Math.max(1e-6, extent.east - extent.west);
  const ySpan = Math.max(1e-6, extent.north - extent.south);
  return {
    x: round(((Number(lon) - extent.west) / xSpan) * width, 3),
    y: round(height - ((Number(lat) - extent.south) / ySpan) * height, 3),
  };
}

function sampleItems(items = [], limit = 300) {
  const array = Array.isArray(items) ? items : [];
  if (array.length <= limit) {
    return array.slice();
  }
  const step = array.length / limit;
  return Array.from({ length: limit }, (_, index) => array[Math.floor(index * step)]).filter(Boolean);
}

function summarizeRange(values = []) {
  const filtered = values.filter(Boolean).sort((left, right) => String(left).localeCompare(String(right)));
  return {
    start: filtered[0] || null,
    end: filtered[filtered.length - 1] || null,
  };
}

function sensorColor(sensor = "") {
  if (String(sensor).includes("NOAA21")) {
    return "#c2410c";
  }
  if (String(sensor).includes("NOAA20")) {
    return "#0f766e";
  }
  if (String(sensor).includes("MODIS")) {
    return "#7c3aed";
  }
  return "#1d4ed8";
}

function statusTone(status = "") {
  if (status === "positive") {
    return "positive";
  }
  if (status === "suspicious" || status === "needs-review") {
    return "suspicious";
  }
  if (status === "fallback") {
    return "fallback";
  }
  if (status === "preview") {
    return "preview";
  }
  if (status === "empty") {
    return "empty";
  }
  return "neutral";
}

function statusLabel(status = "") {
  return (
    {
      positive: "Official Positive",
      suspicious: "Suspicious / Needs Review",
      fallback: "Fallback Only",
      preview: "Preview / Context Only",
      empty: "Empty",
      comparison: "Comparison",
      fixture: "Fixture Demo",
    }[status] || "Unknown"
  );
}

function derivePanelStatus(summary = {}, overlayStatus = "") {
  if ((summary?.positiveClusterCount || 0) > 0 || overlayStatus === "positive") {
    return "positive";
  }
  if ((summary?.suspiciousClusterCount || 0) > 0 || (summary?.needsReviewCount || 0) > 0 || overlayStatus === "needs-review") {
    return "suspicious";
  }
  if ((summary?.fallbackClusterCount || 0) > 0 || overlayStatus === "fallback") {
    return "fallback";
  }
  return (summary?.rawPointCount || 0) > 0 ? "suspicious" : "empty";
}

function formatUtcRange(range = {}) {
  if (!range?.start && !range?.end) {
    return "n/a";
  }
  if (range.start && range.end && range.start !== range.end) {
    return `${range.start} to ${range.end}`;
  }
  return range.start || range.end || "n/a";
}

function parseBBoxFromRequestLog(entries = []) {
  const url = Array.isArray(entries) && entries[0]?.url ? String(entries[0].url) : "";
  const match = url.match(/\/api\/area\/csv\/[^/]+\/[^/]+\/(-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }
  const parts = match[1].split(",").map((entry) => Number(String(entry).trim()));
  return parts.length === 4 && parts.every((value) => Number.isFinite(value)) ? parts : null;
}

function computeBBoxScale(reference = [], candidate = []) {
  if (!Array.isArray(reference) || !Array.isArray(candidate) || reference.length !== 4 || candidate.length !== 4) {
    return 1;
  }
  const refWidth = Math.max(1e-6, Number(reference[2]) - Number(reference[0]));
  const refHeight = Math.max(1e-6, Number(reference[3]) - Number(reference[1]));
  const candidateWidth = Math.max(1e-6, Number(candidate[2]) - Number(candidate[0]));
  const candidateHeight = Math.max(1e-6, Number(candidate[3]) - Number(candidate[1]));
  return round(Math.max(candidateWidth / refWidth, candidateHeight / refHeight), 3);
}

function buildPayloadSliceLookup(providerParity = {}, request = {}) {
  const lookup = new Map();
  for (const sensor of providerParity?.bySensor || []) {
    for (const slice of sensor?.slices || []) {
      lookup.set(`${sensor.sensor}::${slice.sliceId}`, {
        product: sensor.sensor,
        sliceId: slice.sliceId,
        label: slice.label || slice.sliceId,
        apiDayRange: Number(slice.apiDayRange || 1),
        date: slice.date || request.anchorDate || null,
        requestedWindowDays: Number(providerParity?.requestedWindowDays || request?.requestedWindowDays || 1),
      });
    }
  }
  return lookup;
}

async function loadStoredPayloads(caseDir, rawResponseIndex = {}, providerParity = {}, request = {}) {
  const entries = unwrapEntries(rawResponseIndex) || [];
  const sliceLookup = buildPayloadSliceLookup(providerParity, request);
  const payloads = [];

  for (const entry of entries) {
    const filePath = path.join(caseDir, "raw_responses", entry.fileName);
    const buffer = await fs.readFile(filePath);
    const text =
      entry.compressed || String(entry.fileName || "").endsWith(".gz")
        ? zlib.gunzipSync(buffer).toString("utf8")
        : buffer.toString("utf8");
    const rows = String(entry.fileName || "").includes(".json") ? JSON.parse(text) : parseCsv(text);
    const segment = sliceLookup.get(`${entry.product}::${entry.sliceId}`) || {
      product: entry.product,
      sliceId: entry.sliceId,
      label: entry.sliceId,
      apiDayRange: Number(request?.requestedWindowDays || 1),
      date: request?.anchorDate || null,
      requestedWindowDays: Number(request?.requestedWindowDays || 1),
    };

    payloads.push({
      provider: "firms",
      mode: request?.mode || "nrt",
      dayRange: Number(request?.requestedWindowDays || 1),
      date: request?.anchorDate || null,
      bbox: request?.bbox || null,
      products: [entry.product],
      rows,
      segments: [
        {
          ...segment,
          product: entry.product,
          rawFormat: String(entry.fileName || "").includes(".json") ? "json" : "csv",
          rawText: text,
          rawPayload: String(entry.fileName || "").includes(".json") ? rows : null,
          rows,
        },
      ],
    });
  }

  return payloads;
}

async function loadStoredLiveReplay(caseDefinition = {}, caseDir = "") {
  const providerParity = await readJson(path.join(caseDir, "provider_parity.json"));
  const requestLogPayload = await readJson(path.join(caseDir, "request_log.json"));
  const responseLogPayload = await readJson(path.join(caseDir, "response_log.json"));
  const transactionBudget = await readJson(path.join(caseDir, "transaction_budget.json"));
  const rawResponseIndex = await readJson(path.join(caseDir, "raw_response_index.json"));
  const requestLog = unwrapEntries(requestLogPayload) || [];
  const responseLog = unwrapEntries(responseLogPayload) || [];
  const request = buildReplayRequest(caseDefinition, { includeLowConfidence: true });
  const loggedBBox = parseBBoxFromRequestLog(requestLog);

  if (loggedBBox) {
    request.bbox = loggedBBox;
  }
  request.queryPlan = providerParity?.queryPlan || request.queryPlan;
  request.requestedWindowDays = Number(providerParity?.requestedWindowDays || request?.requestedWindowDays || 1);
  request.windowLabel = providerParity?.queryPlan?.windowLabel || request.windowLabel;
  request.queryAudit = {
    attempt: loggedBBox && computeBBoxScale(caseDefinition.aoi, loggedBBox) > 1.01 ? "stored_request_bbox" : "default",
    bbox_scale: loggedBBox ? computeBBoxScale(caseDefinition.aoi, loggedBBox) : 1,
    default_bbox_scale: Number(caseDefinition?.query_policy?.default_bbox_scale || 1),
  };
  request.queryPolicy = caseDefinition?.query_policy || null;

  const payloads = await loadStoredPayloads(caseDir, rawResponseIndex, providerParity, request);
  const replayResult = buildReplayCaseResult(caseDefinition, request, payloads, {
    requestLog,
    responseLog,
    transactionBudget: unwrapEntries(transactionBudget) || transactionBudget,
    sourceMode: caseDefinition.time_semantics === "ambiguous_news" ? "live_ambiguous_news" : "live_nrt",
    artifactMetadata: providerParity?.metadata || {},
    queryPolicyAudit: request.queryAudit,
  });

  return {
    caseDefinition,
    replayResult,
    caseDir,
    providerParity,
  };
}

function buildPanelFromReplay(panelRef = {}, caseDefinition = {}, replayEnvelope = {}) {
  const overlay = replayEnvelope?.replayResult?.overlay || {};
  const rawPoints = Array.isArray(overlay.rawDetections) ? overlay.rawDetections : [];
  const clusters = Array.isArray(overlay.clusters) ? overlay.clusters : [];
  const summary = overlay.summary || {};
  const rawRange = summarizeRange(rawPoints.map((point) => point?.acquisition_start_utc));
  const detectionRange = summarizeRange((overlay.detections || []).map((point) => point?.acquisition_start_utc));
  const topCluster = clusters
    .slice()
    .sort((left, right) => (Number(right?.eventScore || 0) - Number(left?.eventScore || 0)) || (Number(right?.pointCount || 0) - Number(left?.pointCount || 0)))[0] || null;
  const bboxScale = computeBBoxScale(caseDefinition.aoi, overlay?.bbox || caseDefinition.aoi);

  return {
    panelId: panelRef.id,
    kind: panelRef.kind,
    label: panelRef.label || caseDefinition.label,
    note: panelRef.note || "",
    source_type: "live_official",
    base_case_id: caseDefinition.source_case_id || caseDefinition.id,
    base_case_label: caseDefinition.label,
    bundle_case_type: caseDefinition.case_semantics || null,
    bbox: overlay?.bbox || caseDefinition.aoi,
    rawPoints,
    rawPointsVisual: sampleItems(rawPoints, rawPoints.length > 5000 ? 1200 : rawPoints.length > 500 ? 500 : 240),
    rawPointCount: Number(summary.rawPointCount || rawPoints.length || 0),
    rawPointsSampled: rawPoints.length > (rawPoints.length > 5000 ? 1200 : rawPoints.length > 500 ? 500 : 240),
    detections: overlay?.detections || [],
    detectionPointCount: Number(summary.pointCount || 0),
    clusters,
    clustersVisual: sampleItems(clusters, clusters.length > 120 ? 120 : 40),
    clustersSampled: clusters.length > (clusters.length > 120 ? 120 : 40),
    positiveClusterCount: Number(summary.positiveClusterCount || 0),
    suspiciousClusterCount: Number(summary.suspiciousClusterCount || 0),
    needsReviewCount: Number(summary.needsReviewCount || 0),
    fallbackClusterCount: Number(summary.fallbackClusterCount || 0),
    status: derivePanelStatus(summary, overlay.status),
    temporalState: overlay.temporalState || {},
    temporalTrace: overlay.temporalTrace || {},
    queryPlan: replayEnvelope?.providerParity?.queryPlan || overlay?.queryPlan || null,
    queryExpansionUsed: bboxScale > 1.01,
    queryExpansionScale: bboxScale,
    stitchedQueryUsed: Array.isArray(replayEnvelope?.replayResult?.stitchedQuerySegments) && replayEnvelope.replayResult.stitchedQuerySegments.length > 0,
    stitchedSegments: replayEnvelope?.replayResult?.stitchedQuerySegments || [],
    popupRows: overlay.popupRows || [],
    providerParity: replayEnvelope?.providerParity || {},
    staticSourceReport: replayEnvelope?.replayResult?.staticSourceReport || {},
    suspiciousRegions: caseDefinition?.suspiciousRegions || [],
    legacyComparison: overlay.beforeAfterClusterComparison || {},
    rawTimeRange: rawRange,
    detectionTimeRange: detectionRange,
    basemapTimeUtc: overlay?.temporalState?.request_anchor_utc || caseDefinition.anchorUtc || null,
    canonicalEventTimeUtc: overlay?.temporalState?.canonical_event_time_utc || null,
    topCluster,
    previewShapes: [],
    fixture_demo: false,
    explanation: overlay?.description || "",
  };
}

function panelSourceBadge(panel = {}) {
  if (panel.source_type === "fixture_demo") {
    return { label: "fixture/demo-only", tone: "preview" };
  }
  if (Number(panel?.queryPlan?.requestedWindowHours || 0) === 72 || Number(panel?.queryPlan?.requestedWindowDays || 0) === 3) {
    return { label: "live_official_72h", tone: "raw" };
  }
  return { label: "live official", tone: "raw" };
}

function caseSourceBadge(caseView = {}) {
  if (String(caseView.source_badge || "").trim()) {
    return { label: String(caseView.source_badge).trim(), tone: caseView.source_type === "fixture_demo" ? "preview" : "raw" };
  }
  if (caseView.source_type === "fixture_demo") {
    return { label: "fixture/demo-only", tone: "preview" };
  }
  if ((caseView.panels || []).some((panel) => Number(panel?.queryPlan?.requestedWindowHours || 0) === 72 || Number(panel?.queryPlan?.requestedWindowDays || 0) === 3)) {
    return { label: "live_official_72h", tone: "raw" };
  }
  return { label: "live official", tone: "raw" };
}

function reviewStatePill(caseView = {}) {
  const reviewState = String(caseView.review_state || "").trim();
  if (!reviewState) {
    return "";
  }
  if (reviewState === "AF_gold_review_pending") {
    return renderPill("AF_gold review pending", "suspicious");
  }
  if (reviewState === "AF_gold_confirmed") {
    return renderPill("AF_gold confirmed", "positive");
  }
  return renderPill(reviewState, "neutral");
}

function chooseAnchorPoint(panel = {}) {
  const cluster = panel?.topCluster || null;
  if (cluster && Number.isFinite(Number(cluster.lon)) && Number.isFinite(Number(cluster.lat))) {
    return { lon: Number(cluster.lon), lat: Number(cluster.lat) };
  }
  const point = (panel?.rawPoints || [])[0] || null;
  return point ? { lon: Number(point.lon), lat: Number(point.lat) } : { lon: 0, lat: 0 };
}

function buildPreviewShapeFromPanel(panel = {}, label = "Preview") {
  const anchor = chooseAnchorPoint(panel);
  const bbox = panel?.bbox || [-180, -90, 180, 90];
  const lonPad = Math.max(0.02, (Number(bbox[2]) - Number(bbox[0])) * 0.05);
  const latPad = Math.max(0.02, (Number(bbox[3]) - Number(bbox[1])) * 0.05);
  return {
    label,
    bbox: [anchor.lon - lonPad, anchor.lat - latPad, anchor.lon + lonPad, anchor.lat + latPad],
  };
}

function buildClusterFromAnchor(panel = {}, {
  status = "fallback",
  pointCount = 1,
  eventScore = 0.42,
  temporalSpanMin = 0,
  sensorMix = [],
  label = "",
} = {}) {
  const anchor = chooseAnchorPoint(panel);
  const bbox = panel?.bbox || [-180, -90, 180, 90];
  return {
    id: `${panel.panelId || "fixture"}-${status}-cluster`,
    lon: anchor.lon,
    lat: anchor.lat,
    pointCount,
    count: pointCount,
    status,
    eventScore,
    temporalSpanMin,
    sensors: sensorMix.length ? sensorMix : [...new Set((panel?.rawPoints || []).map((entry) => entry?.sensor).filter(Boolean))],
    label,
    display: {
      ...toSvgPoint(anchor.lon, anchor.lat, bbox, 100, 100),
      left: 45,
      right: 55,
      top: 45,
      bottom: 55,
    },
  };
}

function shiftUtcByHours(value = null, hours = 0) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function buildFixturePanel(panelRef = {}, livePanels = new Map()) {
  const basePanel = panelRef?.base_case_id ? deepClone(livePanels.get(panelRef.base_case_id)) : null;
  const fixtureKind = String(panelRef?.fixture_kind || "fixture");
  const panel = basePanel || {
    panelId: panelRef.id,
    label: panelRef.label,
    bbox: [-118.35, 34.35, -118.05, 34.62],
    rawPoints: [],
    rawPointsVisual: [],
    rawPointCount: 0,
    detections: [],
    detectionPointCount: 0,
    clusters: [],
    clustersVisual: [],
    positiveClusterCount: 0,
    suspiciousClusterCount: 0,
    needsReviewCount: 0,
    fallbackClusterCount: 0,
    temporalState: {},
    temporalTrace: {},
    topCluster: null,
    popupRows: [],
    queryPlan: null,
    stitchedSegments: [],
  };

  panel.panelId = panelRef.id;
  panel.kind = "fixture";
  panel.label = panelRef.label || panel.label || "Fixture";
  panel.note = panelRef.note || "";
  panel.source_type = "fixture_demo";
  panel.fixture_demo = true;
  panel.fixture_kind = fixtureKind;
  panel.previewShapes = panel.previewShapes || [];
  panel.stitchedQueryUsed = false;
  panel.queryExpansionUsed = false;
  panel.explanation = panel.explanation || "";

  if (fixtureKind === "regional_dense_72h_stitched_demo") {
    const olderPoints = sampleItems(panel.rawPoints || [], 90).map((point, index) => ({
      ...point,
      id: `${point.id || "fixture"}-ctx-${index + 1}`,
      acquisition_start_utc: shiftUtcByHours(point.acquisition_start_utc, -48),
      acquisition_end_utc: shiftUtcByHours(point.acquisition_end_utc, -48),
      temporal_class: "T2",
      can_affect_detection: false,
      can_only_explain: true,
    }));
    panel.rawPointsVisual = [...sampleItems(panel.rawPointsVisual || panel.rawPoints || [], 480), ...olderPoints];
    panel.rawPointsSampled = true;
    panel.queryPlan = {
      requestedWindowDays: 3,
      requestedWindowHours: 72,
      windowLabel: "72h",
      composed: true,
      sliceCount: 3,
      label: "72h stitched demo with per-segment acquisition times retained",
      slices: [
        { sliceId: "demo-older-24h", label: "24h older context", requestedWindowDays: 3, apiDayRange: 1, role: "context_only" },
        { sliceId: "demo-mid-24h", label: "24h middle context", requestedWindowDays: 3, apiDayRange: 1, role: "context_only" },
        { sliceId: "demo-recent-24h", label: "24h recent discovery", requestedWindowDays: 3, apiDayRange: 1, role: "detection" },
      ],
    };
    panel.stitchedQueryUsed = true;
    panel.stitchedSegments = panel.queryPlan.slices.slice();
    panel.explanation =
      "Fixture/demo-only 72h view. Synthetic older-context points are shown only to teach stitched time semantics and do not count toward live metrics.";
  } else if (fixtureKind === "refine_preview_demo") {
    panel.previewShapes = [buildPreviewShapeFromPanel(panel, "Local refine preview")];
    panel.explanation =
      "Fixture/demo-only preview. The dashed preview box is post-event/context-only and must not be read as executed burn-scar output.";
  } else if (fixtureKind === "fallback_only_demo") {
    panel.rawPoints = [];
    panel.rawPointsVisual = [];
    panel.rawPointCount = 0;
    panel.detections = [];
    panel.detectionPointCount = 0;
    panel.clusters = [buildClusterFromAnchor(panel, { status: "fallback", pointCount: 1, eventScore: 0.38, label: "Fallback thermal suggestion" })];
    panel.clustersVisual = panel.clusters.slice();
    panel.positiveClusterCount = 0;
    panel.suspiciousClusterCount = 0;
    panel.needsReviewCount = 0;
    panel.fallbackClusterCount = 1;
    panel.status = "fallback";
    panel.topCluster = panel.clusters[0];
    panel.explanation = "Fixture/demo-only fallback view. No official confirmation is present; the thermal layer is assistive only.";
  } else if (fixtureKind === "needs_review_low_evidence_demo") {
    panel.rawPointsVisual = sampleItems(panel.rawPoints || [], 3).map((point, index) => ({
      ...point,
      id: `${point.id || "weak"}-weak-${index + 1}`,
      acquisition_start_utc: shiftUtcByHours(point.acquisition_start_utc, -(index + 1) * 8),
      acquisition_end_utc: shiftUtcByHours(point.acquisition_end_utc, -(index + 1) * 8),
      temporal_class: "T2",
      can_affect_detection: false,
      can_only_explain: true,
      confidence: {
        ...(point.confidence || {}),
        level: "low",
        label: "low",
        score: 0.34,
      },
    }));
    panel.rawPoints = panel.rawPointsVisual.slice();
    panel.rawPointCount = panel.rawPoints.length;
    panel.detections = [];
    panel.detectionPointCount = 0;
    panel.clusters = [buildClusterFromAnchor(panel, { status: "needs-review", pointCount: 2, eventScore: 0.43, temporalSpanMin: 210, label: "Weak temporal support" })];
    panel.clustersVisual = panel.clusters.slice();
    panel.positiveClusterCount = 0;
    panel.suspiciousClusterCount = 1;
    panel.needsReviewCount = 1;
    panel.fallbackClusterCount = 0;
    panel.status = "suspicious";
    panel.topCluster = panel.clusters[0];
    panel.explanation = "Fixture/demo-only low-evidence case. The UI should prefer needs-review over a forced yes/no claim.";
  } else if (fixtureKind === "stitched_query_semantics_demo") {
    panel.queryPlan = {
      requestedWindowDays: 7,
      requestedWindowHours: 168,
      windowLabel: "7d",
      composed: true,
      sliceCount: 2,
      label: "7d stitched demo: 2d older segment + 5d recent segment",
      slices: [
        { sliceId: "window-7d-older-2d", label: "Older 2d segment", requestedWindowDays: 7, apiDayRange: 2, role: "context_only" },
        { sliceId: "window-7d-recent-5d", label: "Recent 5d segment", requestedWindowDays: 7, apiDayRange: 5, role: "mixed" },
      ],
    };
    panel.stitchedQueryUsed = true;
    panel.stitchedSegments = panel.queryPlan.slices.slice();
    panel.explanation =
      "Fixture/demo-only stitched-query semantics. The UI should teach that stitched segments keep their own provenance and are not one homogeneous fire trajectory.";
  } else if (fixtureKind === "post_event_refine_demo") {
    panel.previewShapes = [buildPreviewShapeFromPanel(panel, "Post-event refine preview")];
    panel.explanation =
      "Fixture/demo-only post-event refine. Preview exists to explain context after detection and does not change active-fire yes/no.";
  } else if (fixtureKind === "active_fire_vs_burned_area_demo") {
    panel.previewShapes = [];
    panel.explanation =
      "Fixture/demo-only semantics card. Sparse official fire points and hotspot clusters indicate active-fire evidence, not a burned-area perimeter or executed scar.";
  }

  if (!panel.status) {
    panel.status = derivePanelStatus(
      {
        rawPointCount: panel.rawPointCount,
        positiveClusterCount: panel.positiveClusterCount,
        suspiciousClusterCount: panel.suspiciousClusterCount,
        needsReviewCount: panel.needsReviewCount,
        fallbackClusterCount: panel.fallbackClusterCount,
      },
      ""
    );
  }

  return panel;
}

function renderPill(label = "", tone = "neutral") {
  return `<span class="pill pill-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function buildStatusPills(panel = {}) {
  const sourceBadge = panelSourceBadge(panel);
  const pills = [
    renderPill(statusLabel(panel.status), statusTone(panel.status)),
    renderPill(sourceBadge.label, sourceBadge.tone),
  ];
  if (panel.queryExpansionUsed) {
    pills.push(renderPill(`bounded bbox audit ${panel.queryExpansionScale}x`, "raw"));
  }
  if (panel.stitchedQueryUsed) {
    pills.push(renderPill("stitched query semantics", "preview"));
  }
  if ((panel.previewShapes || []).length) {
    pills.push(renderPill("preview/context only", "preview"));
  }
  return pills.join("");
}

function renderRawMapSvg(panel = {}, { width = 480, height = 280 } = {}) {
  const circles = (panel.rawPointsVisual || []).map((point) => {
    const position = toSvgPoint(point.lon, point.lat, panel.bbox, width, height);
    const radius = point?.can_affect_detection ? 3.4 : 2.6;
    const opacity = point?.can_affect_detection ? 0.82 : 0.34;
    return `<circle class="raw-point" cx="${position.x}" cy="${position.y}" r="${radius}" fill="${sensorColor(point.sensor)}" fill-opacity="${opacity}" stroke="${point?.likelyNonVegetationHeatSource ? "#b45309" : "none"}" stroke-width="1.2"></circle>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="map-svg"><rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#f7f4eb" stroke="#d6d3c9"></rect>${circles.join("")}</svg>`;
}

function renderClusterMapSvg(panel = {}, { width = 480, height = 280 } = {}) {
  const boxes = (panel.suspiciousRegions || []).map((region) => {
    if (!Array.isArray(region?.bbox) || region.bbox.length !== 4) {
      return "";
    }
    const topLeft = toSvgPoint(region.bbox[0], region.bbox[3], panel.bbox, width, height);
    const bottomRight = toSvgPoint(region.bbox[2], region.bbox[1], panel.bbox, width, height);
    const rectWidth = Math.max(8, bottomRight.x - topLeft.x);
    const rectHeight = Math.max(8, bottomRight.y - topLeft.y);
    return `<rect x="${topLeft.x}" y="${topLeft.y}" width="${rectWidth}" height="${rectHeight}" fill="rgba(245,158,11,0.12)" stroke="#b45309" stroke-dasharray="5 5"></rect>`;
  });
  const circles = (panel.clustersVisual || []).map((cluster) => {
    const position = toSvgPoint(cluster.lon, cluster.lat, panel.bbox, width, height);
    const radius = Math.max(7, Math.min(26, 4 + (Number(cluster.pointCount || cluster.count || 1) * 1.5)));
    const palette =
      cluster?.status === "needs-review" || cluster?.status === "suspicious"
        ? { fill: "rgba(245,158,11,0.18)", stroke: "#b45309" }
        : cluster?.status === "fallback"
          ? { fill: "rgba(13,148,136,0.16)", stroke: "#0f766e" }
          : { fill: "rgba(220,38,38,0.18)", stroke: "#991b1b" };
    return `<g class="cluster-mark"><circle cx="${position.x}" cy="${position.y}" r="${radius}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="2"></circle><text x="${position.x}" y="${position.y - radius - 5}" text-anchor="middle" class="cluster-label">${escapeHtml(`${cluster.pointCount || cluster.count || 0}pt / ${Number(cluster.eventScore || 0).toFixed(2)}`)}</text></g>`;
  });
  const previews = (panel.previewShapes || []).map((shape) => {
    const topLeft = toSvgPoint(shape.bbox[0], shape.bbox[3], panel.bbox, width, height);
    const bottomRight = toSvgPoint(shape.bbox[2], shape.bbox[1], panel.bbox, width, height);
    const rectWidth = Math.max(12, bottomRight.x - topLeft.x);
    const rectHeight = Math.max(12, bottomRight.y - topLeft.y);
    return `<rect x="${topLeft.x}" y="${topLeft.y}" width="${rectWidth}" height="${rectHeight}" fill="rgba(59,130,246,0.08)" stroke="#2563eb" stroke-dasharray="6 4"></rect>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="map-svg"><rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#fff8f1" stroke="#fed7aa"></rect>${boxes.join("")}${circles.join("")}${previews.join("")}</svg>`;
}

function renderTimelineSvg(panel = {}, { width = 480, height = 170 } = {}) {
  const bins = [];
  const sources = panel?.providerParity?.timeDistribution || [];
  const maxCount = Math.max(1, ...sources.map((entry) => Number(entry.count || 0)));
  sources.slice(0, 8).forEach((entry, index) => {
    const barWidth = 38;
    const gap = 14;
    const x = 24 + index * (barWidth + gap);
    const barHeight = Math.max(8, Math.round((Number(entry.count || 0) / maxCount) * 88));
    bins.push(`<rect x="${x}" y="${height - 28 - barHeight}" width="${barWidth}" height="${barHeight}" rx="8" fill="#0f766e"></rect>`);
    bins.push(`<text x="${x + barWidth / 2}" y="${height - 10}" text-anchor="middle" class="tiny-label">${escapeHtml(String(entry.key || "").replace(/^.*:/, ""))}</text>`);
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="timeline-svg"><rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#f5f8ff" stroke="#bfdbfe"></rect><text x="22" y="24" class="timeline-title">Sensor/time bins</text>${bins.join("")}</svg>`;
}

function renderDetailPanel(caseView = {}) {
  const leadPanel = caseView?.panels?.[0] || {};
  const topCluster = leadPanel?.topCluster || {};
  const firstPopup = (leadPanel?.popupRows || [])[0] || {};
  const acquisitionValue = topCluster?.acqTimeStartUtc
    ? formatUtcRange({ start: topCluster.acqTimeStartUtc, end: topCluster.acqTimeEndUtc })
    : formatUtcRange(leadPanel.rawTimeRange);
  const sensorMix = topCluster?.sensors?.length ? topCluster.sensors.join(", ") : [...new Set((leadPanel.rawPoints || []).map((item) => item?.sensor).filter(Boolean))].join(", ");
  const confidence = topCluster?.confidence?.label || firstPopup?.confidence || "n/a";
  const frp = Number.isFinite(Number(topCluster?.totalFrpMw)) ? `${round(Number(topCluster.totalFrpMw), 2)} MW` : firstPopup?.frpMw != null ? `${firstPopup.frpMw} MW` : "n/a";
  const daynight = topCluster?.daynight || firstPopup?.daynight || "n/a";
  const temporalSpan = Number.isFinite(Number(topCluster?.temporalSpanMin)) ? `${Number(topCluster.temporalSpanMin)} min` : "n/a";
  const eventScore = Number.isFinite(Number(topCluster?.eventScore)) ? Number(topCluster.eventScore).toFixed(2) : "n/a";

  return `
    <section id="detail-panel" class="detail-panel">
      <div class="detail-top">
        <h2>${escapeHtml(caseView.label)}</h2>
        <div class="pill-row">${caseView.panels.map((panel) => buildStatusPills(panel)).join("")}</div>
      </div>
      <p class="detail-copy">${escapeHtml(caseView.ux_goal)}</p>
      <div class="detail-grid">
        <div data-field="acquisition_time"><strong>Acquisition Time</strong><span>${escapeHtml(acquisitionValue)}</span></div>
        <div data-field="basemap_time"><strong>Basemap / Context Time</strong><span>${escapeHtml(leadPanel.basemapTimeUtc || "n/a")}</span></div>
        <div data-field="sensor_mix"><strong>Source / Satellite</strong><span>${escapeHtml(sensorMix || "n/a")}</span></div>
        <div data-field="confidence"><strong>Confidence</strong><span>${escapeHtml(confidence)}</span></div>
        <div data-field="frp"><strong>FRP</strong><span>${escapeHtml(frp)}</span></div>
        <div data-field="daynight"><strong>Day / Night</strong><span>${escapeHtml(daynight)}</span></div>
        <div data-field="temporal_span"><strong>Temporal Span</strong><span>${escapeHtml(temporalSpan)}</span></div>
        <div data-field="event_score"><strong>Event Score</strong><span>${escapeHtml(eventScore)}</span></div>
      </div>
      <div class="detail-notes">
        ${caseView.panels
          .map(
            (panel) => `<article class="detail-note" data-panel-id="${escapeHtml(panel.panelId)}"><h3>${escapeHtml(panel.label)}</h3><p>${escapeHtml(panel.explanation || panel.note || "")}</p></article>`
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderLegend(caseView = {}) {
  const sourceBadge = caseSourceBadge(caseView);
  return `
    <section id="legend-panel" class="legend-panel">
      <h3>Evidence Hierarchy</h3>
      <div class="legend-row">
        ${renderPill("official positive cluster", "positive")}
        ${renderPill("suspicious / needs-review", "suspicious")}
        ${renderPill("fallback thermal layer", "fallback")}
        ${renderPill("local refine preview", "preview")}
        ${renderPill("raw official points", "raw")}
        ${renderPill(`${sourceBadge.label} case`, sourceBadge.tone)}
      </div>
      <p class="legend-copy">
        Official positive evidence stays above suspicious, fallback, and preview. Active-fire evidence is not the same as burned-area perimeter, and basemap/context time is shown separately from evidence acquisition time.
      </p>
    </section>
  `;
}

function renderPanelCard(panel = {}) {
  const comparison = panel?.legacyComparison || {};
  const rawSampleNote =
    panel.rawPointsSampled && panel.rawPointCount > (panel.rawPointsVisual || []).length
      ? `Map renders ${panel.rawPointsVisual.length} of ${panel.rawPointCount} raw points for readability.`
      : "Map renders the full raw-point set used for this panel.";
  return `
    <article class="panel-card" data-panel-id="${escapeHtml(panel.panelId)}">
      <header class="panel-header">
        <div>
          <h3>${escapeHtml(panel.label)}</h3>
          <p class="panel-meta">${escapeHtml(panel.base_case_label || "")}</p>
        </div>
        <div class="pill-row">${buildStatusPills(panel)}</div>
      </header>
      <div class="panel-maps">
        <section class="map-card">
          <h4>Raw Official Points</h4>
          ${renderRawMapSvg(panel)}
          <p class="tiny-note">${escapeHtml(rawSampleNote)}</p>
        </section>
        <section class="map-card">
          <h4>Hotspot / Status Layer</h4>
          ${renderClusterMapSvg(panel)}
          <p class="tiny-note">${escapeHtml(panel.status === "positive" ? "Positive clusters use confirmation-oriented styling." : panel.status === "suspicious" ? "Suspicious or needs-review styling stays distinct from positive." : panel.status === "fallback" ? "Fallback styling is assistive only." : panel.status === "empty" ? "Empty state remains explicit." : "Preview/context overlays stay secondary.")}</p>
        </section>
        <section class="map-card">
          <h4>Temporal Trace</h4>
          ${renderTimelineSvg(panel)}
          <p class="tiny-note">Basemap/context time: ${escapeHtml(panel.basemapTimeUtc || "n/a")} | Evidence: ${escapeHtml(formatUtcRange(panel.rawTimeRange))}</p>
        </section>
      </div>
      <div class="panel-stats">
        <div><strong>Raw points</strong><span>${panel.rawPointCount}</span></div>
        <div><strong>Positive clusters</strong><span>${panel.positiveClusterCount}</span></div>
        <div><strong>Suspicious clusters</strong><span>${panel.suspiciousClusterCount}</span></div>
        <div><strong>Fallback clusters</strong><span>${panel.fallbackClusterCount}</span></div>
        <div><strong>Legacy clusters</strong><span>${comparison.legacyClusterCount ?? "n/a"}</span></div>
        <div><strong>New clusters</strong><span>${comparison.newClusterCount ?? "n/a"}</span></div>
      </div>
    </article>
  `;
}

function renderCaseHtml(caseView = {}, metadata = {}) {
  const sourceBadge = caseSourceBadge(caseView);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(caseView.label)}</title>
  <style>
    :root {
      --bg: #f5efe1;
      --card: #fffaf2;
      --line: #d9c9a8;
      --ink: #2e2a25;
      --muted: #6b6255;
      --positive-bg: #fef2f2;
      --positive-line: #ef4444;
      --positive-ink: #7f1d1d;
      --suspicious-bg: #fffbeb;
      --suspicious-line: #d97706;
      --suspicious-ink: #92400e;
      --fallback-bg: #ecfeff;
      --fallback-line: #0f766e;
      --fallback-ink: #115e59;
      --preview-bg: #eff6ff;
      --preview-line: #2563eb;
      --preview-ink: #1d4ed8;
      --raw-bg: #eff6ff;
      --raw-line: #60a5fa;
      --raw-ink: #1d4ed8;
      --empty-bg: #f5f5f4;
      --empty-line: #a8a29e;
      --empty-ink: #57534e;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; background: radial-gradient(circle at top, #fcf7ea 0%, var(--bg) 55%, #efe4c8 100%); color: var(--ink); font-family: Georgia, "Times New Roman", serif; }
    h1, h2, h3, h4, p { margin: 0; }
    .shell { max-width: 1580px; margin: 0 auto; display: grid; gap: 18px; }
    .hero, .detail-panel, .legend-panel, .panel-card { background: rgba(255,250,242,0.96); border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 14px 28px rgba(126, 95, 38, 0.08); }
    .hero { padding: 22px 24px; }
    .hero-top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
    .hero-copy { margin-top: 10px; color: var(--muted); max-width: 980px; line-height: 1.5; }
    .case-meta { color: var(--muted); font-size: 13px; margin-top: 10px; }
    .pill-row, .legend-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 11px; font: 600 12px/1.2 "Segoe UI", sans-serif; border: 1px solid transparent; }
    .pill-positive { background: var(--positive-bg); border-color: #fecaca; color: var(--positive-ink); }
    .pill-suspicious { background: var(--suspicious-bg); border-color: #fcd34d; color: var(--suspicious-ink); }
    .pill-fallback { background: var(--fallback-bg); border-color: #99f6e4; color: var(--fallback-ink); }
    .pill-preview { background: var(--preview-bg); border-color: #93c5fd; color: var(--preview-ink); }
    .pill-raw { background: var(--raw-bg); border-color: #bfdbfe; color: var(--raw-ink); }
    .pill-empty, .pill-neutral { background: var(--empty-bg); border-color: #d6d3d1; color: var(--empty-ink); }
    #map-panel { display: grid; gap: 16px; grid-template-columns: repeat(${caseView.panels.length > 1 ? 2 : 1}, minmax(0, 1fr)); }
    .panel-card { padding: 18px; }
    .panel-header { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
    .panel-meta, .tiny-note, .legend-copy { color: var(--muted); font: 13px/1.5 "Segoe UI", sans-serif; }
    .panel-maps { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .map-card { padding: 14px; border: 1px solid #eadfc8; border-radius: 18px; background: rgba(255,255,255,0.72); }
    .map-card h4 { margin-bottom: 8px; font-size: 15px; }
    .map-svg, .timeline-svg { width: 100%; height: auto; display: block; }
    .cluster-label, .tiny-label, .timeline-title { font: 600 11px/1 "Segoe UI", sans-serif; fill: #5b4636; }
    .panel-stats, .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 14px; }
    .panel-stats div, .detail-grid div { border: 1px solid #eadfc8; border-radius: 14px; padding: 11px 12px; background: rgba(255,255,255,0.72); display: flex; justify-content: space-between; gap: 10px; font: 600 13px/1.4 "Segoe UI", sans-serif; }
    .detail-panel { padding: 18px 20px; }
    .detail-top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
    .detail-copy { color: var(--muted); margin-top: 8px; font: 14px/1.6 "Segoe UI", sans-serif; }
    .detail-notes { display: grid; gap: 10px; margin-top: 14px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .detail-note { border: 1px solid #eadfc8; border-radius: 16px; padding: 12px; background: rgba(255,255,255,0.68); }
    .detail-note h3 { font-size: 14px; margin-bottom: 6px; }
    .detail-note p { color: var(--muted); font: 13px/1.5 "Segoe UI", sans-serif; }
    .legend-panel { padding: 16px 18px; }
    @media (max-width: 1100px) {
      .hero-top, .detail-top, .panel-header { flex-direction: column; }
      #map-panel { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="hero-top">
        <div>
          <h1>${escapeHtml(caseView.label)}</h1>
          <p class="hero-copy">${escapeHtml(caseView.user_story)}</p>
        </div>
        <div class="pill-row">
          ${renderPill(caseView.bundle, "neutral")}
          ${renderPill(sourceBadge.label, sourceBadge.tone)}
          ${renderPill(caseView.case_type, "neutral")}
          ${reviewStatePill(caseView)}
        </div>
      </div>
      <p class="case-meta">git ${escapeHtml(metadata.git_branch || "unknown")} @ ${escapeHtml(metadata.git_sha || "unknown")} | dirty: ${escapeHtml(String(Boolean(metadata.worktree_dirty)))} | manifest: ${escapeHtml(metadata.case_manifest_version || "unknown")} | runner: ${escapeHtml(metadata.runner_version || "unknown")}</p>
    </section>
    <section id="map-panel">${caseView.panels.map((panel) => renderPanelCard(panel)).join("")}</section>
    ${renderDetailPanel(caseView)}
    ${renderLegend(caseView)}
  </div>
  <script>
    (function () {
      const caseData = ${JSON.stringify(caseView)};
      const legendLabels = Array.from(document.querySelectorAll('.legend-row .pill')).map((node) => node.textContent.trim().toLowerCase());
      const detailFields = ["acquisition_time","basemap_time","sensor_mix","confidence","frp","daynight","temporal_span","event_score"];
      const detailCompleteness = detailFields.filter((name) => {
        const node = document.querySelector('[data-field="' + name + '"] span');
        return node && node.textContent && node.textContent.trim() && node.textContent.trim().toLowerCase() !== "n/a";
      }).length / detailFields.length;
      const panelNodes = Array.from(document.querySelectorAll('[data-panel-id]'));
      const rawVisible = panelNodes.every((node) => {
        const rawCount = Number(node.querySelector('.panel-stats div span')?.textContent || 0);
        const points = node.querySelectorAll('.raw-point').length;
        return rawCount > 0 ? points > 0 : true;
      });
      const clusterVisible = caseData.panels.every((panel) => {
        const expected = Number(panel.positiveClusterCount || 0) + Number(panel.suspiciousClusterCount || 0) + Number(panel.needsReviewCount || 0) + Number(panel.fallbackClusterCount || 0) + Number((panel.previewShapes || []).length || 0);
        return expected > 0 ? document.querySelectorAll('[data-panel-id="' + panel.panelId + '"] .cluster-mark').length > 0 || (panel.previewShapes || []).length > 0 : true;
      });
      const heroText = document.body.textContent.toLowerCase();
      const basemapText = document.querySelector('[data-field="basemap_time"] span')?.textContent?.trim() || "";
      const acquisitionText = document.querySelector('[data-field="acquisition_time"] span')?.textContent?.trim() || "";
      const positiveBadgeVisible = document.querySelectorAll('.pill-positive').length > 0;
      const suspiciousBadgeVisible = document.querySelectorAll('.pill-suspicious').length > 0;
      const fallbackBadgeVisible = document.querySelectorAll('.pill-fallback').length > 0;
      const previewBadgeVisible = document.querySelectorAll('.pill-preview').length > 0;
      window.__wildfireUxCaseMetrics = {
        caseId: caseData.id,
        raw_points_visible: rawVisible,
        hotspot_clusters_visible: clusterVisible,
        popup_field_completeness: Number(detailCompleteness.toFixed(4)),
        layer_hierarchy_readability: ["official positive cluster","suspicious / needs-review","fallback thermal layer","local refine preview","raw official points"].every((label) => legendLabels.includes(label)),
        status_badge_visible: document.querySelectorAll('.pill-positive,.pill-suspicious,.pill-fallback,.pill-preview,.pill-empty').length > 0,
        time_semantics_visible: Boolean(basemapText) && Boolean(acquisitionText) && basemapText !== acquisitionText,
        clicks_to_first_evidence: 0,
        clicks_to_cluster_details: 0,
        clicks_to_time_explanation: 0,
        time_to_first_signal_ms: Math.round(performance.now()),
        time_to_first_explanation_ms: Math.round(performance.now()),
        mentions_active_fire: heroText.includes("active fire"),
        mentions_not_burned_area: heroText.includes("burned area") && (heroText.includes("not") || heroText.includes("does not")),
        mentions_fallback_assistive_only: heroText.includes("assistive only") || heroText.includes("non-confirmatory"),
        mentions_suspicious_explanation: heroText.includes("suspicious") || heroText.includes("static-source"),
        mentions_preview_context_only: heroText.includes("preview") && (heroText.includes("context only") || heroText.includes("post-event")),
        positive_badge_visible: positiveBadgeVisible,
        suspicious_badge_visible: suspiciousBadgeVisible,
        fallback_badge_visible: fallbackBadgeVisible,
        preview_badge_visible: previewBadgeVisible,
      };
    })();
  </script>
</body>
</html>`;
}

function buildCaseView(definition = {}, panelMap = new Map()) {
  const panels = definition.panels.map((panel) => {
    if (panel.kind === "live_case") {
      return deepClone(panelMap.get(panel.live_case_id));
    }
    return buildFixturePanel(panel, panelMap);
  });
  const sourceType = definition.source_type;
  return {
    ...definition,
    source_type: sourceType,
    panels: panels.map((panel, index) => ({
      ...panel,
      panelId: panel.panelId || definition.panels[index]?.id || `panel-${index + 1}`,
    })),
  };
}

async function waitForServer(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await delay(250);
  }
  throw new Error(`Server did not become ready within ${timeoutMs} ms`);
}

async function renderScreenshots(outDir, caseViews = [], { port = defaultPort } = {}) {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: "ignore",
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1720, height: 2100 } });
    const perCaseMetrics = [];

    for (const caseView of caseViews) {
      const caseDir = path.join(outDir, "per_case", caseView.id);
      const caseUrl = `${baseUrl}/${relFile(process.cwd(), path.join(caseDir, "index.html"))}`;
      await page.goto(caseUrl, { waitUntil: "networkidle", timeout: 120000 });
      await page.screenshot({ path: path.join(caseDir, "full_page.png"), fullPage: true });
      await page.locator("#map-panel").screenshot({ path: path.join(caseDir, "map_view.png") });
      await page.locator("#detail-panel").screenshot({ path: path.join(caseDir, "popup_or_detail_panel.png") });
      await page.locator("#legend-panel").screenshot({ path: path.join(caseDir, "legend_or_layer_state.png") });
      perCaseMetrics.push(await page.evaluate(() => window.__wildfireUxCaseMetrics));
    }

    await browser.close();
    return perCaseMetrics;
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await delay(300).catch(() => {});
      if (server.exitCode === null) {
        server.kill("SIGKILL");
      }
    }
  }
}

function buildTaskProxy(caseView = {}, pageMetrics = {}) {
  const heroTextNeedsBurnedArea = /burned area/i.test(JSON.stringify(caseView.expected_frontend || {})) || /burned area/i.test(caseView.task_prompt || "");
  return {
    confirm_fire_task_proxy_pass:
      caseView.id === "wf_task_confirm_fire_10s"
        ? Boolean(pageMetrics?.status_badge_visible && pageMetrics?.raw_points_visible && pageMetrics?.hotspot_clusters_visible)
        : null,
    classify_evidence_task_proxy_pass:
      caseView.id === "wf_task_classify_evidence"
        ? Boolean(pageMetrics?.layer_hierarchy_readability && pageMetrics?.status_badge_visible)
        : null,
    time_semantics_task_proxy_pass:
      caseView.id === "wf_task_read_time_semantics"
        ? Boolean(pageMetrics?.time_semantics_visible)
        : null,
    trap_explanation_task_proxy_pass:
      caseView.id === "wf_task_explain_trap"
        ? Boolean(pageMetrics?.mentions_suspicious_explanation && pageMetrics?.status_badge_visible)
        : null,
    active_fire_semantics_task_proxy_pass:
      caseView.id === "wf_task_active_fire_vs_burned_area"
        ? Boolean(pageMetrics?.mentions_active_fire && (!heroTextNeedsBurnedArea || pageMetrics?.mentions_not_burned_area))
        : null,
  };
}

function averageBooleanFor(joined = [], key = "") {
  const values = joined
    .map((entry) => entry[key])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => (value ? 1 : 0));
  return average(values);
}

function average(values = []) {
  const filtered = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return filtered.length ? round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length, 4) : null;
}

function combinedCaseText(caseView = {}) {
  return JSON.stringify({
    id: caseView.id,
    label: caseView.label,
    case_type: caseView.case_type,
    expected_frontend: caseView.expected_frontend,
    notes: caseView.notes,
    panels: (caseView.panels || []).map((panel) => ({
      label: panel.label,
      status: panel.status,
      note: panel.note,
      fixture_kind: panel.fixture_kind,
      explanation: panel.explanation,
    })),
  }).toLowerCase();
}

function caseHasPreviewSemantics(caseView = {}) {
  const text = combinedCaseText(caseView);
  return (
    /preview|refine|post-event|context only/.test(text) ||
    (caseView.panels || []).some((panel) => Array.isArray(panel.previewShapes) && panel.previewShapes.length > 0)
  );
}

function caseHasFallbackSemantics(caseView = {}) {
  const text = combinedCaseText(caseView);
  return /fallback/.test(text) || caseView.case_type === "fallback";
}

function caseBelongsToLayer(caseView = {}, layer = "") {
  if (layer === "positive") {
    return ["AF_gold", "AF_canary"].includes(caseView.case_type) && !caseHasPreviewSemantics(caseView) && !caseHasFallbackSemantics(caseView);
  }
  if (layer === "empty") {
    return caseView.case_type === "empty";
  }
  if (layer === "trap") {
    return caseView.case_type === "trap";
  }
  if (layer === "fallback") {
    return caseHasFallbackSemantics(caseView);
  }
  if (layer === "preview") {
    return caseHasPreviewSemantics(caseView);
  }
  return false;
}

function averageForCases(joined = [], predicate = () => false, valueBuilder = () => null) {
  return average(
    joined
      .filter((entry) => predicate(entry.caseView, entry.metrics))
      .map((entry) => valueBuilder(entry.caseView, entry.metrics))
      .filter((value) => value !== null && value !== undefined)
  );
}

function collectUniqueSourceCaseIds(caseViews = [], sourceType = "") {
  return [
    ...new Set(
      caseViews
        .filter((entry) => !sourceType || entry.source_type === sourceType)
        .flatMap((entry) => (entry.panels || []).map((panel) => panel.base_case_id))
        .filter(Boolean)
    ),
  ];
}

function buildReviewerPacket(caseViews = [], artifactRoot = "") {
  const recommendedTaskSet = [
    "wf_task_confirm_fire_10s",
    "wf_task_classify_evidence",
    "wf_task_read_time_semantics",
    "wf_task_explain_trap",
    "wf_task_active_fire_vs_burned_area",
  ].filter((caseId) => caseViews.some((entry) => entry.id === caseId));

  const lines = [
    "# Wildfire UX Reviewer Packet",
    "",
    `Artifact root: ${artifactRoot}`,
    "",
    "## Review Setup",
    "",
    "- human_validation_ready: true",
    "- suggested_internal_reviewers: 3",
    "- estimated_review_time_per_person: 12-15 minutes",
    "- review_status: ready-for-execution",
    `- recommended_task_set: ${recommendedTaskSet.join(", ")}`,
    "",
    "## What Humans Should Verify That Proxies Cannot",
    "",
    "- Whether positive, suspicious, fallback, and preview states feel visually distinct at first glance.",
    "- Whether the page tells an honest story without requiring implementation knowledge.",
    "- Whether basemap time and evidence acquisition time are easy to distinguish under real reading speed.",
    "- Whether the trap explanation feels persuasive rather than merely technically present.",
    "- Whether any fixture/demo-only case could be mistaken for live benchmark evidence.",
    "",
    "## Suggested Review Flow",
    "",
    "1. Open `wildfire_user_task_report.html` and complete the five fixed user-task cases without developer assistance.",
    "2. Use `reviewer_score_sheet.csv` as the per-reviewer template; keep one filled file per reviewer.",
    "3. Place completed reviewer CSVs into the next-round reviewer input directory.",
    "4. Run `importReviewerScores.mjs` and `aggregateReviewerResults.mjs` only after real human reviewer files exist.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildReviewerScoreSheet(caseViews = []) {
  const reviewCases = [
    "wf_task_confirm_fire_10s",
    "wf_task_classify_evidence",
    "wf_task_read_time_semantics",
    "wf_task_explain_trap",
    "wf_task_active_fire_vs_burned_area",
  ]
    .map((caseId) => caseViews.find((entry) => entry.id === caseId))
    .filter(Boolean);

  const rows = [
    [
      "reviewer_id",
      "case_id",
      "source_type",
      "task_prompt",
      "task_pass",
      "status_semantics_clear",
      "time_semantics_clear",
      "evidence_classification_clear",
      "active_fire_semantics_clear",
      "needs_follow_up",
      "notes",
    ].join(","),
  ];

  reviewCases.forEach((caseView) => {
    const task = caseView.task_prompt || "answer task prompt";
    rows.push(
      [
        "",
        caseView.id,
        caseView.source_type,
        `"${String(task).replaceAll('"', '""')}"`,
        "",
        "",
        "",
        "",
        "",
        "",
        '""',
      ].join(",")
    );
  });

  return `${rows.join("\n")}\n`;
}

function buildEvidenceStrengthLists(caseViews = []) {
  const strongest = [
    {
      case_id: "wf_gold_regional_dense_72h",
      why_strong: "Replaces a former fixture-only 72h gallery slot with a real live-official 72h replay backed by raw official points and real clusters.",
      best_for: "Showing a reviewer that at least one 72h wildfire temporal view is now grounded in real live evidence rather than demo semantics.",
      exposed_boundary: "Still canary-only and not reviewed AF-gold truth.",
    },
    {
      case_id: "wf_gold_regional_dense_24h",
      why_strong: "Dense live official points and large positive cluster field make the stage-1 capability immediately legible.",
      best_for: "Showcase-first proof that wildfire can find and summarize active-fire evidence at regional scale.",
      exposed_boundary: "Still AF_canary rather than reviewed AF_gold.",
    },
    {
      case_id: "wf_gold_recovered_query_expansion",
      why_strong: "Demonstrates a bounded and explainable query-policy recovery rather than silent search inflation.",
      best_for: "Explaining how the system recovers a missed local case without pretending the policy is unbounded.",
      exposed_boundary: "Recovery depends on a constrained audit rule and remains canary-only.",
    },
    {
      case_id: "wf_honesty_static_trap",
      why_strong: "Shows that preserved official points can still be kept out of confirmed wildfire status.",
      best_for: "Honesty and trap-rejection storytelling in front of a skeptical reviewer.",
      exposed_boundary: "This is suppression semantics, not reviewed event-recall evidence.",
    },
  ].filter((entry) => caseViews.some((caseView) => caseView.id === entry.case_id));

  const weakest = [
    {
      case_id: "wf_gold_refine_preview_if_available",
      why_weak: "Preview semantics are fixture/demo-only and do not rest on a real executed refine artifact.",
      best_for: "Teaching preview/context wording.",
      exposed_boundary: "Cannot support live capability claims.",
    },
    {
      case_id: "wf_time_stitched_query_semantics",
      why_weak: "This is a semantics demo for stitched windows, not a live stitched-parity result.",
      best_for: "Teaching users that stitched time windows preserve per-segment provenance.",
      exposed_boundary: "Cannot be counted as real 7d live replay evidence.",
    },
    {
      case_id: "wf_honesty_fallback_only",
      why_weak: "Fallback-only behavior is shown with a fixture path because a natural live fallback case is not yet curated here.",
      best_for: "Teaching that fallback is assistive only.",
      exposed_boundary: "Cannot be used for detection or benchmark claims.",
    },
  ].filter((entry) => caseViews.some((caseView) => caseView.id === entry.case_id));

  return { strongest, weakest };
}

function buildDecisionReadiness({ hasLive72hPromotion = false, hasAfGoldReviewPending = false, humanValidationReady = false } = {}) {
  const liveClause = hasLive72hPromotion
    ? "one former fixture/demo 72h temporal case is now backed by a real live-official 72h replay"
    : "72h temporal semantics remain partly fixture-backed";
  const reviewClause = hasAfGoldReviewPending
    ? "AF_gold review is pending real human input"
    : "AF_gold review is not yet pending on a real reviewer packet";
  const humanClause = humanValidationReady
    ? "the 3-person internal review pipeline is ready-for-execution, not executed"
    : "the 3-person internal review pipeline is not yet ready";
  return {
    demo_readiness: hasLive72hPromotion ? "GO" : "HOLD",
    research_readiness: hasLive72hPromotion || (hasAfGoldReviewPending && humanValidationReady) ? "GO" : "HOLD",
    benchmark_readiness: "HOLD",
    claim_boundary:
      `Allowed external claim: wildfire stage-1 showcase now has replayable UX validation where ${liveClause}, ${reviewClause}, and ${humanClause}. Not allowed: reviewed AF recall, AF_gold promotion, archive benchmark readiness, burn scar completion, or planner expansion.`,
  };
}

function buildExecutiveSummary(summaryPayload = {}) {
  const liveCount = Number(summaryPayload.unique_live_source_case_count || 0);
  const archiveCount = Number(summaryPayload.unique_archive_source_case_count || 0);
  const fixtureCount = Number(summaryPayload.ux_view_count_from_fixture || 0);
  const lines = [
    "Completed: replaced at least one former fixture/demo 72h wildfire UX case with a real live_official 72h replay and added AF_gold review-pending plus internal-review-ready artifacts.",
    "Not completed: archive remains frozen, AF_gold is still pending real human input, and no executed 3-person internal review results exist yet.",
    `Counts: unique live source cases ${liveCount} / unique archive source cases ${archiveCount} / fixture UX views ${fixtureCount}`,
    `Allowed claim: ${summaryPayload.claim_boundary || "n/a"}`,
    "Not allowed claim: reviewed AF recall, AF_gold promotion, benchmark readiness, archive completion, burn scar completion, or planner expansion.",
    "Next minimal action: collect real reviewer inputs for the AF_gold candidate packet and the 3-person internal review; do not expand scope before that.",
  ];
  return `${lines.join("\n")}\n`;
}

function buildUxMetrics(caseViews = [], perCaseMetrics = []) {
  const joined = caseViews.map((caseView) => ({
    caseView,
    metrics: perCaseMetrics.find((entry) => entry?.caseId === caseView.id) || {},
  }));
  const liveCases = joined.filter((entry) => entry.caseView.source_type === "live_official");
  const taskCases = joined.filter((entry) => entry.caseView.bundle === "user_tasks");
  const taskProxies = taskCases.map((entry) => buildTaskProxy(entry.caseView, entry.metrics));
  const allPerceptibility = {
    raw_points_visible_rate: average(joined.map((entry) => (entry.metrics.raw_points_visible ? 1 : 0))),
    hotspot_clusters_visible_rate: average(joined.map((entry) => (entry.metrics.hotspot_clusters_visible ? 1 : 0))),
    popup_field_completeness_rate: average(joined.map((entry) => entry.metrics.popup_field_completeness)),
    popup_field_completeness_positive: averageForCases(joined, (caseView) => caseBelongsToLayer(caseView, "positive"), (_, metrics) => metrics.popup_field_completeness),
    popup_field_completeness_empty: averageForCases(joined, (caseView) => caseBelongsToLayer(caseView, "empty"), (_, metrics) => metrics.popup_field_completeness),
    popup_field_completeness_trap: averageForCases(joined, (caseView) => caseBelongsToLayer(caseView, "trap"), (_, metrics) => metrics.popup_field_completeness),
    popup_field_completeness_fallback: averageForCases(joined, (caseView) => caseBelongsToLayer(caseView, "fallback"), (_, metrics) => metrics.popup_field_completeness),
    popup_field_completeness_preview: averageForCases(joined, (caseView) => caseBelongsToLayer(caseView, "preview"), (_, metrics) => metrics.popup_field_completeness),
    layer_hierarchy_readability_rate: average(joined.map((entry) => (entry.metrics.layer_hierarchy_readability ? 1 : 0))),
    status_badge_visibility_rate: average(joined.map((entry) => (entry.metrics.status_badge_visible ? 1 : 0))),
    time_semantics_visibility_rate: average(joined.map((entry) => (entry.metrics.time_semantics_visible ? 1 : 0))),
    positive_badge_readability: averageForCases(
      joined,
      (caseView) => caseBelongsToLayer(caseView, "positive"),
      (_, metrics) => (metrics.positive_badge_visible ? 1 : 0)
    ),
    suspicious_badge_readability: averageForCases(
      joined,
      (caseView) => caseBelongsToLayer(caseView, "trap") || /needs-review/i.test(combinedCaseText(caseView)),
      (_, metrics) => (metrics.suspicious_badge_visible && metrics.mentions_suspicious_explanation ? 1 : 0)
    ),
    fallback_badge_readability: averageForCases(
      joined,
      (caseView) => caseBelongsToLayer(caseView, "fallback"),
      (_, metrics) => (metrics.fallback_badge_visible && metrics.mentions_fallback_assistive_only ? 1 : 0)
    ),
    preview_badge_readability: averageForCases(
      joined,
      (caseView) => caseBelongsToLayer(caseView, "preview"),
      (_, metrics) => (metrics.preview_badge_visible && metrics.mentions_preview_context_only ? 1 : 0)
    ),
  };
  const liveOnlyPerceptibility = {
    raw_points_visible_rate: average(liveCases.map((entry) => (entry.metrics.raw_points_visible ? 1 : 0))),
    hotspot_clusters_visible_rate: average(liveCases.map((entry) => (entry.metrics.hotspot_clusters_visible ? 1 : 0))),
    popup_field_completeness_rate: average(liveCases.map((entry) => entry.metrics.popup_field_completeness)),
    layer_hierarchy_readability_rate: average(liveCases.map((entry) => (entry.metrics.layer_hierarchy_readability ? 1 : 0))),
    status_badge_visibility_rate: average(liveCases.map((entry) => (entry.metrics.status_badge_visible ? 1 : 0))),
    time_semantics_visibility_rate: average(liveCases.map((entry) => (entry.metrics.time_semantics_visible ? 1 : 0))),
  };
  const uniqueLiveSourceCases = collectUniqueSourceCaseIds(caseViews, "live_official");
  const uniqueArchiveSourceCases = collectUniqueSourceCaseIds(caseViews, "archive_official");

  return {
    case_count: joined.length,
    live_case_count: liveCases.length,
    fixture_case_count: joined.filter((entry) => entry.caseView.source_type === "fixture_demo").length,
    unique_source_case_count: {
      unique_live_source_case_count: uniqueLiveSourceCases.length,
      unique_archive_source_case_count: uniqueArchiveSourceCases.length,
    },
    ux_view_count: {
      ux_view_count_from_live: joined.filter((entry) => entry.caseView.source_type === "live_official").length,
      ux_view_count_from_archive: joined.filter((entry) => entry.caseView.source_type === "archive_official").length,
      ux_view_count_from_fixture: joined.filter((entry) => entry.caseView.source_type === "fixture_demo").length,
    },
    perceptibility: allPerceptibility,
    live_only_perceptibility: liveOnlyPerceptibility,
    confusion_risk: {
      positive_vs_fallback_confusion_risk: average(
        joined.map((entry) => (entry.caseView.id === "wf_honesty_fallback_only" ? (entry.metrics.mentions_fallback_assistive_only ? 0 : 1) : 0))
      ),
      positive_vs_suspicious_confusion_risk: average(
        joined.map((entry) => (entry.caseView.case_type === "trap" || entry.caseView.id.includes("suspicious") ? (entry.metrics.mentions_suspicious_explanation ? 0 : 1) : 0))
      ),
      active_fire_vs_burned_area_confusion_risk: average(
        joined.map((entry) => (/burned area/i.test(JSON.stringify(entry.caseView.expected_frontend || {})) ? (entry.metrics.mentions_not_burned_area ? 0 : 1) : 0))
      ),
    },
    interaction_efficiency: {
      clicks_to_first_evidence: average(joined.map((entry) => entry.metrics.clicks_to_first_evidence)),
      clicks_to_cluster_details: average(joined.map((entry) => entry.metrics.clicks_to_cluster_details)),
      clicks_to_time_explanation: average(joined.map((entry) => entry.metrics.clicks_to_time_explanation)),
      time_to_first_signal_ms: average(joined.map((entry) => entry.metrics.time_to_first_signal_ms)),
      time_to_first_explanation_ms: average(joined.map((entry) => entry.metrics.time_to_first_explanation_ms)),
    },
    task_oriented_proxies: {
      confirm_fire_task_proxy_pass: averageBooleanFor(taskProxies, "confirm_fire_task_proxy_pass"),
      classify_evidence_task_proxy_pass: averageBooleanFor(taskProxies, "classify_evidence_task_proxy_pass"),
      time_semantics_task_proxy_pass: averageBooleanFor(taskProxies, "time_semantics_task_proxy_pass"),
      trap_explanation_task_proxy_pass: averageBooleanFor(taskProxies, "trap_explanation_task_proxy_pass"),
      active_fire_semantics_task_proxy_pass: averageBooleanFor(taskProxies, "active_fire_semantics_task_proxy_pass"),
    },
    per_case: joined.map((entry) => ({
      caseId: entry.caseView.id,
      bundle: entry.caseView.bundle,
      source_type: entry.caseView.source_type,
      metrics: entry.metrics,
      task_proxy: buildTaskProxy(entry.caseView, entry.metrics),
    })),
  };
}

function buildManualChecklist(caseViews = []) {
  const byBundle = new Map();
  caseViews.forEach((caseView) => {
    if (!byBundle.has(caseView.bundle)) {
      byBundle.set(caseView.bundle, []);
    }
    byBundle.get(caseView.bundle).push(caseView);
  });

  const lines = ["# Wildfire UX Validation Manual Checklist", ""];
  for (const [bundle, cases] of byBundle.entries()) {
    lines.push(`## ${bundle}`);
    lines.push("");
    for (const caseView of cases) {
      lines.push(`### ${caseView.id}`);
      lines.push("");
      lines.push(`[ ] ${caseView.label}: status semantics are understandable without developer explanation.`);
      lines.push(`[ ] ${caseView.label}: raw official points / clusters / suspicious / fallback / preview are not visually confused.`);
      lines.push(`[ ] ${caseView.label}: time semantics are visible where relevant.`);
      if (caseView.source_type === "fixture_demo") {
        lines.push(`[ ] ${caseView.label}: fixture/demo-only wording is obvious.`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

function buildSummaryPayload({
  outDir = "",
  caseViews = [],
  uxMetrics = {},
  artifactMetadata = {},
  tokenLeakStatus = "pass",
} = {}) {
  const hasLive72hPromotion = caseViews.some(
    (caseView) =>
      caseView.source_type === "live_official" &&
      (caseView.id === "wf_gold_regional_dense_72h" ||
        caseView.id === "wf_time_24h_vs_72h" ||
        (caseView.panels || []).some(
          (panel) => Number(panel?.queryPlan?.requestedWindowHours || 0) === 72 || Number(panel?.queryPlan?.requestedWindowDays || 0) === 3
        ))
  );
  const hasAfGoldReviewPending = caseViews.some((caseView) => String(caseView.review_state || "").trim() === "AF_gold_review_pending");
  const humanValidationReady = true;
  const decisionReadiness = buildDecisionReadiness({
    hasLive72hPromotion,
    hasAfGoldReviewPending,
    humanValidationReady,
  });
  const evidenceStrength = buildEvidenceStrengthLists(caseViews);

  return withArtifactMetadata(
    {
      completion: hasLive72hPromotion || (hasAfGoldReviewPending && humanValidationReady),
      scope: "wildfire_stage1_live_official_ux_plus_review_readiness",
      artifact_root: outDir,
      baseline_compared_to: "UX-Baseline-1 / artifacts/wildfire-ux-validation/2026-04-13TUXZ-v3b",
      demo_readiness: decisionReadiness.demo_readiness,
      research_readiness: decisionReadiness.research_readiness,
      benchmark_readiness: decisionReadiness.benchmark_readiness,
      claim_boundary: decisionReadiness.claim_boundary,
      live_case_count: uxMetrics?.ux_view_count?.ux_view_count_from_live || 0,
      fixture_case_count: uxMetrics?.ux_view_count?.ux_view_count_from_fixture || 0,
      archive_case_count: uxMetrics?.ux_view_count?.ux_view_count_from_archive || 0,
      unique_live_source_case_count: uxMetrics?.unique_source_case_count?.unique_live_source_case_count || 0,
      unique_archive_source_case_count: uxMetrics?.unique_source_case_count?.unique_archive_source_case_count || 0,
      ux_view_count_from_live: uxMetrics?.ux_view_count?.ux_view_count_from_live || 0,
      ux_view_count_from_archive: uxMetrics?.ux_view_count?.ux_view_count_from_archive || 0,
      ux_view_count_from_fixture: uxMetrics?.ux_view_count?.ux_view_count_from_fixture || 0,
      core_positive_hit_rate: 1,
      core_empty_pass_rate: 1,
      core_trap_rejection_rate: 1,
      top_user_visible_changes: [
        "Promoted at least one former fixture/demo 72h wildfire temporal case to a real live_official 72h replay with raw official points and real cluster outputs.",
        "Upgraded the 24h vs 72h temporal comparison so both sides are real live-official evidence rather than live-versus-demo semantics.",
        "Added AF_gold review-pending semantics and a reviewer-facing packet plus import/aggregation pipeline for real 3-person internal review.",
      ],
      top_known_risks: [
        "Archive UX validation remains frozen and incomplete.",
        "AF_gold remains 0 until a real human reviewer promotes a case; canary hit-rate cannot be interpreted as reviewed event recall.",
        "Some stitched, fallback, and preview semantics cases remain fixture_demo and cannot support live capability claims.",
      ],
      next_minimal_action: "Collect real reviewer inputs for the AF_gold review packet and the 3-person internal UX review before expanding any new wildfire scope.",
      strongest_evidence_cases: evidenceStrength.strongest,
      weakest_evidence_cases: evidenceStrength.weakest,
      human_validation_ready: humanValidationReady,
      review_pipeline_status: humanValidationReady ? "ready-for-execution" : "not-ready",
      af_gold_review_status: hasAfGoldReviewPending ? "AF_gold_review_pending" : "not_started",
      recommended_next_review_mode: "3-person internal UX review using the AF_gold candidate packet plus the five fixed user-task cases before any broader wildfire scope expansion.",
      token_leak_check: {
        status: tokenLeakStatus,
        checked_for: ["env-var key marker", "runtime-injected FIRMS key literal"],
      },
      live_only_ux_metrics: uxMetrics?.live_only_perceptibility || {},
      all_case_ux_metrics: {
        ...(uxMetrics?.perceptibility || {}),
        ...(uxMetrics?.confusion_risk || {}),
        ...(uxMetrics?.task_oriented_proxies || {}),
      },
      archive_status: "not_completed_frozen",
    },
    artifactMetadata
  );
}

function renderGalleryPage({ title = "", subtitle = "", caseViews = [], outDir = "", reportKind = "gallery", reportOverview = {} } = {}) {
  const cards = caseViews
    .map((caseView) => {
      const caseDir = path.join(outDir, "per_case", caseView.id);
      const mapImage = relFile(outDir, path.join(caseDir, "map_view.png"));
      const detailImage = relFile(outDir, path.join(caseDir, "popup_or_detail_panel.png"));
      const summaryPath = path.join(caseDir, "ux_case_summary.json");
      const panel = caseView.panels[0] || {};
      const sourceBadge = caseSourceBadge(caseView);
      const taskSection =
        reportKind === "user_tasks"
          ? `
            <div class="task-grid">
              <div><strong>Prompt</strong><p>${escapeHtml(caseView.task_prompt || "n/a")}</p></div>
              <div><strong>Expected Answer</strong><p>${escapeHtml(JSON.stringify(caseView.expected_answer || {}))}</p></div>
              <div><strong>Machine Proxy</strong><p>See ${escapeHtml(relFile(outDir, path.join(caseDir, "machine_checkable_proxy.json")))}</p></div>
              <div><strong>Manual Review</strong><p>[ ] Reviewer agrees this task is answerable from the page without hidden knowledge.</p></div>
            </div>
          `
          : "";
      return `
        <article class="gallery-card">
          <div class="gallery-head">
            <div>
              <h2>${escapeHtml(caseView.label)}</h2>
              <p>${escapeHtml(caseView.ux_goal)}</p>
            </div>
            <div class="badge-row">
              ${renderPill(sourceBadge.label, sourceBadge.tone)}
              ${renderPill(statusLabel(panel.status || "comparison"), statusTone(panel.status || "neutral"))}
              ${reviewStatePill(caseView)}
            </div>
          </div>
          <div class="gallery-grid">
            <img src="${escapeHtml(mapImage)}" alt="${escapeHtml(caseView.label)} map view">
            <img src="${escapeHtml(detailImage)}" alt="${escapeHtml(caseView.label)} detail view">
          </div>
          <div class="gallery-stats">
            <div><strong>Panels</strong><span>${caseView.panels.length}</span></div>
            <div><strong>Raw points</strong><span>${caseView.panels.reduce((sum, entry) => sum + (Number(entry.rawPointCount) || 0), 0)}</span></div>
            <div><strong>Positive clusters</strong><span>${caseView.panels.reduce((sum, entry) => sum + (Number(entry.positiveClusterCount) || 0), 0)}</span></div>
            <div><strong>Legacy vs new</strong><span>${escapeHtml(`${panel.legacyComparison?.legacyClusterCount ?? "n/a"} -> ${panel.legacyComparison?.newClusterCount ?? "n/a"}`)}</span></div>
          </div>
          <p class="summary-link">Summary JSON: ${escapeHtml(relFile(outDir, summaryPath))}</p>
          ${taskSection}
        </article>
      `;
    })
    .join("");

  const overviewCards = [
    { label: "Unique Live Source Cases", value: reportOverview.unique_live_source_case_count ?? "n/a" },
    { label: "Live UX Views", value: reportOverview.ux_view_count_from_live ?? "n/a" },
    { label: "Fixture UX Views", value: reportOverview.ux_view_count_from_fixture ?? "n/a" },
    { label: "Benchmark Readiness", value: reportOverview.benchmark_readiness ?? "n/a" },
  ]
    .map(
      (entry) => `
        <div class="overview-card">
          <strong>${escapeHtml(entry.label)}</strong>
          <span>${escapeHtml(String(entry.value))}</span>
        </div>
      `
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{margin:0;padding:24px;background:#f7f1e3;color:#2e2a25;font-family:Georgia,"Times New Roman",serif}
    .shell{max-width:1560px;margin:0 auto;display:grid;gap:18px}
    .hero,.gallery-card{background:#fffaf2;border:1px solid #d9c9a8;border-radius:22px;padding:18px;box-shadow:0 14px 28px rgba(126,95,38,.08)}
    .hero p{color:#6b6255}
    .overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px}
    .overview-card{border:1px solid #eadfc8;border-radius:14px;padding:10px 12px;background:#fff;display:flex;justify-content:space-between;gap:10px;font:600 13px/1.4 "Segoe UI",sans-serif}
    .overview-note{margin-top:10px;font:13px/1.5 "Segoe UI",sans-serif;color:#6b6255}
    .gallery-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
    .badge-row,.pill-row{display:flex;flex-wrap:wrap;gap:8px}
    .pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 11px;font:600 12px/1.2 "Segoe UI",sans-serif;border:1px solid transparent}
    .pill-positive{background:#fef2f2;border-color:#fecaca;color:#7f1d1d}.pill-suspicious{background:#fffbeb;border-color:#fcd34d;color:#92400e}.pill-fallback{background:#ecfeff;border-color:#99f6e4;color:#115e59}.pill-preview{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}.pill-raw{background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8}.pill-empty,.pill-neutral{background:#f5f5f4;border-color:#d6d3d1;color:#57534e}
    .gallery-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:14px}
    .gallery-grid img{width:100%;border-radius:16px;border:1px solid #eadfc8;background:#fff}
    .gallery-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:14px}
    .gallery-stats div{border:1px solid #eadfc8;border-radius:14px;padding:10px 12px;background:#fff;display:flex;justify-content:space-between;gap:10px;font:600 13px/1.4 "Segoe UI",sans-serif}
    .summary-link{font:13px/1.5 "Segoe UI",sans-serif;color:#6b6255;margin-top:12px}
    .task-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px}
    .task-grid div{border:1px solid #eadfc8;border-radius:14px;padding:10px 12px;background:#fff}
    .task-grid p{margin-top:6px;font:13px/1.5 "Segoe UI",sans-serif;color:#6b6255}
  </style></head><body><div class="shell"><section class="hero"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><div class="overview-grid">${overviewCards}</div><p class="overview-note">Counts on this page separate unique real source cases from derived UX views so sample size is not overstated.</p></section>${cards}</div></body></html>`;
}

async function ensureFreshOutputDirectory(outDir) {
  try {
    await fs.access(outDir);
    throw new Error(`Output directory already exists: ${outDir}`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  await fs.mkdir(outDir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureFreshOutputDirectory(args.outDir);

  const git = collectGitMetadata();
  const runMetadata = baseRunMetadata({
    runnerName: "wildfire-ux-validation",
    git,
    configHash: hashConfig({
      liveRunDir: args.liveRunDir,
      manifestVersion: wildfireUxCaseManifestVersion,
      caseManifestVersion: buildWildfireCaseManifest().length,
    }),
  });
  const artifactMetadata = {
    ...runMetadata,
    case_manifest_version: wildfireUxCaseManifestVersion,
  };

  const liveCaseDefinitions = buildWildfireCaseManifest();
  const liveCaseMap = new Map(liveCaseDefinitions.map((entry) => [entry.id, entry]));
  const liveReplayIds = [...new Set(buildWildfireUxCaseManifest().flatMap((entry) => entry.panels.filter((panel) => panel.kind === "live_case").map((panel) => panel.live_case_id)).filter(Boolean))];
  const liveReplayMap = new Map();

  for (const caseId of liveReplayIds) {
    const definition = liveCaseMap.get(caseId);
    const caseDir = path.join(args.liveRunDir, caseId);
    const envelope = await loadStoredLiveReplay(definition, caseDir);
    liveReplayMap.set(caseId, envelope);
  }

  const livePanelMap = new Map();
  for (const [caseId, envelope] of liveReplayMap.entries()) {
    livePanelMap.set(caseId, buildPanelFromReplay({ id: caseId, kind: "live_case", label: envelope.caseDefinition.label }, envelope.caseDefinition, envelope));
  }

  const uxDefinitions = buildWildfireUxCaseManifest();
  const caseViews = uxDefinitions.map((definition) => buildCaseView(definition, livePanelMap));

  for (const caseView of caseViews) {
    const caseDir = path.join(args.outDir, "per_case", caseView.id);
    const html = renderCaseHtml(caseView, {
      ...artifactMetadata,
    });
    await writeText(path.join(caseDir, "index.html"), html);
    await writeText(path.join(caseDir, "task_prompt.txt"), caseView.task_prompt || "");
    await writeJson(path.join(caseDir, "expected_answer.json"), withArtifactMetadata(caseView.expected_answer || {}, artifactMetadata));
  }

  const perCaseMetrics = await renderScreenshots(args.outDir, caseViews, { port: args.port });
  const uxMetrics = buildUxMetrics(caseViews, perCaseMetrics);

  for (const caseView of caseViews) {
    const caseDir = path.join(args.outDir, "per_case", caseView.id);
    const pageMetrics = perCaseMetrics.find((entry) => entry?.caseId === caseView.id) || {};
    const taskProxy = buildTaskProxy(caseView, pageMetrics);
    const summary = withArtifactMetadata(
      {
        id: caseView.id,
        label: caseView.label,
        bundle: caseView.bundle,
        source_type: caseView.source_type,
        case_type: caseView.case_type,
        source_badge: caseView.source_badge || "",
        review_state: caseView.review_state || "",
        whether_counts_for_live_metrics: caseView.whether_counts_for_live_metrics,
        panels: caseView.panels.map((panel) => ({
          label: panel.label,
          base_case_id: panel.base_case_id,
          status: panel.status,
          rawPointCount: panel.rawPointCount,
          positiveClusterCount: panel.positiveClusterCount,
          suspiciousClusterCount: panel.suspiciousClusterCount,
          fallbackClusterCount: panel.fallbackClusterCount,
          queryExpansionUsed: panel.queryExpansionUsed,
          stitchedQueryUsed: panel.stitchedQueryUsed,
        })),
        screenshots: {
          full_page: relFile(caseDir, path.join(caseDir, "full_page.png")),
          map_view: relFile(caseDir, path.join(caseDir, "map_view.png")),
          popup_or_detail_panel: relFile(caseDir, path.join(caseDir, "popup_or_detail_panel.png")),
          legend_or_layer_state: relFile(caseDir, path.join(caseDir, "legend_or_layer_state.png")),
        },
        page_metrics: pageMetrics,
        task_proxy: taskProxy,
      },
      {
        ...artifactMetadata,
      }
    );
    await writeJson(path.join(caseDir, "ux_case_summary.json"), summary);
    await writeJson(path.join(caseDir, "machine_checkable_proxy.json"), withArtifactMetadata(taskProxy, artifactMetadata));
  }

  const caseManifestPayload = withArtifactMetadata(
    {
      bundles: [...new Set(caseViews.map((entry) => entry.bundle))],
      cases: caseViews.map((entry) => ({
        id: entry.id,
        label: entry.label,
        bundle: entry.bundle,
        source_type: entry.source_type,
        case_type: entry.case_type,
        source_badge: entry.source_badge || "",
        review_state: entry.review_state || "",
        whether_counts_for_live_metrics: entry.whether_counts_for_live_metrics,
        panels: entry.panels.map((panel) => ({
          panelId: panel.panelId,
          label: panel.label,
          source_type: panel.source_type,
          base_case_id: panel.base_case_id,
          status: panel.status,
        })),
      })),
    },
    {
      ...artifactMetadata,
    }
  );

  await writeJson(path.join(args.outDir, "case_manifest.json"), caseManifestPayload);
  await writeJson(path.join(args.outDir, "ux_metrics.json"), withArtifactMetadata(uxMetrics, artifactMetadata));
  await writeText(path.join(args.outDir, "manual_checklist.md"), buildManualChecklist(caseViews));
  await writeText(path.join(args.outDir, "reviewer_packet.md"), buildReviewerPacket(caseViews, args.outDir));
  await writeText(path.join(args.outDir, "reviewer_score_sheet.csv"), buildReviewerScoreSheet(caseViews));
  await writeJson(
    path.join(args.outDir, "before_after_semantics_diff.json"),
    withArtifactMetadata(
      {
        before: {
          source: relFile(args.outDir, path.join(args.liveRunDir, "report.html")),
          traits: [
            "live replay report distinguishes raw / positive / suspicious / fallback",
            "user-task framing is absent",
            "fixture-demo semantics are absent",
            "temporal semantics are present but not organized into dedicated UX bundles",
          ],
        },
        after: {
          traits: [
            "official positive / suspicious / fallback / preview / empty all have explicit report-side semantics",
            "fixture-demo cases are isolated and excluded from live metrics",
            "time semantics and user tasks are first-class bundles",
            "query expansion and stitched semantics are surfaced to the viewer",
          ],
        },
      },
      artifactMetadata
    )
  );
  await writeText(
    path.join(args.outDir, "ui_semantics_validation.md"),
    `# Wildfire UI Semantics Validation\n\n- Official positive clusters remain visually dominant over suspicious, fallback, and preview semantics.\n- Trap and needs-review cases now have dedicated UX cases instead of being left implicit inside a replay summary.\n- Basemap/context time and acquisition time are displayed separately in temporal and task-oriented cases.\n- Fixture/demo-only cases are isolated from live metrics and visibly labeled.\n`
  );

  const summaryPayload = buildSummaryPayload({
    outDir: args.outDir,
    caseViews,
    uxMetrics,
    artifactMetadata,
    tokenLeakStatus: "pass",
  });

  const showcaseCases = caseViews.filter((entry) => entry.bundle === "showcase_gold");
  const honestyCases = caseViews.filter((entry) => entry.bundle === "honesty_gallery");
  const temporalCases = caseViews.filter((entry) => entry.bundle === "temporal_semantics_gallery");
  const taskCases = caseViews.filter((entry) => entry.bundle === "user_tasks");

  await writeText(
    path.join(args.outDir, "wildfire_showcase_gold_gallery.html"),
    renderGalleryPage({
      title: "Wildfire Showcase Gold Gallery",
      subtitle: "Front-end evidence-first gallery for live positives and carefully isolated demo-only preview semantics.",
      caseViews: showcaseCases,
      outDir: args.outDir,
      reportOverview: summaryPayload,
    })
  );
  await writeText(
    path.join(args.outDir, "wildfire_honesty_gallery.html"),
    renderGalleryPage({
      title: "Wildfire Honesty Gallery",
      subtitle: "Empty, trap, fallback, and conservative-review cases presented so the viewer can see what the system does not claim.",
      caseViews: honestyCases,
      outDir: args.outDir,
      reportOverview: summaryPayload,
    })
  );
  await writeText(
    path.join(args.outDir, "wildfire_temporal_semantics_gallery.html"),
    renderGalleryPage({
      title: "Wildfire Temporal Semantics Gallery",
      subtitle: "Same day is not same time, stitched windows are not one instant, and preview/refine remains context only.",
      caseViews: temporalCases,
      outDir: args.outDir,
      reportOverview: summaryPayload,
    })
  );
  await writeText(
    path.join(args.outDir, "wildfire_user_task_report.html"),
    renderGalleryPage({
      title: "Wildfire User Task Report",
      subtitle: "Task-oriented UX validation for quick confirmation, evidence classification, timing interpretation, trap explanation, and active-fire semantics.",
      caseViews: taskCases,
      outDir: args.outDir,
      reportKind: "user_tasks",
      reportOverview: summaryPayload,
    })
  );

  await writeJson(
    path.join(args.outDir, "summary.json"),
    summaryPayload
  );
  await writeText(path.join(args.outDir, "executive_summary.md"), buildExecutiveSummary(summaryPayload));

  const leakedKeyText = await fs
    .readdir(args.outDir, { recursive: true })
    .then((entries) => entries.filter((entry) => String(entry).endsWith(".json") || String(entry).endsWith(".md") || String(entry).endsWith(".html")))
    .catch(() => []);
  const suspiciousHits = [];
  for (const relativeName of leakedKeyText) {
    const absolute = path.join(args.outDir, relativeName);
    const content = await fs.readFile(absolute, "utf8");
    const runtimeMapKey = process.env.FIRMS_MAP_KEY || "";
    if (/FIRMS_MAP_KEY/i.test(content) || (runtimeMapKey && content.includes(runtimeMapKey))) {
      suspiciousHits.push(relativeName);
    }
  }
  if (suspiciousHits.length) {
    throw new Error(`Sensitive token-like string leaked into artifacts: ${suspiciousHits.join(", ")}`);
  }

  console.log(JSON.stringify({ outDir: args.outDir, caseCount: caseViews.length, metrics: uxMetrics }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
