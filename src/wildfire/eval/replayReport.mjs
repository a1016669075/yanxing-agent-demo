function extentFromBBox(bbox = []) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return { west: 0, south: 0, east: 1, north: 1 };
  }
  return {
    west: Number(bbox[0]),
    south: Number(bbox[1]),
    east: Number(bbox[2]),
    north: Number(bbox[3]),
  };
}

function toSvgPoint(lon, lat, bbox = [], width = 320, height = 220) {
  const extent = extentFromBBox(bbox);
  const xSpan = Math.max(1e-6, extent.east - extent.west);
  const ySpan = Math.max(1e-6, extent.north - extent.south);
  const x = ((Number(lon) - extent.west) / xSpan) * width;
  const y = height - ((Number(lat) - extent.south) / ySpan) * height;
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderPill(label = "", tone = "neutral") {
  return `<span class="pill pill-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function displayCaseSemantics(caseResult = {}) {
  const value = caseResult?.case_semantics || caseResult?.overlay?.caseSemantics || caseResult?.case_type || "unknown";
  const tone =
    value === "AF_gold"
      ? "positive"
      : value === "AF_canary"
        ? "raw"
        : value === "BA_canary"
          ? "fallback"
          : value === "trap"
            ? "suspicious"
            : value === "empty"
              ? "empty"
              : "neutral";
  return {
    label: `Case semantics: ${value}`,
    tone,
  };
}

function displayReplayState(caseResult = {}) {
  const summary = caseResult?.overlay?.summary || {};
  const status = caseResult?.overlay?.status || "unknown";
  if ((summary.positiveClusterCount || 0) > 0 || status === "positive") {
    return { label: "Official positive cluster", tone: "positive" };
  }
  if ((summary.suspiciousClusterCount || 0) > 0 || (summary.needsReviewCount || 0) > 0 || status === "needs-review") {
    return { label: "Suspicious cluster", tone: "suspicious" };
  }
  if ((summary.fallbackClusterCount || 0) > 0 || status === "fallback") {
    return { label: "Fallback thermal cluster", tone: "fallback" };
  }
  if ((summary.rawPointCount || 0) > 0) {
    return { label: "Raw official points only", tone: "raw" };
  }
  return { label: "Empty", tone: "empty" };
}

function renderEligibility(caseResult = {}) {
  const reviewed = Boolean(caseResult?.counts_for_reviewed_af_recall ?? caseResult?.overlay?.metricEligibility?.reviewed_af_recall);
  const canary = Boolean(caseResult?.counts_for_af_canary_hit_rate ?? caseResult?.overlay?.metricEligibility?.af_canary_hit_rate);
  return [
    renderPill(`Reviewed AF recall: ${reviewed ? "included" : "excluded"}`, reviewed ? "positive" : "neutral"),
    renderPill(`AF canary hit-rate: ${canary ? "included" : "excluded"}`, canary ? "raw" : "neutral"),
  ].join("");
}

function renderRawMap(caseResult = {}) {
  const bbox = caseResult?.overlay?.bbox || caseResult?.overlay?.queryPlan?.bbox || [];
  const points = Array.isArray(caseResult?.overlay?.rawDetections) ? caseResult.overlay.rawDetections : [];
  const circles = points
    .slice(0, 200)
    .map((point) => {
      const position = toSvgPoint(point.lon, point.lat, bbox);
      const color =
        point?.sensor?.includes("NOAA21") ? "#c2410c" : point?.sensor?.includes("NOAA20") ? "#0f766e" : "#1d4ed8";
      return `<circle cx="${position.x.toFixed(1)}" cy="${position.y.toFixed(1)}" r="3.2" fill="${color}" fill-opacity="0.78"><title>${escapeHtml(
        `${point.sensor} ${point.acquisition_start_utc || ""}`
      )}</title></circle>`;
    })
    .join("");
  return `<svg viewBox="0 0 320 220" class="map"><rect x="0" y="0" width="320" height="220" rx="10" fill="#f6f6ef" stroke="#d6d3c9"/>${circles}</svg>`;
}

function renderClusterMap(caseResult = {}) {
  const bbox = caseResult?.overlay?.bbox || [];
  const clusters = Array.isArray(caseResult?.overlay?.clusters) ? caseResult.overlay.clusters : [];
  const circles = clusters
    .slice(0, 50)
    .map((cluster) => {
      const position = toSvgPoint(cluster.lon, cluster.lat, bbox);
      const radius = Math.max(5, Math.min(22, 4 + (Number(cluster.pointCount) || 0) * 1.8));
      const palette =
        cluster?.status === "needs-review"
          ? { stroke: "#b45309", fill: "rgba(245, 158, 11, 0.18)", label: "#7c2d12" }
          : cluster?.status === "fallback"
            ? { stroke: "#0f766e", fill: "rgba(15, 118, 110, 0.16)", label: "#115e59" }
            : { stroke: "#991b1b", fill: "rgba(220, 38, 38, 0.18)", label: "#7f1d1d" };
      return `<g><circle cx="${position.x.toFixed(1)}" cy="${position.y.toFixed(1)}" r="${radius.toFixed(
        1
      )}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="2"></circle><text x="${position.x.toFixed(1)}" y="${(
        position.y - radius - 4
      ).toFixed(1)}" text-anchor="middle" class="cluster-label" fill="${palette.label}">${escapeHtml(
        `${cluster.pointCount || 0}pt / ${Number(cluster.eventScore || 0).toFixed(2)}`
      )}</text></g>`;
    })
    .join("");
  return `<svg viewBox="0 0 320 220" class="map"><rect x="0" y="0" width="320" height="220" rx="10" fill="#fff7ed" stroke="#fed7aa"/>${circles}</svg>`;
}

function renderCaseCard(caseResult = {}) {
  const comparison = caseResult?.overlay?.beforeAfterClusterComparison || {};
  const staticReport = caseResult?.staticSourceReport || {};
  const semantics = displayCaseSemantics(caseResult);
  const replayState = displayReplayState(caseResult);
  return `
    <section class="case-card">
      <h2>${escapeHtml(caseResult.label)}</h2>
      <p class="meta">${escapeHtml(caseResult.case_type)} | ${escapeHtml(caseResult.time_semantics)} | status: ${escapeHtml(
        caseResult?.overlay?.status || "unknown"
      )}</p>
      <div class="pill-row">${renderPill(semantics.label, semantics.tone)}${renderPill(replayState.label, replayState.tone)}${renderEligibility(
        caseResult
      )}</div>
      <div class="maps">
        <div>
          <h3>Raw Official Points</h3>
          ${renderRawMap(caseResult)}
        </div>
        <div>
          <h3>Hotspot Clusters</h3>
          ${renderClusterMap(caseResult)}
        </div>
      </div>
      <div class="grid">
        <div><strong>Raw official points</strong><span>${caseResult?.overlay?.summary?.rawPointCount || 0}</span></div>
        <div><strong>Official positive clusters</strong><span>${caseResult?.overlay?.summary?.positiveClusterCount || 0}</span></div>
        <div><strong>Suspicious clusters</strong><span>${caseResult?.overlay?.summary?.suspiciousClusterCount || staticReport.suspiciousClusterCount || 0}</span></div>
        <div><strong>Fallback thermal clusters</strong><span>${caseResult?.overlay?.summary?.fallbackClusterCount || 0}</span></div>
        <div><strong>Legacy clusters</strong><span>${comparison.legacyClusterCount || 0}</span></div>
        <div><strong>New clusters</strong><span>${comparison.newClusterCount || 0}</span></div>
      </div>
      <p class="small">${escapeHtml(staticReport.scoreReductionExplanation || "")}</p>
    </section>
  `;
}

export function renderReplayReportHtml({ title = "Wildfire Replay Report", metadata = {}, aggregateMetrics = {}, caseResults = [] } = {}) {
  const cards = (Array.isArray(caseResults) ? caseResults : []).map((entry) => renderCaseCard(entry)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 24px; background: #fbfaf7; color: #1f2937; }
    h1, h2, h3 { margin: 0 0 8px; }
    .top { margin-bottom: 20px; padding: 18px; border: 1px solid #d6d3d1; border-radius: 14px; background: white; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 14px; }
    .summary div, .grid div { border: 1px solid #e7e5e4; border-radius: 10px; padding: 10px 12px; background: #fff; display: flex; justify-content: space-between; gap: 12px; }
    .case-card { margin-top: 18px; padding: 18px; border: 1px solid #e7e5e4; border-radius: 14px; background: #fff; }
    .maps { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin: 14px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
    .pill-row, .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 12px; border: 1px solid transparent; }
    .pill-positive { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
    .pill-suspicious { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
    .pill-fallback { background: #ecfeff; border-color: #99f6e4; color: #115e59; }
    .pill-raw { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
    .pill-empty, .pill-neutral { background: #f5f5f4; border-color: #d6d3d1; color: #57534e; }
    .map { width: 100%; height: auto; }
    .cluster-label { font-size: 10px; }
    .meta, .small { color: #57534e; }
    .small { font-size: 13px; margin-top: 12px; }
    ul { margin: 6px 0 0 18px; }
  </style>
</head>
<body>
  <section class="top">
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">git: ${escapeHtml(metadata.git_branch || "unknown")} @ ${escapeHtml(metadata.git_sha || "unknown")} | dirty: ${escapeHtml(
      String(Boolean(metadata.worktree_dirty))
    )} | manifest: ${escapeHtml(metadata.case_manifest_version || "unknown")} | runner: ${escapeHtml(
      metadata.runner_version || "unknown"
    )} | ts: ${escapeHtml(metadata.timestamp_utc || "unknown")}</p>
    <div class="legend">
      ${renderPill("Official positive cluster = confirmation-oriented evidence", "positive")}
      ${renderPill("Suspicious cluster = needs review", "suspicious")}
      ${renderPill("Fallback thermal cluster = assistive only", "fallback")}
      ${renderPill("Raw official points = preserved FIRMS evidence", "raw")}
    </div>
    <div class="summary">
      <div><strong>Provider parity</strong><span>${aggregateMetrics.provider_count_parity ?? "n/a"}</span></div>
      <div><strong>Time histogram parity</strong><span>${aggregateMetrics.time_histogram_parity ?? "n/a"}</span></div>
      <div><strong>AF canary hit</strong><span>${aggregateMetrics.af_canary_hit_rate ?? "n/a"}</span></div>
      <div><strong>Reviewed AF recall</strong><span>${aggregateMetrics.reviewed_af_event_recall ?? "n/a"}</span></div>
      <div><strong>Cluster purity</strong><span>${aggregateMetrics.cluster_purity ?? "n/a"}</span></div>
      <div><strong>Empty specificity</strong><span>${aggregateMetrics.empty_case_specificity ?? aggregateMetrics.empty_scene_specificity ?? "n/a"}</span></div>
      <div><strong>Trap rejection</strong><span>${aggregateMetrics.trap_rejection_rate ?? "n/a"}</span></div>
      <div><strong>Static FP rate</strong><span>${aggregateMetrics.static_source_false_positive_rate ?? "n/a"}</span></div>
      <div><strong>Median cluster span</strong><span>${aggregateMetrics.median_cluster_time_span ?? "n/a"}</span></div>
      <div><strong>Median latency</strong><span>${aggregateMetrics.median_latency ?? "n/a"}</span></div>
    </div>
  </section>
  ${cards}
</body>
</html>`;
}
