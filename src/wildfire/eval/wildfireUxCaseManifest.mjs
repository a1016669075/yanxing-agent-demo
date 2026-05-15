export const wildfireUxBundleIds = [
  "showcase_gold",
  "honesty_gallery",
  "temporal_semantics_gallery",
  "user_tasks",
];

export const wildfireUxSourceTypes = ["live_official", "archive_official", "fixture_demo"];

export const wildfireUxCaseTypes = [
  "AF_gold",
  "AF_canary",
  "BA_canary",
  "empty",
  "trap",
  "fallback",
  "temporal_semantics",
];

export const wildfireUxCaseManifestVersion = "2026-04-13-ux-validation-v2";

const defaultScreenshotTargets = [
  "full_page.png",
  "map_view.png",
  "popup_or_detail_panel.png",
  "legend_or_layer_state.png",
];

function normalizeBundle(value = "") {
  const normalized = String(value || "").trim();
  return wildfireUxBundleIds.includes(normalized) ? normalized : "showcase_gold";
}

function normalizeSourceType(value = "") {
  const normalized = String(value || "").trim();
  return wildfireUxSourceTypes.includes(normalized) ? normalized : "fixture_demo";
}

function normalizeCaseType(value = "") {
  const normalized = String(value || "").trim();
  return wildfireUxCaseTypes.includes(normalized) ? normalized : "temporal_semantics";
}

function normalizeStringArray(value = []) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function normalizePanels(value = []) {
  return (Array.isArray(value) ? value : []).map((panel, index) => ({
    id: String(panel?.id || `panel-${index + 1}`),
    kind: String(panel?.kind || "fixture"),
    label: String(panel?.label || `Panel ${index + 1}`),
    note: String(panel?.note || ""),
    live_case_id: panel?.live_case_id ? String(panel.live_case_id) : null,
    base_case_id: panel?.base_case_id ? String(panel.base_case_id) : null,
    fixture_kind: panel?.fixture_kind ? String(panel.fixture_kind) : null,
  }));
}

function createUxCaseDefinition(definition = {}) {
  return {
    id: String(definition.id || "").trim(),
    label: String(definition.label || definition.id || "").trim(),
    bundle: normalizeBundle(definition.bundle),
    source_type: normalizeSourceType(definition.source_type),
    case_type: normalizeCaseType(definition.case_type),
    ux_goal: String(definition.ux_goal || "").trim(),
    user_story: String(definition.user_story || "").trim(),
    user_actions: normalizeStringArray(definition.user_actions),
    expected_frontend:
      definition.expected_frontend && typeof definition.expected_frontend === "object" && !Array.isArray(definition.expected_frontend)
        ? definition.expected_frontend
        : {},
    pass_rules: normalizeStringArray(definition.pass_rules),
    failure_bucket: normalizeStringArray(definition.failure_bucket),
    screenshot_targets: normalizeStringArray(definition.screenshot_targets).length
      ? normalizeStringArray(definition.screenshot_targets)
      : defaultScreenshotTargets.slice(),
    metrics_to_check: normalizeStringArray(definition.metrics_to_check),
    whether_counts_for_live_metrics: Boolean(definition.whether_counts_for_live_metrics),
    panels: normalizePanels(definition.panels),
    source_badge: definition.source_badge ? String(definition.source_badge).trim() : "",
    review_state: definition.review_state ? String(definition.review_state).trim() : "",
    task_prompt: String(definition.task_prompt || "").trim(),
    expected_answer:
      definition.expected_answer && typeof definition.expected_answer === "object" && !Array.isArray(definition.expected_answer)
        ? definition.expected_answer
        : null,
    notes: normalizeStringArray(definition.notes),
  };
}

