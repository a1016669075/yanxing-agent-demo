import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArgs(argv = []) {
  const parsed = {
    baselineUxRoot: path.resolve("artifacts", "wildfire-ux-validation", "2026-04-13TUXZ-v3b"),
    uxRoot: "",
    liveRunDir: "",
    run6Root: path.resolve("artifacts", "wildfire-live", "live-official-2026-04-13-run6"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--baseline-ux-root") {
      parsed.baselineUxRoot = path.resolve(String(argv[index + 1] || parsed.baselineUxRoot));
      index += 1;
      continue;
    }
    if (token === "--ux-root") {
      parsed.uxRoot = path.resolve(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    if (token === "--live-run-dir") {
      parsed.liveRunDir = path.resolve(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    if (token === "--run6-root") {
      parsed.run6Root = path.resolve(String(argv[index + 1] || parsed.run6Root));
      index += 1;
    }
  }

  if (!parsed.uxRoot) {
    throw new Error("--ux-root is required");
  }
  if (!parsed.liveRunDir) {
    throw new Error("--live-run-dir is required");
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

function relFile(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).split(path.sep).join("/");
}

function casePacketDirectory(uxRoot = "", caseId = "") {
  return path.join(uxRoot, "af_gold_review_packet", caseId);
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function totalRawCount(providerParity = {}) {
  if (Array.isArray(providerParity?.rawCountBySensor)) {
    return providerParity.rawCountBySensor.reduce((sum, entry) => sum + safeNumber(entry?.rawCount), 0);
  }
  if (Array.isArray(providerParity?.bySensor)) {
    return providerParity.bySensor.reduce((sum, entry) => sum + safeNumber(entry?.rawCount), 0);
  }
  return safeNumber(providerParity?.rawCount ?? providerParity?.raw_count, 0);
}

function positiveClusterCount(metrics = {}) {
  return safeNumber(metrics?.positiveClusterCount ?? metrics?.positive_cluster_count, 0);
}

function suspiciousClusterCount(metrics = {}) {
  return safeNumber(metrics?.suspiciousClusterCount ?? metrics?.suspicious_cluster_count ?? metrics?.needs_review_cluster_count, 0);
}

function summarizeCounts(summary = {}) {
  const panels = Array.isArray(summary?.panels) ? summary.panels : [];
  return {
    rawCount: panels.reduce((sum, panel) => sum + safeNumber(panel.rawPointCount), 0),
    positiveClusterCount: panels.reduce((sum, panel) => sum + safeNumber(panel.positiveClusterCount), 0),
    suspiciousClusterCount: panels.reduce((sum, panel) => sum + safeNumber(panel.suspiciousClusterCount), 0),
    fallbackClusterCount: panels.reduce((sum, panel) => sum + safeNumber(panel.fallbackClusterCount), 0),
    stitchedQueryUsed: panels.some((panel) => Boolean(panel.stitchedQueryUsed)),
    queryExpansionUsed: panels.some((panel) => Boolean(panel.queryExpansionUsed)),
  };
}

async function maybeCopyFile(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

function buildBaselineSummaryMarkdown(summary = {}, baselineRoot = "") {
  const lines = [
    "# UX-Baseline-1 Summary",
    "",
    `- baseline_root: ${baselineRoot}`,
    "- current stage = wildfire stage-1 live-official + UX validation",
    `- live unique source cases = ${summary?.unique_live_source_case_count ?? "n/a"}`,
    `- live UX views = ${summary?.ux_view_count_from_live ?? "n/a"}`,
    `- fixture UX views = ${summary?.ux_view_count_from_fixture ?? "n/a"}`,
    "- archive = frozen",
    "- AF_gold = 0",
    `- human_validation_ready = ${summary?.human_validation_ready ?? false}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function build72hPromotionSummaryMarkdown(diffPayload = {}, uxSummary = {}, uxRoot = "") {
  const promotedCases = [
    "wf_gold_regional_dense_72h",
    "wf_time_24h_vs_72h",
  ];
  const lines = [
    "# 72h Live Promotion Summary",
    "",
    `- ux_root: ${uxRoot}`,
    `- promoted_cases: ${promotedCases.join(", ")}`,
    `- promoted_live_case_id: ${diffPayload.live_72h_case_id || "n/a"}`,
    `- baseline_24h_case_id: ${diffPayload.baseline_24h_case_id || "n/a"}`,
    `- same_unique_live_source_case_count_preserved: ${uxSummary?.unique_live_source_case_count ?? "n/a"}`,
    `- live_24h_raw_count: ${diffPayload?.comparison?.raw_point_count?.["24h"] ?? "n/a"}`,
    `- live_72h_raw_count: ${diffPayload?.comparison?.raw_point_count?.["72h"] ?? "n/a"}`,
    `- live_24h_positive_clusters: ${diffPayload?.comparison?.positive_cluster_count?.["24h"] ?? "n/a"}`,
    `- live_72h_positive_clusters: ${diffPayload?.comparison?.positive_cluster_count?.["72h"] ?? "n/a"}`,
    `- stitched_query_used_for_72h: ${diffPayload?.comparison?.query?.["72h"]?.stitched_query_used ?? false}`,
    "",
    "This promotion replaces the former fixture/demo-only 72h regional view with a real live_official 72h replay. The dedicated stitched semantics case remains separate and is not silently upgraded.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildCandidateBrief(caseView = {}, counts = {}, priority = 0, status = "") {
  const lines = [
    `# ${caseView.label}`,
    "",
    `- ux_case_id: ${caseView.id}`,
    `- source_type: ${caseView.source_type}`,
    `- case_type: ${caseView.case_type}`,
    `- priority: ${priority}`,
    `- AF_gold_review_status: ${status}`,
    `- rawCount: ${counts.rawCount}`,
    `- positiveClusterCount: ${counts.positiveClusterCount}`,
    `- suspiciousClusterCount: ${counts.suspiciousClusterCount}`,
    `- fallbackClusterCount: ${counts.fallbackClusterCount}`,
    "",
    caseView.ux_goal || "",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildStrengthNote(caseView = {}, counts = {}, note = "") {
  const lines = [
    `# Why ${caseView.id} Is Strong Or Not`,
    "",
    `- rawCount: ${counts.rawCount}`,
    `- positiveClusterCount: ${counts.positiveClusterCount}`,
    `- queryExpansionUsed: ${counts.queryExpansionUsed}`,
    `- stitchedQueryUsed: ${counts.stitchedQueryUsed}`,
    "",
    note,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildRequiredQuestions(caseView = {}) {
  const lines = [
    `# Required Human Review Questions For ${caseView.id}`,
    "",
    "1. Do the official raw points and cluster pattern support an active-fire interpretation within the stated acquisition-time window?",
    "2. Is the time semantics note precise enough that a reviewer can distinguish acquisition time from basemap/context time?",
    "3. Would you mark this case AF_gold yes / no / uncertain based on the evidence shown here alone?",
    "4. Is there any reason this case should remain AF_canary only rather than reviewed AF_gold?",
    "5. Does any query-expansion, sparse support, or regional ambiguity weaken the case enough to block AF_gold promotion?",
    "",
    `Current case label: ${caseView.label}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildTimeSemanticsNote(caseView = {}, summary = {}) {
  const panels = Array.isArray(summary?.panels) ? summary.panels : [];
  const lines = [
    `# Time Semantics Note For ${caseView.id}`,
    "",
    ...panels.map((panel) => `- ${panel.label}: stitchedQueryUsed=${Boolean(panel.stitchedQueryUsed)}, queryExpansionUsed=${Boolean(panel.queryExpansionUsed)}, status=${panel.status}`),
    "",
    "Reviewer reminder: AF_gold should be decided from the official active-fire evidence window shown here, not from the basemap time or later narrative context.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildDecisionTemplate(caseView = {}) {
  const lines = [
    `# Reviewer Decision Template For ${caseView.id}`,
    "",
    "- reviewer_id:",
    "- decision: AF_gold yes / no / uncertain",
    "- confidence: high / medium / low",
    "- evidence_supports_active_fire:",
    "- time_semantics_clear_enough:",
    "- reasons:",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildOnePageSummary(caseView = {}, packetDir = "", uxRoot = "") {
  const sourceCaseDir = path.join(uxRoot, "per_case", caseView.id);
  const lines = [
    `# AF Gold Review Packet: ${caseView.label}`,
    "",
    `- case_id: ${caseView.id}`,
    `- source_type: ${caseView.source_type}`,
    `- case_type: ${caseView.case_type}`,
    `- review_state: ${caseView.review_state || "candidate_only"}`,
    `- full_page_snapshot: ${relFile(packetDir, path.join(sourceCaseDir, "full_page.png"))}`,
    `- raw_official_snapshot: ${relFile(packetDir, path.join(packetDir, "raw_official_evidence_snapshot.png"))}`,
    `- cluster_snapshot: ${relFile(packetDir, path.join(packetDir, "cluster_snapshot.png"))}`,
    `- detail_snapshot: ${relFile(packetDir, path.join(packetDir, "detail_panel_snapshot.png"))}`,
    "",
    "Reviewer decision field: see reviewer_decision_template.md",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildAfGoldStatusMarkdown(ranked = [], reviewInputCount = 0) {
  const lines = [
    "# AF Gold Review Status",
    "",
    `- review_input_count: ${reviewInputCount}`,
    `- status: ${reviewInputCount > 0 ? "input_detected" : "AF_gold_review_pending"}`,
    "",
  ];
  ranked.forEach((entry) => {
    lines.push(`## ${entry.ux_case_id}`);
    lines.push("");
    lines.push(`- priority: ${entry.priority}`);
    lines.push(`- status: ${entry.status}`);
    lines.push(`- rawCount: ${entry.rawCount}`);
    lines.push(`- positiveClusterCount: ${entry.positiveClusterCount}`);
    lines.push(`- why: ${entry.why}`);
    lines.push("");
  });
  if (!reviewInputCount) {
    lines.push("No real human reviewer input files were detected. No case has been promoted to AF_gold.");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function buildReviewPipelineStatusMarkdown({ inputDir = "", inputFiles = [] } = {}) {
  const executed = inputFiles.length >= 3;
  const inProgress = inputFiles.length > 0 && inputFiles.length < 3;
  const status = executed ? "executed" : inProgress ? "in progress" : "ready";
  const lines = [
    "# Review Pipeline Status",
    "",
    `- status: ${status}`,
    "- target_reviewers: 3",
    `- reviewer_input_dir: ${inputDir}`,
    `- detected_input_files: ${inputFiles.join(", ") || "none"}`,
    "- fixed_task_set: wf_task_confirm_fire_10s, wf_task_classify_evidence, wf_task_read_time_semantics, wf_task_explain_trap, wf_task_active_fire_vs_burned_area",
    "",
  ];
  if (executed) {
    lines.push("Real reviewer inputs are present. Run importReviewerScores.mjs and aggregateReviewerResults.mjs to materialize executed review outputs.");
  } else if (inProgress) {
    lines.push("Partial reviewer inputs are present, but the 3-person internal review is not yet complete.");
  } else {
    lines.push("No real reviewer input is present yet. The pipeline is ready-for-execution, not executed.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const baselineSummary = await readJson(path.join(args.baselineUxRoot, "summary.json"));
  const uxSummary = await readJson(path.join(args.uxRoot, "summary.json"));
  const caseManifest = await readJson(path.join(args.uxRoot, "case_manifest.json"));

  const baselineSummaryPath = path.join(path.dirname(args.baselineUxRoot), "baselines", "UX-Baseline-1", "ux_baseline_v3b_summary.md");
  await writeText(baselineSummaryPath, buildBaselineSummaryMarkdown(baselineSummary, args.baselineUxRoot));

  const live24hProvider = await readJson(path.join(args.run6Root, "indochina-hotspot-apr03-2026", "provider_parity.json"));
  const live24hMetrics = await readJson(path.join(args.run6Root, "indochina-hotspot-apr03-2026", "metrics.json"));
  const live72hProvider = await readJson(path.join(args.liveRunDir, "indochina-hotspot-apr03-2026-72h-live", "provider_parity.json"));
  const live72hMetrics = await readJson(path.join(args.liveRunDir, "indochina-hotspot-apr03-2026-72h-live", "metrics.json"));

  const diffPayload = {
    baseline_24h_case_id: "indochina-hotspot-apr03-2026",
    live_72h_case_id: "indochina-hotspot-apr03-2026-72h-live",
    unique_source_case_id: "indochina-hotspot-apr03-2026",
    comparison: {
      raw_point_count: {
        "24h": totalRawCount(live24hProvider),
        "72h": totalRawCount(live72hProvider),
      },
      positive_cluster_count: {
        "24h": positiveClusterCount(live24hMetrics),
        "72h": positiveClusterCount(live72hMetrics),
      },
      suspicious_cluster_count: {
        "24h": suspiciousClusterCount(live24hMetrics),
        "72h": suspiciousClusterCount(live72hMetrics),
      },
      sensor_counts: {
        "24h": live24hProvider?.by_sensor || live24hProvider?.bySensor || [],
        "72h": live72hProvider?.by_sensor || live72hProvider?.bySensor || [],
      },
      query: {
        "24h": {
          requested_window_days: safeNumber(live24hProvider?.requested_window_days ?? live24hProvider?.requestedWindowDays, 1),
          stitched_query_used: Array.isArray(live24hProvider?.queryPlan?.stitchedQuerySegments) && live24hProvider.queryPlan.stitchedQuerySegments.length > 0,
          query_plan: live24hProvider?.queryPlan || null,
        },
        "72h": {
          requested_window_days: safeNumber(live72hProvider?.requested_window_days ?? live72hProvider?.requestedWindowDays, 3),
          stitched_query_used: Array.isArray(live72hProvider?.queryPlan?.stitchedQuerySegments) && live72hProvider.queryPlan.stitchedQuerySegments.length > 0,
          query_plan: live72hProvider?.queryPlan || null,
        },
      },
    },
  };

  await writeJson(path.join(args.uxRoot, "run6_24h_vs_live72h_diff.json"), diffPayload);
  await writeText(path.join(args.uxRoot, "72h_case_promotion_summary.md"), build72hPromotionSummaryMarkdown(diffPayload, uxSummary, args.uxRoot));

  const preferredCandidates = [
    {
      ux_case_id: "wf_gold_regional_dense_24h",
      why: "Dense regional live case with the strongest raw-point and cluster visibility; best first AF_gold review candidate.",
    },
    {
      ux_case_id: "wf_gold_local_single_24h",
      why: "Small-AOI case that tests whether a sparse but coherent local fire can still support AF_gold review.",
    },
    {
      ux_case_id: "wf_gold_recovered_query_expansion",
      why: "Useful edge candidate because it is real and explainable, but the bounded recovery path may weaken AF_gold confidence.",
    },
    {
      ux_case_id: "wf_gold_extra_positive",
      why: "Cross-region canary that broadens geographic coverage, but currently better suited as backup candidate than primary AF_gold pick.",
    },
  ];

  const caseManifestEntries = Array.isArray(caseManifest?.cases) ? caseManifest.cases : [];
  const rankedCandidates = [];

  for (let index = 0; index < preferredCandidates.length; index += 1) {
    const config = preferredCandidates[index];
    const caseView = caseManifestEntries.find((entry) => entry.id === config.ux_case_id);
    if (!caseView) {
      continue;
    }

    const caseSummary = await readJson(path.join(args.uxRoot, "per_case", caseView.id, "ux_case_summary.json"));
    const counts = summarizeCounts(caseSummary);
    const priority = index + 1;
    const status = priority === 1 ? "AF_gold_review_pending" : "candidate_ready";
    const packetDir = casePacketDirectory(args.uxRoot, caseView.id);

    await maybeCopyFile(
      path.join(args.uxRoot, "per_case", caseView.id, "map_view.png"),
      path.join(packetDir, "raw_official_evidence_snapshot.png")
    );
    await maybeCopyFile(
      path.join(args.uxRoot, "per_case", caseView.id, "popup_or_detail_panel.png"),
      path.join(packetDir, "detail_panel_snapshot.png")
    );
    await maybeCopyFile(
      path.join(args.uxRoot, "per_case", caseView.id, "map_view.png"),
      path.join(packetDir, "cluster_snapshot.png")
    );
    await maybeCopyFile(
      path.join(args.uxRoot, "per_case", caseView.id, "full_page.png"),
      path.join(packetDir, "full_page.png")
    );

    await writeText(path.join(packetDir, "af_gold_candidate_brief.md"), buildCandidateBrief(caseView, counts, priority, status));
    await writeText(path.join(packetDir, "why_candidate_is_strong_or_not.md"), buildStrengthNote(caseView, counts, config.why));
    await writeText(path.join(packetDir, "required_human_review_questions.md"), buildRequiredQuestions(caseView));
    await writeText(path.join(packetDir, "time_semantics_note.md"), buildTimeSemanticsNote(caseView, caseSummary));
    await writeText(path.join(packetDir, "reviewer_decision_template.md"), buildDecisionTemplate(caseView));
    await writeText(path.join(packetDir, "one_page_case_summary.md"), buildOnePageSummary(caseView, packetDir, args.uxRoot));

    rankedCandidates.push({
      ux_case_id: caseView.id,
      source_type: caseView.source_type,
      case_type: caseView.case_type,
      priority,
      status,
      rawCount: counts.rawCount,
      positiveClusterCount: counts.positiveClusterCount,
      suspiciousClusterCount: counts.suspiciousClusterCount,
      fallbackClusterCount: counts.fallbackClusterCount,
      why: config.why,
    });
  }

  await writeJson(path.join(args.uxRoot, "af_gold_candidate_ranking.json"), rankedCandidates);

  const reviewerInputDir = path.join(args.uxRoot, "reviewer_inputs");
  await fs.mkdir(reviewerInputDir, { recursive: true });
  const reviewerInputEntries = await fs.readdir(reviewerInputDir, { withFileTypes: true }).catch(() => []);
  const reviewerInputFiles = reviewerInputEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name);

  await writeText(
    path.join(reviewerInputDir, "README.md"),
    "# Reviewer Inputs\n\nPlace one completed reviewer CSV per reviewer in this directory, then run importReviewerScores.mjs followed by aggregateReviewerResults.mjs.\n"
  );
  await writeText(path.join(args.uxRoot, "af_gold_review_status.md"), buildAfGoldStatusMarkdown(rankedCandidates, reviewerInputFiles.length));
  await writeText(path.join(args.uxRoot, "review_pipeline_status.md"), buildReviewPipelineStatusMarkdown({ inputDir: reviewerInputDir, inputFiles: reviewerInputFiles }));

  process.stdout.write(
    `${JSON.stringify(
      {
        uxRoot: args.uxRoot,
        baselineSummaryPath,
        promoted72hCase: "indochina-hotspot-apr03-2026-72h-live",
        afGoldCandidateCount: rankedCandidates.length,
        reviewPipelineStatus: reviewerInputFiles.length >= 3 ? "executed" : reviewerInputFiles.length > 0 ? "in progress" : "ready",
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error?.message || error)}\n`);
  process.exitCode = 1;
});
