import fs from "node:fs/promises";
import path from "node:path";

import { buildWildfireCaseManifest } from "./caseManifest.mjs";
import { collectGitMetadata } from "./replayMetadata.mjs";
import { writeJson, writeText } from "./replayArtifacts.mjs";

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseArgs() {
  return {
    run5Dir: path.resolve("artifacts", "wildfire-live", "live-official-2026-04-13-run5"),
    run6Dir: path.resolve("artifacts", "wildfire-live", "live-official-2026-04-13-run6"),
    outDir: path.resolve("artifacts", "wildfire-live", "Baseline-Run-2"),
  };
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(String(text).replace(/^\uFEFF/, ""));
}

async function maybeReadJson(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

function parseMarkdownScalar(markdown = "", key = "") {
  const prefix = `- ${key}: \``;
  const line = String(markdown || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix) && entry.endsWith("`"));
  return line ? line.slice(prefix.length, -1) : null;
}

function sumRawCountBySensor(providerParity = {}) {
  return (Array.isArray(providerParity?.rawCountBySensor) ? providerParity.rawCountBySensor : []).reduce(
    (sum, entry) => sum + (Number(entry?.rawCount) || 0),
    0
  );
}

function toCaseDiffMap(run5VsRun6 = {}) {
  return new Map((Array.isArray(run5VsRun6?.cases) ? run5VsRun6.cases : []).map((entry) => [entry.caseId, entry]));
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

async function loadRunCaseSummaries(runDir, runDiffMap = new Map()) {
  const reportData = await readJson(path.join(runDir, "report_data.json"));
  const cases = [];
  for (const entry of reportData.cases || []) {
    const caseDir = entry.outputDir || path.join(runDir, entry.caseId);
    const metrics = await readJson(path.join(caseDir, "metrics.json"));
    const providerParity = await readJson(path.join(caseDir, "provider_parity.json"));
    const comparison = await readJson(path.join(caseDir, "before_after_cluster_comparison.json"));
    const caseSummary = await readText(path.join(caseDir, "case_summary.md"));
    const staticSourceReport = await maybeReadJson(path.join(caseDir, "static_source_report.json"));
    const diffEntry = runDiffMap.get(entry.caseId) || {};
    const run6Side = diffEntry?.run6 || {};

    cases.push({
      caseId: entry.caseId,
      label: entry.label,
      case_type: entry.case_type,
      report_group: entry.report_group || null,
      time_semantics: entry.time_semantics,
      replay_status: entry.replay_status || parseMarkdownScalar(caseSummary, "replay_status") || "unknown",
      raw_official_point_count: sumRawCountBySensor(providerParity),
      official_positive_cluster_count: Number(metrics?.positive_cluster_count) || 0,
      needs_review_cluster_count: Number(metrics?.needs_review_cluster_count) || 0,
      suspicious_cluster_count: Number(staticSourceReport?.suspiciousClusterCount) || 0,
      suspicious_point_count: Number(staticSourceReport?.suspiciousPointCount) || 0,
      fallback_thermal_cluster_count: Number(run6Side?.fallbackClusterCount) || 0,
      legacy_cluster_count: Number(comparison?.legacyClusterCount) || 0,
      new_cluster_count: Number(comparison?.newClusterCount) || 0,
      artifact_dir: caseDir,
      artifact_files: {
        case_summary: path.join(caseDir, "case_summary.md"),
        provider_parity: path.join(caseDir, "provider_parity.json"),
        metrics: path.join(caseDir, "metrics.json"),
        raw_points: path.join(caseDir, "raw_points.geojson"),
      },
    });
  }
  return {
    metadata: reportData.metadata || {},
    aggregateMetrics: reportData.aggregateMetrics || {},
    cases,
  };
}

function buildCaseSemanticsMatrix(manifest = [], run6Cases = []) {
  const caseMap = new Map(run6Cases.map((entry) => [entry.caseId, entry]));
  const cases = manifest.map((entry) => {
    const runCase = caseMap.get(entry.id) || {};
    return {
      caseId: entry.id,
      label: entry.label,
      case_type: entry.case_type,
      case_semantics: entry.case_semantics || null,
      report_group: entry.report_group || null,
      time_semantics: entry.time_semantics,
      counts_for_reviewed_af_recall: Boolean(entry.counts_for_reviewed_af_recall),
      counts_for_af_canary_hit_rate: Boolean(entry.counts_for_af_canary_hit_rate),
      current_run6_status: runCase.replay_status || "unknown",
      current_run6_raw_official_point_count: runCase.raw_official_point_count || 0,
      current_run6_official_positive_cluster_count: runCase.official_positive_cluster_count || 0,
      current_run6_suspicious_cluster_count: runCase.suspicious_cluster_count || 0,
      current_run6_fallback_thermal_cluster_count: runCase.fallback_thermal_cluster_count || 0,
      notes: entry.notes || [],
    };
  });

  const counts = cases.reduce(
    (accumulator, entry) => {
      accumulator[entry.case_semantics] = (accumulator[entry.case_semantics] || 0) + 1;
      return accumulator;
    },
    { AF_gold: 0, AF_canary: 0, BA_canary: 0, empty: 0, trap: 0 }
  );

  return {
    counts,
    cases,
    reviewed_af_recall_cases: cases.filter((entry) => entry.counts_for_reviewed_af_recall).map((entry) => entry.caseId),
    af_canary_hit_cases: cases.filter((entry) => entry.counts_for_af_canary_hit_rate).map((entry) => entry.caseId),
    extra_canary_cases: cases
      .filter((entry) => entry.case_semantics === "AF_canary" && !entry.counts_for_af_canary_hit_rate)
      .map((entry) => entry.caseId),
  };
}

function buildQueryPolicyRegression(manifest = [], missAuditTable = [], run6Cases = []) {
  const springs = manifest.find((entry) => entry.id === "springs-fire-moreno-valley-apr08-2026");
  const run6Springs = run6Cases.find((entry) => entry.caseId === "springs-fire-moreno-valley-apr08-2026") || null;
  const emptyControls = run6Cases.filter((entry) => entry.case_type === "empty");
  const trapControls = run6Cases.filter((entry) => entry.case_type === "static_trap");
  const enabledCases = manifest
    .filter((entry) => entry?.query_policy?.raw_count_zero_audit?.enabled)
    .map((entry) => entry.id);

  const defaultAttempt = (Array.isArray(missAuditTable) ? missAuditTable : []).find(
    (entry) =>
      Number(entry?.bbox_scale) === 1 &&
      Number(entry?.window_days) === 1 &&
      String(entry?.sensor_set) === "union" &&
      String(entry?.confidence_mode) === "nominal_high" &&
      Number(entry?.anchor_offset_h) === 0
  );
  const auditAttempt = (Array.isArray(missAuditTable) ? missAuditTable : []).find(
    (entry) =>
      Number(entry?.bbox_scale) === 1.5 &&
      Number(entry?.window_days) === 1 &&
      String(entry?.sensor_set) === "union" &&
      String(entry?.confidence_mode) === "nominal_high" &&
      Number(entry?.anchor_offset_h) === 0
  );

  const controlsUnaffected =
    emptyControls.every((entry) => Number(entry.official_positive_cluster_count) === 0) &&
    trapControls.every((entry) => Number(entry.official_positive_cluster_count) === 0);

  return {
    target_case: springs?.id || "springs-fire-moreno-valley-apr08-2026",
    policy: springs?.query_policy || null,
    baseline_default_attempt: defaultAttempt || null,
    single_bbox_expansion_audit_attempt: auditAttempt || null,
    adopted_run6_result: {
      replay_status: run6Springs?.replay_status || "unknown",
      raw_official_point_count: run6Springs?.raw_official_point_count || 0,
      official_positive_cluster_count: run6Springs?.official_positive_cluster_count || 0,
    },
    scope_guard: {
      enabled_case_ids: enabledCases,
      empty_controls: emptyControls.map((entry) => ({
        caseId: entry.caseId,
        official_positive_cluster_count: entry.official_positive_cluster_count,
        replay_status: entry.replay_status,
      })),
      trap_controls: trapControls.map((entry) => ({
        caseId: entry.caseId,
        official_positive_cluster_count: entry.official_positive_cluster_count,
        suspicious_cluster_count: entry.suspicious_cluster_count,
        replay_status: entry.replay_status,
      })),
      controls_unaffected: controlsUnaffected,
    },
    verdict:
      (defaultAttempt?.hit === false || defaultAttempt?.raw_count === 0) &&
      Boolean(auditAttempt?.hit) &&
      Number(auditAttempt?.raw_count || 0) > 0 &&
      controlsUnaffected &&
      enabledCases.length === 1
        ? "pass"
        : "needs-review",
  };
}

function buildMetricsSchemaV2() {
  return {
    schema_version: "wildfire-metrics-v2",
    metrics: {
      af_canary_hit_rate: {
        description: "Hit-rate over the primary AF_canary live set only.",
        included_cases: "case_semantics=AF_canary AND report_group=primary_live_canary",
        excluded_cases: "extra canaries, empties, traps, any future AF_gold set",
        null_when: "no AF_canary primary live cases are present",
      },
      reviewed_af_event_recall: {
        description: "Recall over reviewed AF_gold only.",
        included_cases: "case_semantics=AF_gold",
        excluded_cases: "AF_canary, BA_canary, empty, trap",
        null_when: "no reviewed AF_gold exists in the current replay set",
      },
      empty_case_specificity: {
        description: "Specificity over empty cases only.",
        included_cases: "case_semantics=empty",
        excluded_cases: "trap cases are explicitly excluded",
        null_when: "no empty cases are present",
      },
      trap_rejection_rate: {
        description: "Share of trap-case clusters that are not left positive.",
        included_cases: "case_semantics=trap",
        excluded_cases: "empties and canaries",
        null_when: "no trap cases are present",
      },
      static_source_false_positive_rate: {
        description: "Positive-cluster rate inside trap cases after static-source suppression.",
        included_cases: "case_semantics=trap",
        excluded_cases: "all non-trap cases",
        null_when: "no trap cases are present",
      },
    },
    rationale: [
      "Trap performance is isolated from empty-case specificity.",
      "Unreviewed live wildfire positives remain canary-only until AF_gold exists.",
      "reviewed_af_event_recall is intentionally null for the current live set.",
    ],
  };
}

function buildMetricsDiffMarkdown(run5Metrics = {}, run6Metrics = {}) {
  const lines = [
    "# Metrics Diff Run5 vs Run6",
    "",
    `- run5 empty_scene_specificity: \`${run5Metrics.empty_scene_specificity ?? "n/a"}\``,
    `- run6 empty_scene_specificity: \`${run6Metrics.empty_scene_specificity ?? "n/a"}\``,
    `- run6 empty_case_specificity: \`${run6Metrics.empty_case_specificity ?? "n/a"}\``,
    `- run6 trap_rejection_rate: \`${run6Metrics.trap_rejection_rate ?? "n/a"}\``,
    `- run6 af_canary_hit_rate: \`${run6Metrics.af_canary_hit_rate ?? "n/a"}\``,
    `- run6 reviewed_af_event_recall: \`${run6Metrics.reviewed_af_event_recall ?? "null"}\``,
    `- run6 static_source_false_positive_rate: \`${run6Metrics.static_source_false_positive_rate ?? "n/a"}\``,
    "",
    "## Interpretation",
    "",
    "- run5 only exposed `empty_scene_specificity`, and that aggregate was polluted by the trap case path.",
    "- run6 keeps `empty_scene_specificity` for backward compatibility, but adds `empty_case_specificity` so trap behavior no longer drags empty-scene scoring downward.",
    "- run6 adds `trap_rejection_rate`, `af_canary_hit_rate`, and `reviewed_af_event_recall` so canary, trap, and reviewed-gold semantics no longer collapse into one optimistic metric line.",
    "- `reviewed_af_event_recall` remains `null` because the current live set still has no reviewed AF_gold case.",
  ];
  return `${lines.join("\n")}\n`;
}

function buildBaselineSummaryMarkdown({ sourceRunMetadata = {}, run6Cases = [], semantics = {}, queryPolicyRegression = {} } = {}) {
  const primaryPositiveCases = run6Cases.filter((entry) => entry.report_group === "primary_live_canary");
  const positiveHitCount = primaryPositiveCases.filter((entry) => entry.raw_official_point_count > 0).length;
  const emptyCases = run6Cases.filter((entry) => entry.case_type === "empty");
  const emptyPassCount = emptyCases.filter((entry) => entry.official_positive_cluster_count === 0).length;
  const trapCases = run6Cases.filter((entry) => entry.case_type === "static_trap");
  const trapRejectedCount = trapCases.filter((entry) => entry.official_positive_cluster_count === 0).length;

  const lines = [
    "# Baseline Run 6 Summary",
    "",
    "- baseline_run_id: `Baseline-Run-2`",
    "- baseline_source_run: `artifacts/wildfire-live/live-official-2026-04-13-run6`",
    `- git_sha: \`${sourceRunMetadata.git_sha || "unknown"}\``,
    `- git_branch: \`${sourceRunMetadata.git_branch || "unknown"}\``,
    `- worktree_dirty: \`${String(Boolean(sourceRunMetadata.worktree_dirty))}\``,
    `- positive_core_hit: \`${positiveHitCount}/3\``,
    `- empty_pass: \`${emptyPassCount}/2\``,
    `- trap_rejected: \`${trapRejectedCount}/1\``,
    "- archive_status: `archive still frozen`",
    "- reviewed_af_event_recall: `null` because the current live set has no reviewed AF gold case.",
    "",
    "## Semantics",
    "",
    `- AF_gold cases in current live set: ${semantics.counts?.AF_gold || 0}`,
    `- AF_canary cases in current live set: ${semantics.counts?.AF_canary || 0}`,
    `- BA_canary cases in current live set: ${semantics.counts?.BA_canary || 0}`,
    `- empty cases in current live set: ${semantics.counts?.empty || 0}`,
    `- trap cases in current live set: ${semantics.counts?.trap || 0}`,
    "",
    "## Query Policy",
    "",
    `- springs-fire-moreno-valley-apr08-2026 classification: \`${queryPolicyRegression?.verdict === "pass" ? "query/search policy issue" : "needs-review"}\``,
    "- hardened rule: default 24h + original anchor; if rawCount=0, allow one 1.5x bbox expansion audit; no repeated expansion.",
  ];
  return `${lines.join("\n")}\n`;
}

function buildCaseSemanticsSummaryMarkdown(semantics = {}) {
  const lines = [
    "# Case Semantics Summary",
    "",
    `- AF_gold: ${semantics.counts?.AF_gold || 0}`,
    `- AF_canary: ${semantics.counts?.AF_canary || 0}`,
    `- BA_canary: ${semantics.counts?.BA_canary || 0}`,
    `- empty: ${semantics.counts?.empty || 0}`,
    `- trap: ${semantics.counts?.trap || 0}`,
    "",
    "## Metric Eligibility",
    "",
    `- reviewed AF recall includes: \`${JSON.stringify(semantics.reviewed_af_recall_cases || [])}\``,
    `- AF canary hit-rate includes: \`${JSON.stringify(semantics.af_canary_hit_cases || [])}\``,
    `- extra canaries reported separately: \`${JSON.stringify(semantics.extra_canary_cases || [])}\``,
    "",
    "## Notes",
    "",
    "- No current live case is promoted to AF_gold, so reviewed_af_event_recall remains null.",
    "- No current live case is promoted to BA_canary; the live set remains active-fire canary heavy and archive remains frozen.",
    "- `lirquen-chile-jan20-2026` remains an extra AF_canary for diversity, but is intentionally excluded from the core 3-case hit-rate scoreline.",
  ];
  return `${lines.join("\n")}\n`;
}

function buildQueryPolicyRuleMarkdown(queryPolicyRegression = {}) {
  const lines = [
    "# Query Policy Rule",
    "",
    "- target_case: `springs-fire-moreno-valley-apr08-2026`",
    "- default rule: `24h + original anchor + original bbox + union sensors + nominal/high detection policy`",
    "- audit trigger: `rawCount=0` on the default attempt",
    "- audit action: `single 1.5x bbox expansion audit`",
    "- anchor policy: `keep original anchor`",
    "- retry ceiling: `max_attempts=1`",
    "- forbidden behavior: `no unbounded expansion, no automatic 3d/5d widening, no silent anchor drift`",
    "",
    "## Evidence",
    "",
    `- baseline default raw_count: ${queryPolicyRegression?.baseline_default_attempt?.raw_count ?? "n/a"}`,
    `- audit raw_count: ${queryPolicyRegression?.single_bbox_expansion_audit_attempt?.raw_count ?? "n/a"}`,
    `- audit verdict: \`${queryPolicyRegression?.verdict || "needs-review"}\``,
    "",
    "## Scope Guard",
    "",
    `- enabled_case_ids: \`${JSON.stringify(queryPolicyRegression?.scope_guard?.enabled_case_ids || [])}\``,
    `- controls_unaffected: \`${String(Boolean(queryPolicyRegression?.scope_guard?.controls_unaffected))}\``,
  ];
  return `${lines.join("\n")}\n`;
}

function buildUiSemanticsDiffMarkdown() {
  const lines = [
    "# UI Semantics Diff",
    "",
    "## Before",
    "",
    "- run6 report cards exposed `case_type | time_semantics | status`, but did not treat `official positive`, `suspicious`, `fallback thermal`, and `raw official points` as first-class report objects.",
    "- the cluster panel title stayed `Hotspot Clusters` even when the case-level replay status was `fallback`, which risked over-reading fallback output as positive wildfire evidence.",
    "",
    "## After",
    "",
    "- Baseline-Run-2 report data now carries explicit `case_semantics`, metric eligibility, and per-case counts for `raw official points`, `official positive clusters`, `suspicious clusters`, and `fallback thermal clusters`.",
    "- the new baseline report uses separate legend chips and per-case badges so `positive`, `suspicious`, and `fallback` are no longer visually or semantically collapsed.",
    "- `positive` is described as confirmation-oriented evidence, `suspicious` as needs review, and `fallback thermal` as assistive only.",
  ];
  return `${lines.join("\n")}\n`;
}

function buildKnownLimitationsMarkdown({ sourceRunMetadata = {}, run6KnownLimitations = "" } = {}) {
  const sourceLines = String(run6KnownLimitations || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line && line !== "# Known Limitations");
  const lines = [
    "# Known Limitations",
    "",
    `- source_git_sha: \`${sourceRunMetadata.git_sha || "unknown"}\``,
    `- source_git_branch: \`${sourceRunMetadata.git_branch || "unknown"}\``,
    `- source_worktree_dirty: \`${String(Boolean(sourceRunMetadata.worktree_dirty))}\``,
    "",
    "- archive replay remains blocked / frozen and is not part of Baseline-Run-2.",
    "- reviewed_af_event_recall remains null because the current live set still has no reviewed AF_gold case.",
    "- current live set contains no BA_canary case; BA-oriented evaluation remains pending archive unfreeze.",
    "",
    "## Source Run6 Limitations",
    "",
    ...sourceLines,
  ];
  return `${lines.join("\n")}\n`;
}

function buildBeforeAfterReportSemantics(run6Cases = [], semanticsMatrix = {}) {
  const matrixMap = new Map((semanticsMatrix.cases || []).map((entry) => [entry.caseId, entry]));
  return {
    before: {
      source_report: "artifacts/wildfire-live/live-official-2026-04-13-run6/report.html",
      representation: {
        meta_line: ["case_type", "time_semantics", "status"],
        grid_metrics: ["Raw points", "Positive clusters", "Legacy clusters", "New clusters", "Needs review", "Trap suspicious"],
        cluster_panel_title: "Hotspot Clusters",
      },
    },
    after: {
      source_report: "artifacts/wildfire-live/Baseline-Run-2/report.html",
      representation: {
        legend: [
          "Raw official points = preserved FIRMS evidence",
          "Official positive cluster = confirmation-oriented evidence",
          "Suspicious cluster = needs review",
          "Fallback thermal cluster = assistive only",
        ],
        grid_metrics: [
          "Raw official points",
          "Official positive clusters",
          "Suspicious clusters",
          "Fallback thermal clusters",
          "Legacy clusters",
          "New clusters",
        ],
        semantic_badges: ["case_semantics", "replay_state", "metric_eligibility"],
      },
    },
    case_diffs: run6Cases.map((entry) => {
      const semantics = matrixMap.get(entry.caseId) || {};
      return {
        caseId: entry.caseId,
        before: {
          case_type: entry.case_type,
          replay_status: entry.replay_status,
        },
        after: {
          case_semantics: semantics.case_semantics || null,
          replay_status: entry.replay_status,
          raw_official_points: entry.raw_official_point_count || 0,
          official_positive_clusters: entry.official_positive_cluster_count || 0,
          suspicious_clusters: entry.suspicious_cluster_count || 0,
          fallback_thermal_clusters: entry.fallback_thermal_cluster_count || 0,
          counts_for_reviewed_af_recall: Boolean(semantics.counts_for_reviewed_af_recall),
          counts_for_af_canary_hit_rate: Boolean(semantics.counts_for_af_canary_hit_rate),
        },
      };
    }),
  };
}

function buildBaselineReportData({
  sourceRunMetadata = {},
  generationMetadata = {},
  run5Metrics = {},
  run6Metrics = {},
  run6Cases = [],
  semanticsMatrix = {},
  queryPolicyRegression = {},
} = {}) {
  const corePositiveCases = run6Cases.filter((entry) => entry.report_group === "primary_live_canary");
  const emptyCases = run6Cases.filter((entry) => entry.case_type === "empty");
  const trapCases = run6Cases.filter((entry) => entry.case_type === "static_trap");
  const matrixMap = new Map((semanticsMatrix.cases || []).map((entry) => [entry.caseId, entry]));
  return {
    baseline_run_id: "Baseline-Run-2",
    baseline_source_run: "artifacts/wildfire-live/live-official-2026-04-13-run6",
    comparison_source_run: "artifacts/wildfire-live/live-official-2026-04-13-run5",
    source_run_metadata: sourceRunMetadata,
    generation_metadata: generationMetadata,
    aggregate: {
      positive_core_hit: `${corePositiveCases.filter((entry) => entry.raw_official_point_count > 0).length}/3`,
      empty_pass: `${emptyCases.filter((entry) => entry.official_positive_cluster_count === 0).length}/2`,
      trap_rejected: `${trapCases.filter((entry) => entry.official_positive_cluster_count === 0).length}/1`,
      archive_status: "frozen",
      reviewed_af_event_recall: run6Metrics.reviewed_af_event_recall ?? null,
    },
    metrics: {
      run5: run5Metrics,
      run6: run6Metrics,
    },
    semantics_counts: semanticsMatrix.counts || {},
    legend: [
      {
        key: "raw_official_points",
        label: "Raw official points",
        description: "Preserved FIRMS evidence, even when the case is suspicious or fallback only.",
      },
      {
        key: "official_positive_clusters",
        label: "Official positive cluster",
        description: "Confirmation-oriented wildfire evidence.",
      },
      {
        key: "suspicious_clusters",
        label: "Suspicious cluster",
        description: "Needs review; do not read as confirmed wildfire.",
      },
      {
        key: "fallback_thermal_clusters",
        label: "Fallback thermal cluster",
        description: "Assistive only, not a confirmed official wildfire result.",
      },
    ],
    query_policy: queryPolicyRegression,
    cases: run6Cases.map((entry) => {
      const semantics = matrixMap.get(entry.caseId) || {};
      return {
        caseId: entry.caseId,
        label: entry.label,
        case_type: entry.case_type,
        case_semantics: semantics.case_semantics || null,
        report_group: entry.report_group || null,
        time_semantics: entry.time_semantics,
        replay_status: entry.replay_status,
        counts_for_reviewed_af_recall: Boolean(semantics.counts_for_reviewed_af_recall),
        counts_for_af_canary_hit_rate: Boolean(semantics.counts_for_af_canary_hit_rate),
        raw_official_points: entry.raw_official_point_count || 0,
        official_positive_clusters: entry.official_positive_cluster_count || 0,
        suspicious_clusters: entry.suspicious_cluster_count || 0,
        fallback_thermal_clusters: entry.fallback_thermal_cluster_count || 0,
        legacy_clusters: entry.legacy_cluster_count || 0,
        new_clusters: entry.new_cluster_count || 0,
        artifact_dir: entry.artifact_dir,
        artifact_files: entry.artifact_files,
      };
    }),
  };
}

function renderCaseCard(entry = {}) {
  const reviewed = entry.counts_for_reviewed_af_recall ? "included" : "excluded";
  const canary = entry.counts_for_af_canary_hit_rate ? "included" : "excluded";
  return `
    <section class="case-card">
      <h2>${escapeHtml(entry.label)}</h2>
      <p class="meta">${escapeHtml(entry.case_semantics || "unknown")} | ${escapeHtml(entry.time_semantics || "unknown")} | replay: ${escapeHtml(
        entry.replay_status || "unknown"
      )}</p>
      <div class="pill-row">
        <span class="pill pill-raw">Raw official points: ${escapeHtml(String(entry.raw_official_points || 0))}</span>
        <span class="pill pill-positive">Official positive: ${escapeHtml(String(entry.official_positive_clusters || 0))}</span>
        <span class="pill pill-suspicious">Suspicious: ${escapeHtml(String(entry.suspicious_clusters || 0))}</span>
        <span class="pill pill-fallback">Fallback thermal: ${escapeHtml(String(entry.fallback_thermal_clusters || 0))}</span>
      </div>
      <div class="grid">
        <div><strong>Reviewed AF recall</strong><span>${escapeHtml(reviewed)}</span></div>
        <div><strong>AF canary hit-rate</strong><span>${escapeHtml(canary)}</span></div>
        <div><strong>Legacy clusters</strong><span>${escapeHtml(String(entry.legacy_clusters || 0))}</span></div>
        <div><strong>New clusters</strong><span>${escapeHtml(String(entry.new_clusters || 0))}</span></div>
      </div>
      <p class="small">Artifacts: ${escapeHtml(entry.artifact_dir || "")}</p>
    </section>
  `;
}

function renderBaselineReportHtml(reportData = {}) {
  const cards = (Array.isArray(reportData?.cases) ? reportData.cases : []).map((entry) => renderCaseCard(entry)).join("\n");
  const legend = (Array.isArray(reportData?.legend) ? reportData.legend : [])
    .map((entry) => `<div><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.description)}</span></div>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Wildfire Baseline Run 2 Report</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 24px; background: #fbfaf7; color: #1f2937; }
    h1, h2, h3 { margin: 0 0 8px; }
    .top, .case-card { border: 1px solid #e7e5e4; border-radius: 14px; background: #fff; padding: 18px; }
    .top { margin-bottom: 18px; }
    .summary, .legend, .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .summary div, .legend div, .grid div { border: 1px solid #e7e5e4; border-radius: 10px; padding: 10px 12px; background: #fff; display: flex; justify-content: space-between; gap: 12px; }
    .case-card { margin-top: 16px; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 12px; border: 1px solid transparent; }
    .pill-positive { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
    .pill-suspicious { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
    .pill-fallback { background: #ecfeff; border-color: #99f6e4; color: #115e59; }
    .pill-raw { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
    .meta, .small { color: #57534e; }
    .small { font-size: 13px; margin-top: 12px; }
  </style>
</head>
<body>
  <section class="top">
    <h1>Wildfire Baseline Run 2 Report</h1>
    <p class="meta">Source run: ${escapeHtml(reportData.baseline_source_run || "")} | compare: ${escapeHtml(
      reportData.comparison_source_run || ""
    )}</p>
    <div class="summary">
      <div><strong>Positive core hit</strong><span>${escapeHtml(reportData?.aggregate?.positive_core_hit || "n/a")}</span></div>
      <div><strong>Empty pass</strong><span>${escapeHtml(reportData?.aggregate?.empty_pass || "n/a")}</span></div>
      <div><strong>Trap rejected</strong><span>${escapeHtml(reportData?.aggregate?.trap_rejected || "n/a")}</span></div>
      <div><strong>AF canary hit-rate</strong><span>${escapeHtml(String(reportData?.metrics?.run6?.af_canary_hit_rate ?? "n/a"))}</span></div>
      <div><strong>Reviewed AF recall</strong><span>${escapeHtml(String(reportData?.metrics?.run6?.reviewed_af_event_recall ?? "null"))}</span></div>
      <div><strong>Empty specificity</strong><span>${escapeHtml(String(reportData?.metrics?.run6?.empty_case_specificity ?? "n/a"))}</span></div>
      <div><strong>Trap rejection rate</strong><span>${escapeHtml(String(reportData?.metrics?.run6?.trap_rejection_rate ?? "n/a"))}</span></div>
      <div><strong>Archive</strong><span>${escapeHtml(reportData?.aggregate?.archive_status || "unknown")}</span></div>
    </div>
    <h3 style="margin-top:14px;">Semantics Legend</h3>
    <div class="legend">${legend}</div>
  </section>
  ${cards}
</body>
</html>`;
}

async function run() {
  const options = parseArgs();
  await ensureFreshOutputDirectory(options.outDir);

  const run5Metrics = await readJson(path.join(options.run5Dir, "metrics.json"));
  const run6Metrics = await readJson(path.join(options.run6Dir, "metrics.json"));
  const run5VsRun6 = await readJson(path.join(options.run6Dir, "run5_vs_run6_diff.json"));
  const missAuditTable = await readJson(path.join(options.run6Dir, "miss_audit_table.json"));
  const run6KnownLimitations = await readText(path.join(options.run6Dir, "known_limitations.md"));
  const runDiffMap = toCaseDiffMap(run5VsRun6);
  const run6Summary = await loadRunCaseSummaries(options.run6Dir, runDiffMap);
  const manifest = buildWildfireCaseManifest();
  const semanticsMatrix = buildCaseSemanticsMatrix(manifest, run6Summary.cases);
  const queryPolicyRegression = buildQueryPolicyRegression(manifest, missAuditTable, run6Summary.cases);
  const generationMetadata = {
    git: collectGitMetadata(),
    runner_version: "2026-04-13-baseline-freeze-v1",
    timestamp_utc: new Date().toISOString(),
  };
  const reportData = buildBaselineReportData({
    sourceRunMetadata: run6Summary.metadata,
    generationMetadata,
    run5Metrics,
    run6Metrics,
    run6Cases: run6Summary.cases,
    semanticsMatrix,
    queryPolicyRegression,
  });
  const beforeAfterReportSemantics = buildBeforeAfterReportSemantics(run6Summary.cases, semanticsMatrix);

  await fs.mkdir(options.outDir, { recursive: true });
  await writeText(
    path.join(options.outDir, "baseline_run6_summary.md"),
    buildBaselineSummaryMarkdown({
      sourceRunMetadata: run6Summary.metadata,
      run6Cases: run6Summary.cases,
      semantics: semanticsMatrix,
      queryPolicyRegression,
    })
  );
  await writeJson(path.join(options.outDir, "case_semantics_matrix.json"), semanticsMatrix);
  await writeText(path.join(options.outDir, "case_semantics_summary.md"), buildCaseSemanticsSummaryMarkdown(semanticsMatrix));
  await writeText(path.join(options.outDir, "query_policy_rule.md"), buildQueryPolicyRuleMarkdown(queryPolicyRegression));
  await writeJson(path.join(options.outDir, "query_policy_regression_check.json"), queryPolicyRegression);
  await writeText(path.join(options.outDir, "ui_semantics_diff.md"), buildUiSemanticsDiffMarkdown());
  await writeJson(path.join(options.outDir, "before_after_report_semantics.json"), beforeAfterReportSemantics);
  await writeJson(path.join(options.outDir, "metrics_schema_v2.json"), buildMetricsSchemaV2());
  await writeText(path.join(options.outDir, "metrics_diff_run5_run6.md"), buildMetricsDiffMarkdown(run5Metrics, run6Metrics));
  await writeText(
    path.join(options.outDir, "known_limitations.md"),
    buildKnownLimitationsMarkdown({
      sourceRunMetadata: run6Summary.metadata,
      run6KnownLimitations,
    })
  );
  await writeJson(path.join(options.outDir, "report_data.json"), reportData);
  await writeText(path.join(options.outDir, "report.html"), renderBaselineReportHtml(reportData));

  process.stdout.write(
    `${JSON.stringify(
      {
        outDir: options.outDir,
        baseline_run_id: "Baseline-Run-2",
        source_run: options.run6Dir,
        compared_run: options.run5Dir,
      },
      null,
      2
    )}\n`
  );
}

run().catch((error) => {
  process.stderr.write(`${String(error?.stack || error?.message || error)}\n`);
  process.exitCode = 1;
});