const defaultWildfireUxCases = [
  {
    id: "wf_gold_regional_dense_24h",
    label: "Showcase Gold: Regional Dense 24h",
    bundle: "showcase_gold",
    source_type: "live_official",
    case_type: "AF_canary",
    ux_goal: "Let a first-time viewer instantly see that wildfire can surface dense official points and coherent hotspot clusters in a large AOI.",
    user_story: "As a showcase viewer, I want one case where the wildfire layer looks obviously alive without requiring narration.",
    user_actions: ["Open the case page", "Look at raw official points", "Look at hotspot clusters"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["raw official points", "hotspot clusters", "legacy vs new comparison", "time semantics"],
      must_not_imply: ["burned area perimeter"],
    },
    pass_rules: [
      "Raw official points are immediately visible.",
      "Hotspot clusters are visually stronger than fallback or preview layers.",
      "The detail panel shows acquisition time, sensor mix, temporal span, and event score.",
    ],
    failure_bucket: ["visibility_gap", "semantic_blur"],
    metrics_to_check: [
      "raw_points_visible_rate",
      "hotspot_clusters_visible_rate",
      "popup_field_completeness_rate",
      "status_badge_visibility_rate",
    ],
    whether_counts_for_live_metrics: true,
    review_state: "AF_gold_review_pending",
    panels: [{ id: "main", kind: "live_case", label: "24h live official replay", live_case_id: "indochina-hotspot-apr03-2026" }],
    notes: ["AF_gold review pending: packet prepared, awaiting real human reviewer decision."],
  },
  {
    id: "wf_gold_regional_dense_72h",
    label: "Showcase Gold: Regional Dense 72h",
    bundle: "showcase_gold",
    source_type: "live_official",
    case_type: "AF_canary",
    ux_goal: "Show a real live-official 72h wildfire view so the user can compare broader time context without relying on a fixture.",
    user_story: "As a viewer, I want to understand how 24h and 72h views differ using real live official evidence rather than a synthetic demo.",
    user_actions: ["Open the case page", "Compare the 72h live label", "Read the real query-plan note"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["live_official_72h badge", "real raw official points", "real hotspot clusters", "time explanation"],
      must_not_imply: ["reviewed AF gold coverage for 72h"],
    },
    pass_rules: [
      "The page clearly marks this as live_official_72h.",
      "The case is backed by real raw official points and a real 72h live replay artifact.",
      "The detail panel keeps the case outside reviewed AF-gold claims.",
    ],
    failure_bucket: ["72h_live_visibility_gap", "temporal_ambiguity"],
    metrics_to_check: ["time_semantics_visibility_rate", "layer_hierarchy_readability_rate"],
    whether_counts_for_live_metrics: false,
    source_badge: "live_official_72h",
    panels: [{ id: "live72h", kind: "live_case", label: "72h live official replay", live_case_id: "indochina-hotspot-apr03-2026-72h-live" }],
    notes: ["Real 72h live-official case replacing the previous fixture/demo regional 72h view."],
  },
  {
    id: "wf_gold_local_single_24h",
    label: "Showcase Gold: Local Single Cluster 24h",
    bundle: "showcase_gold",
    source_type: "live_official",
    case_type: "AF_canary",
    ux_goal: "Show that a local case with only a few official points can still form a believable cluster.",
    user_story: "As a user looking at a small named fire, I want the interface to stay confident and readable even when point counts are low.",
    user_actions: ["Open the case page", "Check the cluster popup fields", "Read the time labels"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["point count", "event score", "temporal span", "acquisition time"],
      must_not_imply: ["reviewed AF gold truth"],
    },
    pass_rules: [
      "A single cluster is visible without zooming.",
      "The detail panel clearly exposes acquisition time and sensor/source.",
      "The case remains labeled canary rather than gold.",
    ],
    failure_bucket: ["small_aoi_readability", "optimistic_truth_label"],
    metrics_to_check: [
      "hotspot_clusters_visible_rate",
      "popup_field_completeness_rate",
      "confirm_fire_task_proxy_pass",
    ],
    whether_counts_for_live_metrics: true,
    panels: [{ id: "main", kind: "live_case", label: "24h live official replay", live_case_id: "crown-fire-acton-apr03-2026" }],
  },
  {
    id: "wf_gold_recovered_query_expansion",
    label: "Showcase Gold: Recovered by Bounded Query Expansion",
    bundle: "showcase_gold",
    source_type: "live_official",
    case_type: "AF_canary",
    ux_goal: "Make the bounded query-recovery story visible without hiding that it required a controlled audit path.",
    user_story: "As a reviewer, I want to see that recovery came from a small, explainable query expansion rather than an unbounded search.",
    user_actions: ["Open the case page", "Look for the query expansion note", "Check raw points and clusters"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["query expansion note", "raw official points", "hotspot clusters"],
      must_not_imply: ["unbounded search"],
    },
    pass_rules: [
      "The page explicitly says the case was recovered after a limited bbox expansion audit.",
      "The page keeps the original 24h anchor semantics visible.",
      "The page still distinguishes raw official evidence from cluster interpretation.",
    ],
    failure_bucket: ["query_policy_opacity", "semantic_blur"],
    metrics_to_check: [
      "raw_points_visible_rate",
      "time_semantics_visibility_rate",
      "popup_field_completeness_rate",
    ],
    whether_counts_for_live_metrics: true,
    panels: [{ id: "main", kind: "live_case", label: "Recovered live official replay", live_case_id: "springs-fire-moreno-valley-apr08-2026" }],
  },
  {
    id: "wf_gold_extra_positive",
    label: "Showcase Gold: Extra Positive Cross-Region",
    bundle: "showcase_gold",
    source_type: "live_official",
    case_type: "AF_canary",
    ux_goal: "Show that the current wildfire demo is not visually tied to one geography only.",
    user_story: "As a reviewer, I want one additional cross-region hit so the showcase does not feel geographically overfit.",
    user_actions: ["Open the case page", "Check raw points and clusters", "Read the canary label"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["cross-region positive example", "raw points", "clusters"],
      must_not_imply: ["reviewed AF recall inclusion"],
    },
    pass_rules: [
      "The case is clearly labeled as extra canary rather than gold truth.",
      "The page still shows official points and cluster outputs.",
    ],
    failure_bucket: ["overfitted_showcase", "optimistic_truth_label"],
    metrics_to_check: ["raw_points_visible_rate", "hotspot_clusters_visible_rate"],
    whether_counts_for_live_metrics: false,
    panels: [{ id: "main", kind: "live_case", label: "Cross-region live official replay", live_case_id: "lirquen-chile-jan20-2026" }],
  },
  {
    id: "wf_gold_refine_preview_if_available",
    label: "Showcase Gold: Refine Preview Semantics",
    bundle: "showcase_gold",
    source_type: "fixture_demo",
    case_type: "temporal_semantics",
    ux_goal: "Show how a future local refine preview can coexist with official active-fire evidence without being mistaken for executed burn-scar output.",
    user_story: "As a viewer, I want preview layers to be understandable and obviously secondary.",
    user_actions: ["Open the case page", "Inspect the preview badge", "Compare it to the positive cluster badge"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["preview badge", "post-event/context note", "official evidence remains primary"],
      must_not_imply: ["executed burn scar", "confirmed perimeter"],
    },
    pass_rules: [
      "Preview is visibly secondary to official clusters.",
      "The page says preview is post-event/context only.",
      "The page never labels preview as executed output.",
    ],
    failure_bucket: ["preview_overclaim", "semantic_blur"],
    metrics_to_check: [
      "layer_hierarchy_readability_rate",
      "positive_vs_fallback_confusion_risk",
      "active_fire_vs_burned_area_confusion_risk",
    ],
    whether_counts_for_live_metrics: false,
    panels: [
      {
        id: "preview",
        kind: "fixture",
        label: "Preview demo layered on live case",
        base_case_id: "crown-fire-acton-apr03-2026",
        fixture_kind: "refine_preview_demo",
      },
    ],
    notes: ["Fixture/demo-only until a real refine preview artifact exists."],
  },
  {
    id: "wf_honesty_empty_ocean",
    label: "Honesty: Empty Ocean",
    bundle: "honesty_gallery",
    source_type: "live_official",
    case_type: "empty",
    ux_goal: "Prove that an empty scene stays empty in the UI instead of being filled with narrative.",
    user_story: "As a skeptical user, I want to see at least one truly quiet scene where the system simply says there is no confirmed active fire.",
    user_actions: ["Open the case page", "Look for any positive or suspicious badges", "Read the empty wording"],
    expected_frontend: {
      primary_status: "empty",
      must_show: ["empty badge", "no raw points", "no positive cluster"],
      must_not_imply: ["fallback as confirmation"],
    },
    pass_rules: [
      "The page shows an explicit empty state.",
      "The page has no positive cluster badge.",
      "The layer legend still appears so the user sees what is absent.",
    ],
    failure_bucket: ["false_positive_visualization", "empty_state_ambiguity"],
    metrics_to_check: ["status_badge_visibility_rate", "empty_case_specificity"],
    whether_counts_for_live_metrics: true,
    panels: [{ id: "main", kind: "live_case", label: "Live empty scene", live_case_id: "central-pacific-empty-apr2026" }],
  },
  {
    id: "wf_honesty_empty_ice",
    label: "Honesty: Empty Ice",
    bundle: "honesty_gallery",
    source_type: "live_official",
    case_type: "empty",
    ux_goal: "Show a second empty scene with a very different geography so emptiness does not look fragile.",
    user_story: "As a reviewer, I want confidence that the wildfire UI does not only avoid false positives over water.",
    user_actions: ["Open the case page", "Check empty badge", "Check raw/cluster counts"],
    expected_frontend: {
      primary_status: "empty",
      must_show: ["empty badge", "zero cluster count", "zero raw official points"],
      must_not_imply: ["hidden fallback evidence"],
    },
    pass_rules: ["The page clearly stays empty.", "Counts and badges agree with one another."],
    failure_bucket: ["false_positive_visualization", "count_badge_mismatch"],
    metrics_to_check: ["status_badge_visibility_rate", "empty_case_specificity"],
    whether_counts_for_live_metrics: true,
    panels: [{ id: "main", kind: "live_case", label: "Live empty scene", live_case_id: "greenland-ice-empty-apr2026" }],
  },
  {
    id: "wf_honesty_static_trap",
    label: "Honesty: Static Source Trap",
    bundle: "honesty_gallery",
    source_type: "live_official",
    case_type: "trap",
    ux_goal: "Show that suspicious static heat is preserved as official evidence but not upgraded to confirmed wildfire.",
    user_story: "As a cautious user, I want to understand why the trap was not treated as a positive wildfire.",
    user_actions: ["Open the case page", "Look for suspicious badge", "Read the trap explanation"],
    expected_frontend: {
      primary_status: "suspicious",
      must_show: ["suspicious annotation", "raw official points preserved", "trap explanation"],
      must_not_imply: ["confirmed wildfire"],
    },
    pass_rules: [
      "The page does not show a positive wildfire badge.",
      "Suspicious regions or penalties are visible in the explanation.",
      "Raw official points remain visible for auditability.",
    ],
    failure_bucket: ["trap_overclaim", "suppression_opacity"],
    metrics_to_check: [
      "positive_vs_suspicious_confusion_risk",
      "trap_rejection_rate",
      "trap_explanation_task_proxy_pass",
    ],
    whether_counts_for_live_metrics: true,
    panels: [{ id: "main", kind: "live_case", label: "Live trap replay", live_case_id: "permian-basin-static-source-trap" }],
  },
  {
    id: "wf_honesty_fallback_only",
    label: "Honesty: Fallback Only",
    bundle: "honesty_gallery",
    source_type: "fixture_demo",
    case_type: "fallback",
    ux_goal: "Show a fallback-only outcome that is visibly useful but clearly non-confirmatory.",
    user_story: "As a user, I want fallback to feel informative without being mistaken for confirmed fire.",
    user_actions: ["Open the case page", "Look for fallback badge", "Read the wording"],
    expected_frontend: {
      primary_status: "fallback",
      must_show: ["fallback badge", "non-confirmatory wording"],
      must_not_imply: ["confirmed fire"],
    },
    pass_rules: [
      "Fallback is visually distinct from official positive clusters.",
      "The page explicitly says fallback is assistive only.",
    ],
    failure_bucket: ["fallback_confusion", "semantic_blur"],
    metrics_to_check: ["positive_vs_fallback_confusion_risk", "layer_hierarchy_readability_rate"],
    whether_counts_for_live_metrics: false,
    panels: [
      {
        id: "fallback-demo",
        kind: "fixture",
        label: "Fallback-only demo",
        base_case_id: "crown-fire-acton-apr03-2026",
        fixture_kind: "fallback_only_demo",
      },
    ],
  },
  {
    id: "wf_honesty_needs_review_low_evidence",
    label: "Honesty: Needs Review Low Evidence",
    bundle: "honesty_gallery",
    source_type: "fixture_demo",
    case_type: "temporal_semantics",
    ux_goal: "Show conservative wording when evidence is weak or temporally stretched.",
    user_story: "As a reviewer, I want one case that explicitly says needs review instead of forcing a yes/no narrative.",
    user_actions: ["Open the case page", "Find the needs-review badge", "Read why the case stayed conservative"],
    expected_frontend: {
      primary_status: "suspicious",
      must_show: ["needs-review wording", "weak evidence explanation"],
      must_not_imply: ["confirmed wildfire"],
    },
    pass_rules: [
      "The case is visibly conservative.",
      "The detail panel points to temporal span or low-support evidence as the reason.",
    ],
    failure_bucket: ["overclaim", "review_state_invisibility"],
    metrics_to_check: ["positive_vs_suspicious_confusion_risk", "status_badge_visibility_rate"],
    whether_counts_for_live_metrics: false,
    panels: [
      {
        id: "needs-review-demo",
        kind: "fixture",
        label: "Needs-review demo",
        base_case_id: "springs-fire-moreno-valley-apr08-2026",
        fixture_kind: "needs_review_low_evidence_demo",
      },
    ],
  },
  {
    id: "wf_honesty_official_vs_suspicious_side_by_side",
    label: "Honesty: Official vs Suspicious Side by Side",
    bundle: "honesty_gallery",
    source_type: "live_official",
    case_type: "temporal_semantics",
    ux_goal: "Make the difference between a real positive cluster and a suspicious trap visible in one glance.",
    user_story: "As a new user, I want a side-by-side explanation that teaches me what confirmed versus suspicious looks like.",
    user_actions: ["Open the case page", "Compare left and right badges", "Read the explanation cards"],
    expected_frontend: {
      primary_status: "comparison",
      must_show: ["positive side", "suspicious side", "different wording", "different colors"],
      must_not_imply: ["same confidence level"],
    },
    pass_rules: [
      "Positive and suspicious states are not visually interchangeable.",
      "The explanatory text explicitly contrasts them.",
    ],
    failure_bucket: ["state_confusion", "color_semantics_blur"],
    metrics_to_check: ["positive_vs_suspicious_confusion_risk", "layer_hierarchy_readability_rate"],
    whether_counts_for_live_metrics: false,
    panels: [
      { id: "official-positive", kind: "live_case", label: "Official positive example", live_case_id: "crown-fire-acton-apr03-2026" },
      { id: "suspicious-trap", kind: "live_case", label: "Suspicious trap example", live_case_id: "permian-basin-static-source-trap" },
    ],
  },
  {
    id: "wf_time_24h_vs_72h",
    label: "Temporal Semantics: 24h vs 72h",
    bundle: "temporal_semantics_gallery",
    source_type: "live_official",
    case_type: "temporal_semantics",
    ux_goal: "Make the time-window difference visually obvious using a real 24h live case and a real 72h live case from the same source incident.",
    user_story: "As a reviewer, I want to compare a real 24h case and a real 72h live-official case side by side.",
    user_actions: ["Open the case page", "Compare 24h and 72h labels", "Read the query-plan note"],
    expected_frontend: {
      primary_status: "comparison",
      must_show: ["24h live", "72h live_official", "window label", "query-plan note"],
      must_not_imply: ["reviewed AF gold truth from window expansion alone"],
    },
    pass_rules: [
      "The 24h side remains live official.",
      "The 72h side is also backed by live official evidence.",
      "The page explains the difference in requested window semantics without claiming AF-gold promotion.",
    ],
    failure_bucket: ["time_window_blur", "72h_live_comparison_gap"],
    metrics_to_check: ["time_semantics_visibility_rate", "layer_hierarchy_readability_rate"],
    whether_counts_for_live_metrics: false,
    source_badge: "live_official_24h_vs_72h",
    panels: [
      { id: "window-24h", kind: "live_case", label: "24h live official", live_case_id: "indochina-hotspot-apr03-2026" },
      { id: "window-72h", kind: "live_case", label: "72h live official", live_case_id: "indochina-hotspot-apr03-2026-72h-live" },
    ],
  },
  {
    id: "wf_time_same_day_not_same_time",
    label: "Temporal Semantics: Same Day Is Not Same Time",
    bundle: "temporal_semantics_gallery",
    source_type: "live_official",
    case_type: "temporal_semantics",
    ux_goal: "Make the gap between the scene anchor time and fire-point acquisition time impossible to miss.",
    user_story: "As a user, I should be able to tell that same day does not mean same overpass.",
    user_actions: ["Open the case page", "Read basemap time", "Read evidence time"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["basemap time", "acquisition time", "temporal-class note"],
      must_not_imply: ["same instant"],
    },
    pass_rules: [
      "Basemap/context time and fire acquisition time are displayed separately.",
      "The case explanation calls out same-day versus same-time explicitly.",
    ],
    failure_bucket: ["temporal_ambiguity", "time_label_missing"],
    metrics_to_check: [
      "time_semantics_visibility_rate",
      "time_semantics_task_proxy_pass",
      "clicks_to_time_explanation",
    ],
    whether_counts_for_live_metrics: false,
    panels: [{ id: "main", kind: "live_case", label: "Live official case with same-day offsets", live_case_id: "indochina-hotspot-apr03-2026" }],
  },
  {
    id: "wf_time_multi_sensor_agreement",
    label: "Temporal Semantics: Multi-Sensor Agreement",
    bundle: "temporal_semantics_gallery",
    source_type: "live_official",
    case_type: "temporal_semantics",
    ux_goal: "Show that a cluster can explain its sensor mix instead of hiding corroboration inside narrative text.",
    user_story: "As a user, I want to see which satellites agree and how close in time they were.",
    user_actions: ["Open the case page", "Read sensor mix", "Read temporal span"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["sensor mix", "temporal span", "event score"],
      must_not_imply: ["same-sensor only evidence"],
    },
    pass_rules: [
      "Sensor mix is visible in the detail panel.",
      "Temporal span and event score are visible without further clicks.",
    ],
    failure_bucket: ["sensor_mix_invisibility", "temporal_blur"],
    metrics_to_check: ["popup_field_completeness_rate", "time_semantics_visibility_rate"],
    whether_counts_for_live_metrics: false,
    panels: [{ id: "main", kind: "live_case", label: "Live multi-sensor case", live_case_id: "springs-fire-moreno-valley-apr08-2026" }],
  },
  {
    id: "wf_time_stitched_query_semantics",
    label: "Temporal Semantics: Stitched Query Semantics",
    bundle: "temporal_semantics_gallery",
    source_type: "fixture_demo",
    case_type: "temporal_semantics",
    ux_goal: "Show how a stitched 7d query should be explained in the UI before live 7d parity is claimed.",
    user_story: "As a reviewer, I want the user-facing explanation of stitched queries to exist before live 7d is marketed as done.",
    user_actions: ["Open the case page", "Read segment log", "Check the warning text"],
    expected_frontend: {
      primary_status: "fixture",
      must_show: ["stitched segment explanation", "fixture-demo badge", "segment timestamps"],
      must_not_imply: ["single homogeneous point cloud"],
    },
    pass_rules: [
      "The page clearly says stitched segments retain their own time ranges.",
      "The page stays out of live metrics.",
    ],
    failure_bucket: ["stitched_semantics_hidden", "fixture_leakage"],
    metrics_to_check: ["time_semantics_visibility_rate", "layer_hierarchy_readability_rate"],
    whether_counts_for_live_metrics: false,
    panels: [
      {
        id: "stitched-demo",
        kind: "fixture",
        label: "7d stitched semantics demo",
        base_case_id: "indochina-hotspot-apr03-2026",
        fixture_kind: "stitched_query_semantics_demo",
      },
    ],
  },
  {
    id: "wf_time_post_event_refine",
    label: "Temporal Semantics: Post-Event Refine",
    bundle: "temporal_semantics_gallery",
    source_type: "fixture_demo",
    case_type: "temporal_semantics",
    ux_goal: "Show that preview/refine layers are post-event context and do not participate in active-fire yes/no.",
    user_story: "As a user, I want refine to be helpful without becoming accidental wildfire confirmation.",
    user_actions: ["Open the case page", "Look for preview wording", "Compare it to official evidence"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["preview badge", "post-event context note", "official evidence remains primary"],
      must_not_imply: ["preview changes active-fire yes/no"],
    },
    pass_rules: [
      "Preview is subordinate to official evidence.",
      "The wording explicitly says it can only explain or refine, not detect.",
    ],
    failure_bucket: ["preview_overclaim", "temporal_role_blur"],
    metrics_to_check: ["layer_hierarchy_readability_rate", "time_semantics_visibility_rate"],
    whether_counts_for_live_metrics: false,
    panels: [
      {
        id: "post-event-preview",
        kind: "fixture",
        label: "Post-event refine demo",
        base_case_id: "crown-fire-acton-apr03-2026",
        fixture_kind: "post_event_refine_demo",
      },
    ],
  },
  {
    id: "wf_task_confirm_fire_10s",
    label: "User Task: Confirm Fire in 10 Seconds",
    bundle: "user_tasks",
    source_type: "live_official",
    case_type: "AF_canary",
    ux_goal: "Verify that a user can confirm official active fire quickly from the current wildfire stage-1 UI semantics.",
    user_story: "As a time-pressed user, I want to decide within 10 seconds whether there is confirmed active fire here.",
    user_actions: ["Open the case page", "Read the primary badge", "Glance at the cluster map"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["confirmed active-fire signal", "point count", "event score"],
      must_not_imply: ["burned area product"],
    },
    pass_rules: [
      "The primary positive signal is visible without scrolling.",
      "The page does not need narrative text to establish that official evidence exists.",
    ],
    failure_bucket: ["slow_first_signal", "semantic_blur"],
    metrics_to_check: [
      "confirm_fire_task_proxy_pass",
      "clicks_to_first_evidence",
      "time_to_first_signal_ms",
    ],
    whether_counts_for_live_metrics: false,
    panels: [{ id: "task-case", kind: "live_case", label: "Quick confirmation case", live_case_id: "crown-fire-acton-apr03-2026" }],
    task_prompt: "Within 10 seconds, answer whether this page shows confirmed active fire.",
    expected_answer: {
      confirmed_active_fire: true,
      evidence_class: "official_positive_cluster",
      confidence_reason: "raw official points plus positive hotspot cluster are both visible",
    },
  },
  {
    id: "wf_task_classify_evidence",
    label: "User Task: Classify Evidence",
    bundle: "user_tasks",
    source_type: "live_official",
    case_type: "temporal_semantics",
    ux_goal: "Verify that a user can distinguish official positive, suspicious, fallback, and preview semantics from the report-side UI.",
    user_story: "As a user, I want visual language that lets me classify evidence types instead of reading implementation details.",
    user_actions: ["Open the case page", "Compare the badges", "Read the legend"],
    expected_frontend: {
      primary_status: "comparison",
      must_show: ["official", "suspicious", "fallback", "preview"],
      must_not_imply: ["these states are interchangeable"],
    },
    pass_rules: [
      "Legend and badges jointly expose all four evidence classes.",
      "Positive remains visually dominant over suspicious, fallback, and preview.",
    ],
    failure_bucket: ["legend_failure", "state_confusion"],
    metrics_to_check: [
      "classify_evidence_task_proxy_pass",
      "positive_vs_fallback_confusion_risk",
      "positive_vs_suspicious_confusion_risk",
    ],
    whether_counts_for_live_metrics: false,
    panels: [
      { id: "positive-reference", kind: "live_case", label: "Official positive example", live_case_id: "crown-fire-acton-apr03-2026" },
      { id: "trap-reference", kind: "live_case", label: "Suspicious trap example", live_case_id: "permian-basin-static-source-trap" },
    ],
    task_prompt: "Classify what is official positive evidence, what is suspicious, what would count as fallback, and what is preview/context only.",
    expected_answer: {
      official_positive: "crown-fire-acton-apr03-2026",
      suspicious: "permian-basin-static-source-trap",
      fallback: "legend fallback example",
      preview: "legend preview example",
    },
  },
  {
    id: "wf_task_read_time_semantics",
    label: "User Task: Read Time Semantics",
    bundle: "user_tasks",
    source_type: "live_official",
    case_type: "temporal_semantics",
    ux_goal: "Verify that the page exposes evidence-level time semantics clearly enough for a user to answer timing questions without guesswork.",
    user_story: "As a user, I want to tell whether the basemap time and evidence time match.",
    user_actions: ["Open the case page", "Read both time fields", "Answer the prompt"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["basemap time", "evidence acquisition time", "temporal class note"],
      must_not_imply: ["same day equals same time"],
    },
    pass_rules: [
      "Basemap time and evidence time are visibly separate.",
      "The page can support the prompt answer without extra context.",
    ],
    failure_bucket: ["time_label_missing", "temporal_ambiguity"],
    metrics_to_check: [
      "time_semantics_task_proxy_pass",
      "clicks_to_time_explanation",
      "time_to_first_explanation_ms",
    ],
    whether_counts_for_live_metrics: false,
    panels: [{ id: "time-reading", kind: "live_case", label: "Time semantics case", live_case_id: "indochina-hotspot-apr03-2026" }],
    task_prompt: "Are the basemap/context time and the fire-point acquisition time the same moment?",
    expected_answer: {
      same_instant: false,
      explanation: "same day does not imply same overpass; acquisition time is listed separately from the basemap/context anchor",
    },
  },
  {
    id: "wf_task_explain_trap",
    label: "User Task: Explain Trap",
    bundle: "user_tasks",
    source_type: "live_official",
    case_type: "trap",
    ux_goal: "Verify that a user can explain why the trap did not become a confirmed wildfire case.",
    user_story: "As a user, I want the UI to teach me why suspicious static heat stays suspicious.",
    user_actions: ["Open the case page", "Read suspicious annotations", "Read the trap explanation"],
    expected_frontend: {
      primary_status: "suspicious",
      must_show: ["suspicious annotation", "raw points preserved", "explanation of suppression"],
      must_not_imply: ["confirmed active fire"],
    },
    pass_rules: [
      "The trap explanation is visible without developer tooling.",
      "The page provides enough language for a human reviewer to restate the reason.",
    ],
    failure_bucket: ["trap_explanation_missing", "trap_overclaim"],
    metrics_to_check: ["trap_explanation_task_proxy_pass", "positive_vs_suspicious_confusion_risk"],
    whether_counts_for_live_metrics: false,
    panels: [{ id: "trap-task", kind: "live_case", label: "Trap explanation case", live_case_id: "permian-basin-static-source-trap" }],
    task_prompt: "Explain why this case should not be read as confirmed wildfire.",
    expected_answer: {
      confirmed_active_fire: false,
      explanation: "official points are preserved, but suspicious static-source behavior prevents a positive wildfire interpretation",
    },
  },
  {
    id: "wf_task_active_fire_vs_burned_area",
    label: "User Task: Active Fire vs Burned Area",
    bundle: "user_tasks",
    source_type: "fixture_demo",
    case_type: "temporal_semantics",
    ux_goal: "Verify that the UI can explicitly teach the user that this stage shows active-fire evidence, not burned-area perimeter.",
    user_story: "As a user, I do not want sparse fire points to be mistaken for a continuous burn scar.",
    user_actions: ["Open the case page", "Read the active-fire note", "Check that no burn-scar perimeter is claimed"],
    expected_frontend: {
      primary_status: "positive",
      must_show: ["active-fire wording", "no burned-area claim", "preview/fallback distinction if shown"],
      must_not_imply: ["continuous fire perimeter", "executed burn scar"],
    },
    pass_rules: [
      "The case explicitly says active fire is not burned area.",
      "No visual element is labeled as a burned-area perimeter.",
    ],
    failure_bucket: ["ba_confusion", "semantic_overclaim"],
    metrics_to_check: [
      "active_fire_semantics_task_proxy_pass",
      "active_fire_vs_burned_area_confusion_risk",
    ],
    whether_counts_for_live_metrics: false,
    panels: [
      {
        id: "active-fire-semantics",
        kind: "fixture",
        label: "Active-fire semantics demo",
        base_case_id: "crown-fire-acton-apr03-2026",
        fixture_kind: "active_fire_vs_burned_area_demo",
      },
    ],
    task_prompt: "State whether this page is showing active-fire evidence or a burned-area perimeter.",
    expected_answer: {
      display_semantics: "active_fire",
      burned_area_perimeter_present: false,
    },
  },
];

export function buildWildfireUxCaseManifest(cases = defaultWildfireUxCases) {
  return (Array.isArray(cases) ? cases : defaultWildfireUxCases).map((entry) => createUxCaseDefinition(entry));
}
