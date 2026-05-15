import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { buildWildfireCaseManifest, wildfireCaseManifestVersion } from "./caseManifest.mjs";
import { renderReplayReportHtml } from "./replayReport.mjs";
import {
  buildAggregateBeforeAfterComparison,
  buildAggregateMetrics,
  buildAggregateProviderParityReport,
  buildAggregateStaticSourceReport,
  buildAggregateTransactionBudgetReport,
  buildKnownLimitationsMarkdown,
  buildReplayCaseResult,
  buildReplayRequest,
  timestampLabel,
  writeCaseReplayArtifacts,
  writeJson,
  writeText,
} from "./replayArtifacts.mjs";
import {
  baseRunMetadata,
  collectGitMetadata,
  hashConfig,
  sanitizeHeaders,
  sanitizeUrl,
  withArtifactMetadata,
} from "./replayMetadata.mjs";

const require = createRequire(import.meta.url);
const { searchFirmsArea } = require("../../../firmsSearch.cjs");

function parseArgs(argv = []) {
  const parsed = {
    mapKey: process.env.FIRMS_MAP_KEY || "",
    outDir: path.resolve("artifacts", "wildfire-live", timestampLabel()),
    caseIds: [],
    manifestOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--map-key") {
      parsed.mapKey = String(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (token === "--out") {
      parsed.outDir = path.resolve(String(argv[index + 1] || parsed.outDir));
      index += 1;
      continue;
    }
    if (token === "--case") {
      parsed.caseIds.push(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    if (token === "--manifest-only") {
      parsed.manifestOnly = true;
    }
  }

  return parsed;
}

function ensureLiveReplayCase(caseDefinition = {}) {
  if (caseDefinition.time_semantics === "archive_sp") {
    throw new Error(`Case ${caseDefinition.id} is archive_sp and must be replayed with the archive runner.`);
  }
}

function slimOverlayForAggregate(overlay = {}) {
  const rawDetections = Array.isArray(overlay?.rawDetections)
    ? overlay.rawDetections.slice(0, 200).map((point) => ({
        lon: point.lon,
        lat: point.lat,
        sensor: point.sensor,
        acquisition_start_utc: point.acquisition_start_utc,
      }))
    : [];
  const clusters = Array.isArray(overlay?.clusters)
    ? overlay.clusters.slice(0, 50).map((cluster) => ({
        lon: cluster.lon,
        lat: cluster.lat,
        pointCount: cluster.pointCount,
        status: cluster.status,
        eventScore: cluster.eventScore,
      }))
    : [];

  return {
    ...overlay,
    rawDetections,
    clusters,
  };
}

function countPayloadRows(payloads = []) {
  return (Array.isArray(payloads) ? payloads : []).reduce(
    (sum, payload) => sum + (Array.isArray(payload?.rows) ? payload.rows.length : 0),
    0
  );
}

async function fetchSensorPayloads(caseDefinition = {}, request = {}, { mapKey = "", loggedFetch = null } = {}) {
  const sensorPayloads = [];
  for (const sensor of caseDefinition.sensor_priority || []) {
    const payload = await searchFirmsArea(
      loggedFetch,
      {
        bbox: request.bbox,
        dayRange: request.requestedWindowDays,
        products: [sensor],
        mode: request.mode,
        date: request.anchorDate,
      },
      { mapKey }
    );
    sensorPayloads.push(payload);
  }
  return sensorPayloads;
}

function shouldRunRawCountZeroAudit(caseDefinition = {}, request = {}, payloads = []) {
  const auditPolicy = caseDefinition?.query_policy?.raw_count_zero_audit;
  if (!auditPolicy?.enabled) {
    return false;
  }
  if (String(auditPolicy.trigger || "raw_count_zero") !== "raw_count_zero") {
    return false;
  }
  if (auditPolicy.keep_original_anchor === false) {
    return false;
  }
  if (Number(auditPolicy.allowed_window_days || 0) > 0 && Number(request?.requestedWindowDays || 0) !== Number(auditPolicy.allowed_window_days)) {
    return false;
  }
  return countPayloadRows(payloads) === 0;
}

function createLoggedFetch(caseDefinition = {}, requestLog = [], responseLog = [], transactionBudget = {}, { mapKey = "" } = {}) {
  return async function loggedFetch(url, options = {}) {
    const requestId = `${caseDefinition.id}-req-${requestLog.length + 1}`;
    const startedAtMs = Date.now();
    const requestedAtUtc = new Date(startedAtMs).toISOString();
    requestLog.push({
      requestId,
      caseId: caseDefinition.id,
      method: String(options?.method || "GET").toUpperCase(),
      url: sanitizeUrl(url, { mapKey }),
      requestedAtUtc,
    });

    transactionBudget.requestCount = (Number(transactionBudget.requestCount) || 0) + 1;

    try {
      const response = await fetch(url, options);
      const rawText = await response.text();
      const completedAtMs = Date.now();
      const latencyMs = completedAtMs - startedAtMs;
      const responseBytes = Buffer.byteLength(rawText, "utf8");
      const headers = typeof response.headers?.entries === "function" ? Object.fromEntries(response.headers.entries()) : {};

      transactionBudget.responseCount = (Number(transactionBudget.responseCount) || 0) + 1;
      transactionBudget.totalLatencyMs = (Number(transactionBudget.totalLatencyMs) || 0) + latencyMs;
      transactionBudget.totalResponseBytes = (Number(transactionBudget.totalResponseBytes) || 0) + responseBytes;
      transactionBudget.maxLatencyMs = Math.max(Number(transactionBudget.maxLatencyMs) || 0, latencyMs);
      if (response.ok) {
        transactionBudget.successCount = (Number(transactionBudget.successCount) || 0) + 1;
      } else {
        transactionBudget.errorCount = (Number(transactionBudget.errorCount) || 0) + 1;
      }

      responseLog.push({
        requestId,
        caseId: caseDefinition.id,
        url: sanitizeUrl(url, { mapKey }),
        status: response.status,
        ok: response.ok,
        failure_status: response.ok ? "ok" : "http_error",
        latencyMs,
        responseBytes,
        headers: sanitizeHeaders(headers),
        receivedAtUtc: new Date(completedAtMs).toISOString(),
      });

      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        text: async () => rawText,
      };
    } catch (error) {
      const completedAtMs = Date.now();
      const latencyMs = completedAtMs - startedAtMs;
      transactionBudget.errorCount = (Number(transactionBudget.errorCount) || 0) + 1;
      transactionBudget.totalLatencyMs = (Number(transactionBudget.totalLatencyMs) || 0) + latencyMs;
      transactionBudget.maxLatencyMs = Math.max(Number(transactionBudget.maxLatencyMs) || 0, latencyMs);
      responseLog.push({
        requestId,
        caseId: caseDefinition.id,
        url: sanitizeUrl(url, { mapKey }),
        status: null,
        ok: false,
        failure_status: "network_error",
        latencyMs,
        responseBytes: 0,
        headers: {},
        error: String(error?.message || error),
        receivedAtUtc: new Date(completedAtMs).toISOString(),
      });
      throw error;
    }
  };
}

async function replayLiveCase(caseDefinition = {}, { mapKey, outDir, runMetadata }) {
  ensureLiveReplayCase(caseDefinition);

  let request = buildReplayRequest(caseDefinition, { includeLowConfidence: true, queryAttempt: "default" });
  const requestLog = [];
  const responseLog = [];
  const transactionBudget = {};
  const loggedFetch = createLoggedFetch(caseDefinition, requestLog, responseLog, transactionBudget, { mapKey });
  let sensorPayloads = await fetchSensorPayloads(caseDefinition, request, { mapKey, loggedFetch });
  const queryPolicyAudit = {
    policy: caseDefinition.query_policy || null,
    initial_attempt: {
      attempt: request?.queryAudit?.attempt || "default",
      bbox_scale: request?.queryAudit?.bbox_scale || 1,
      raw_count: countPayloadRows(sensorPayloads),
      requested_window_days: request?.requestedWindowDays || caseDefinition.requestedWindowDays || 1,
      anchor_date: request?.anchorDate || null,
    },
    audit_attempt: null,
    adopted_attempt: "default",
    audit_used: false,
  };

  if (shouldRunRawCountZeroAudit(caseDefinition, request, sensorPayloads)) {
    const auditPolicy = caseDefinition.query_policy.raw_count_zero_audit;
    const auditRequest = buildReplayRequest(caseDefinition, {
      includeLowConfidence: true,
      bboxScale: auditPolicy.bbox_scale,
      queryAttempt: "raw_count_zero_bbox_expansion",
    });
    const auditPayloads = await fetchSensorPayloads(caseDefinition, auditRequest, { mapKey, loggedFetch });
    const auditRawCount = countPayloadRows(auditPayloads);
    queryPolicyAudit.audit_attempt = {
      attempt: auditRequest?.queryAudit?.attempt || "raw_count_zero_bbox_expansion",
      bbox_scale: auditRequest?.queryAudit?.bbox_scale || auditPolicy.bbox_scale,
      raw_count: auditRawCount,
      requested_window_days: auditRequest?.requestedWindowDays || request?.requestedWindowDays || caseDefinition.requestedWindowDays || 1,
      anchor_date: auditRequest?.anchorDate || request?.anchorDate || null,
      max_attempts: auditPolicy.max_attempts || 1,
      scope: auditPolicy.scope || "case_local_only",
    };
    queryPolicyAudit.audit_used = true;
    if (auditRawCount > 0) {
      request = auditRequest;
      sensorPayloads = auditPayloads;
      queryPolicyAudit.adopted_attempt = auditRequest?.queryAudit?.attempt || "raw_count_zero_bbox_expansion";
    }
  }

  const caseArtifactMetadata = {
    ...runMetadata,
    case_id: caseDefinition.id,
    case_type: caseDefinition.case_type,
    case_semantics: caseDefinition.case_semantics || null,
    report_group: caseDefinition.report_group || null,
    time_semantics: caseDefinition.time_semantics,
    archive_source: caseDefinition.archive_source || null,
    bundle_version: caseDefinition.bundle_version || null,
    sensor_coverage: caseDefinition.sensor_coverage || caseDefinition.sensor_priority || [],
    config_hash: hashConfig({
      caseId: caseDefinition.id,
      request,
      caseDefinition,
      queryPolicyAudit,
      manifestVersion: wildfireCaseManifestVersion,
    }),
  };

  const replayResult = buildReplayCaseResult(caseDefinition, request, sensorPayloads, {
    requestLog,
    responseLog,
    transactionBudget,
    sourceMode: caseDefinition.time_semantics === "ambiguous_news" ? "live_ambiguous_news" : "live_nrt",
    artifactMetadata: caseArtifactMetadata,
    rawResponseOptions: { mapKey },
    queryPolicyAudit,
  });
  const caseDir = path.join(outDir, caseDefinition.id);
  await writeCaseReplayArtifacts(caseDir, caseDefinition, replayResult, { metadata: caseArtifactMetadata });

  return {
    caseId: replayResult.caseId,
    label: replayResult.label,
    case_type: replayResult.case_type,
    case_semantics: replayResult.case_semantics || caseDefinition.case_semantics || null,
    report_group: replayResult.report_group || caseDefinition.report_group || null,
    time_semantics: replayResult.time_semantics,
    sourceMode: replayResult.sourceMode,
    counts_for_reviewed_af_recall: Boolean(caseDefinition.counts_for_reviewed_af_recall),
    counts_for_af_canary_hit_rate: Boolean(caseDefinition.counts_for_af_canary_hit_rate),
    queryPolicyAudit,
    overlay: slimOverlayForAggregate(replayResult.overlay),
    providerParity: replayResult.providerParity,
    staticSourceReport: replayResult.staticSourceReport,
    transactionBudget: replayResult.transactionBudget,
    outputDir: caseDir,
  };
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
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = buildWildfireCaseManifest();
  const selectedCases = options.caseIds.length
    ? manifest.filter((entry) => options.caseIds.includes(entry.id))
    : manifest;

  if (options.caseIds.length && selectedCases.length !== options.caseIds.length) {
    throw new Error("One or more requested case ids were not found in the wildfire case manifest.");
  }

  if (options.manifestOnly) {
    process.stdout.write(`${JSON.stringify(selectedCases, null, 2)}\n`);
    return;
  }

  if (!options.mapKey) {
    throw new Error("FIRMS_MAP_KEY is required for live wildfire replay. Re-run with --map-key or set the environment variable.");
  }

  await ensureFreshOutputDirectory(options.outDir);
  const stagingOutDir = `${options.outDir}.tmp-${timestampLabel()}`;
  await fs.mkdir(stagingOutDir, { recursive: true });
  const timestampUtc = new Date().toISOString();
  const git = collectGitMetadata();
  const runMetadata = baseRunMetadata({
    runnerName: "live-official-replay",
    configHash: hashConfig({
      cases: selectedCases,
      manifestVersion: wildfireCaseManifestVersion,
    }),
    timestampUtc,
    git,
  });

  try {
    await writeJson(path.join(stagingOutDir, "manifest.json"), withArtifactMetadata({ cases: selectedCases }, runMetadata));
    const caseResults = [];
    for (const caseDefinition of selectedCases) {
      const result = await replayLiveCase(caseDefinition, {
        mapKey: options.mapKey,
        outDir: stagingOutDir,
        runMetadata,
      });
      caseResults.push(result);
    }

    await writeJson(path.join(stagingOutDir, "metrics.json"), withArtifactMetadata(buildAggregateMetrics(caseResults), runMetadata));
    await writeJson(
      path.join(stagingOutDir, "provider_parity_report.json"),
      withArtifactMetadata(buildAggregateProviderParityReport(caseResults), runMetadata)
    );
    await writeJson(
      path.join(stagingOutDir, "before_after_cluster_comparison.json"),
      withArtifactMetadata(buildAggregateBeforeAfterComparison(caseResults), runMetadata)
    );
    await writeJson(
      path.join(stagingOutDir, "static_source_report.json"),
      withArtifactMetadata(buildAggregateStaticSourceReport(caseResults), runMetadata)
    );
    await writeJson(
      path.join(stagingOutDir, "transaction_budget_report.json"),
      withArtifactMetadata(buildAggregateTransactionBudgetReport(caseResults), runMetadata)
    );
    await writeJson(
      path.join(stagingOutDir, "report_data.json"),
      withArtifactMetadata(
        {
          aggregateMetrics: buildAggregateMetrics(caseResults),
          cases: caseResults.map((entry) => ({
            caseId: entry.caseId,
            label: entry.label,
            case_type: entry.case_type,
            case_semantics: entry.case_semantics || null,
            report_group: entry.report_group || null,
            time_semantics: entry.time_semantics,
            replay_status: entry.overlay?.status || "unknown",
            counts_for_reviewed_af_recall: Boolean(entry.counts_for_reviewed_af_recall),
            counts_for_af_canary_hit_rate: Boolean(entry.counts_for_af_canary_hit_rate),
            query_policy_audit: entry.queryPolicyAudit || null,
            outputDir: entry.outputDir.replace(stagingOutDir, options.outDir),
          })),
        },
        runMetadata
      )
    );
    await writeText(
      path.join(stagingOutDir, "known_limitations.md"),
      buildKnownLimitationsMarkdown(caseResults, { metadata: runMetadata })
    );
    await writeText(
      path.join(stagingOutDir, "report.html"),
      renderReplayReportHtml({
        title: "Wildfire Live Replay Report",
        metadata: runMetadata,
        aggregateMetrics: buildAggregateMetrics(caseResults),
        caseResults,
      })
    );

    await fs.rename(stagingOutDir, options.outDir);

    process.stdout.write(
      `${JSON.stringify(
        {
          outputDir: options.outDir,
          caseCount: caseResults.length,
          cases: caseResults.map((entry) => ({
            caseId: entry.caseId,
            case_type: entry.case_type,
            report_group: entry.report_group || null,
            time_semantics: entry.time_semantics,
            status: entry.overlay.status,
            outputDir: entry.outputDir.replace(stagingOutDir, options.outDir),
          })),
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    await fs.rm(stagingOutDir, { recursive: true, force: true });
    throw error;
  }
}

run().catch((error) => {
  process.stderr.write(`${String(error?.stack || error?.message || error)}\n`);
  process.exitCode = 1;
});
