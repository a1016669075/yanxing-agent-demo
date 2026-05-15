export const wildfireCaseTypes = ["AF_positive", "BA_positive", "empty", "static_trap", "fallback"];

export const wildfireTimeSemantics = ["live_nrt", "archive_sp", "ambiguous_news"];

export const wildfireSemanticLabels = ["AF_gold", "AF_canary", "BA_canary", "empty", "trap"];

export const wildfireCaseManifestVersion = "2026-04-13-eval-contract-v4";

const legacyCaseTypeMap = {
  AF_positive: "AF_positive",
  AF_negative: "empty",
  static_source_trap: "static_trap",
  BA_positive: "BA_positive",
  fallback_case: "fallback",
};

function normalizeCaseType(value, definition = {}) {
  const requested = String(value || definition.case_type || definition.type || "").trim();
  if (wildfireCaseTypes.includes(requested)) {
    return requested;
  }
  if (legacyCaseTypeMap[requested]) {
    return legacyCaseTypeMap[requested];
  }
  if (requested === "news_canary") {
    return definition.expectedPositive === false ? "fallback" : "AF_positive";
  }
  return definition.expectedPositive === false ? "empty" : "AF_positive";
}

function normalizeTimeSemantics(value, caseType = "AF_positive") {
  const requested = String(value || "").trim();
  if (wildfireTimeSemantics.includes(requested)) {
    return requested;
  }
  if (caseType === "BA_positive") {
    return "archive_sp";
  }
  return "live_nrt";
}

function normalizeAcceptableTimeOffset(value, timeSemantics = "live_nrt") {
  const defaultMaxAbsMin = timeSemantics === "archive_sp" ? 720 : 360;
  if (Number.isFinite(Number(value))) {
    return {
      max_abs_min: Number(value),
    };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const maxAbsMin = Number(value.max_abs_min ?? value.maxAbsMin ?? defaultMaxAbsMin);
    return {
      max_abs_min: Number.isFinite(maxAbsMin) ? maxAbsMin : defaultMaxAbsMin,
    };
  }
  return {
    max_abs_min: defaultMaxAbsMin,
  };
}

function normalizeExpectedOutcome(value, caseType = "AF_positive", timeSemantics = "live_nrt") {
  const defaultOutcome = (() => {
    if (caseType === "empty") {
      return {
        raw_points: "absent",
        cluster_state: "absent",
        scoring_role: "negative_gold",
      };
    }
    if (caseType === "static_trap") {
      return {
        raw_points: "allowed_or_sparse",
        cluster_state: "suspicious_or_suppressed",
        scoring_role: "trap_gold",
      };
    }
    if (caseType === "BA_positive") {
      return {
        raw_points: "present",
        cluster_state: "reviewed_positive",
        scoring_role: "positive_gold",
      };
    }
    if (caseType === "fallback") {
      return {
        raw_points: "optional",
        cluster_state: "fallback_only",
        scoring_role: "fallback_contract",
      };
    }
    return {
      raw_points: "present",
      cluster_state: "desired_but_not_gold",
      scoring_role: timeSemantics === "ambiguous_news" ? "canary_non_gold" : "candidate_non_gold",
    };
  })();

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...defaultOutcome,
      ...value,
    };
  }
  if (typeof value === "string" && value.trim()) {
    return {
      ...defaultOutcome,
      summary: value.trim(),
    };
  }
  return defaultOutcome;
}

function normalizePrimaryEvalMetric(value, caseType = "AF_positive") {
  const requested = String(value || "").trim();
  if (requested) {
    return requested;
  }
  if (caseType === "empty") {
    return "empty_scene_specificity";
  }
  if (caseType === "static_trap") {
    return "static_source_false_positive_rate";
  }
  if (caseType === "BA_positive") {
    return "event_recall";
  }
  if (caseType === "fallback") {
    return "fallback_rate";
  }
  return "provider_count_parity";
}

function normalizeSensorPriority(definition = {}) {
  const requested = Array.isArray(definition.sensor_priority)
    ? definition.sensor_priority
    : Array.isArray(definition.sensors)
      ? definition.sensors
      : [];
  return requested.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeSensorCoverage(definition = {}) {
  const requested = Array.isArray(definition.sensor_coverage)
    ? definition.sensor_coverage
    : Array.isArray(definition.sensor_priority)
      ? definition.sensor_priority
      : Array.isArray(definition.sensors)
        ? definition.sensors
        : [];
  return requested.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeCaseSemantics(value, caseType = "AF_positive", expectedOutcome = {}) {
  const requested = String(value || "").trim();
  if (wildfireSemanticLabels.includes(requested)) {
    return requested;
  }
  if (caseType === "empty") {
    return "empty";
  }
  if (caseType === "static_trap") {
    return "trap";
  }
  if (caseType === "BA_positive") {
    return "BA_canary";
  }
  if (expectedOutcome?.scoring_role === "positive_gold") {
    return "AF_gold";
  }
  return "AF_canary";
}

function normalizeQueryPolicy(definition = {}) {
  const requested =
    definition.query_policy && typeof definition.query_policy === "object" && !Array.isArray(definition.query_policy)
      ? definition.query_policy
      : definition.queryPolicy && typeof definition.queryPolicy === "object" && !Array.isArray(definition.queryPolicy)
        ? definition.queryPolicy
        : null;

  const legacyDefaultScale = Number(definition.query_bbox_scale);
  const requestedDefaultScale = Number(requested?.default_bbox_scale ?? requested?.defaultBBoxScale);
  const defaultBBoxScale =
    Number.isFinite(requestedDefaultScale) && requestedDefaultScale > 0
      ? requestedDefaultScale
      : Number.isFinite(legacyDefaultScale) && legacyDefaultScale > 0
        ? legacyDefaultScale
        : 1;

  const auditRequested =
    requested?.raw_count_zero_audit && typeof requested.raw_count_zero_audit === "object"
      ? requested.raw_count_zero_audit
      : requested?.rawCountZeroAudit && typeof requested.rawCountZeroAudit === "object"
        ? requested.rawCountZeroAudit
        : null;

  if (!auditRequested) {
    return {
      default_bbox_scale: defaultBBoxScale,
      raw_count_zero_audit: null,
    };
  }

  const enabled = Boolean(auditRequested.enabled);
  if (!enabled) {
    return {
      default_bbox_scale: defaultBBoxScale,
      raw_count_zero_audit: null,
    };
  }

  const auditScale = Number(auditRequested.bbox_scale ?? auditRequested.bboxScale);
  const maxAttempts = Number(auditRequested.max_attempts ?? auditRequested.maxAttempts);

  return {
    default_bbox_scale: defaultBBoxScale,
    raw_count_zero_audit: {
      enabled: true,
      bbox_scale: Number.isFinite(auditScale) && auditScale > 0 ? auditScale : Math.max(1.5, defaultBBoxScale),
      max_attempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : 1,
      scope: String(auditRequested.scope || "case_local_only"),
      trigger: String(auditRequested.trigger || "raw_count_zero"),
      allowed_window_days: Number(auditRequested.allowed_window_days ?? auditRequested.allowedWindowDays) || null,
      keep_original_anchor: auditRequested.keep_original_anchor !== false,
    },
  };
}

function deriveReviewedAfRecallEligibility(caseSemantics = "AF_canary", expectedOutcome = {}) {
  return caseSemantics === "AF_gold" && expectedOutcome?.scoring_role === "positive_gold";
}

function deriveAfCanaryEligibility(caseSemantics = "AF_canary", reportGroup = "") {
  return caseSemantics === "AF_canary" && reportGroup === "primary_live_canary";
}

function normalizeArchiveSources(entries = []) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    id: String(entry.id || `archive-source-${index + 1}`),
    label: String(entry.label || entry.id || `Archive source ${index + 1}`),
    path: String(entry.path || ""),
    format: String(entry.format || "").trim().toLowerCase(),
    sensor: String(entry.sensor || entry.product || ""),
    product: String(entry.product || entry.sensor || ""),
    date: entry.date || null,
    apiDayRange: Number(entry.apiDayRange ?? entry.api_day_range ?? entry.requestedWindowDays ?? entry.requested_window_days ?? 1) || 1,
    requestedWindowDays:
      Number(entry.requestedWindowDays ?? entry.requested_window_days ?? entry.apiDayRange ?? entry.api_day_range ?? 1) || 1,
  }));
}

function defaultValidationStatus(caseType = "AF_positive", timeSemantics = "live_nrt") {
  if (timeSemantics === "archive_sp") {
    return "pending_archive_bundle";
  }
  if (timeSemantics === "ambiguous_news") {
    return "pending_canary_replay";
  }
  if (caseType === "empty") {
    return "pending_empty_replay";
  }
  if (caseType === "static_trap") {
    return "pending_trap_replay";
  }
  return "pending_live_parity";
}

function deriveExpectedPositive(definition = {}, caseType = "AF_positive", expectedOutcome = {}) {
  if (typeof definition.expectedPositive === "boolean") {
    return definition.expectedPositive;
  }
  if (caseType === "empty" || caseType === "static_trap") {
    return false;
  }
  if (expectedOutcome?.scoring_role === "positive_gold") {
    return true;
  }
  return null;
}

export const defaultWildfireCaseManifest = [
  {
    id: "indochina-hotspot-apr03-2026",
    label: "Indochina Hotspot 2026-04-03",
    case_type: "AF_positive",
    case_semantics: "AF_canary",
    report_group: "primary_live_canary",
    time_semantics: "live_nrt",
    expected_outcome: {
      raw_points: "present",
      cluster_state: "desired_but_not_gold",
      scoring_role: "candidate_non_gold",
      summary: "Primary contract is live official parity and visible raw points; cluster quality is evaluated comparatively, not as gold truth.",
    },
    primary_eval_metric: "provider_count_parity",
    acceptable_time_offset: {
      max_abs_min: 360,
    },
    sensor_priority: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"],
    aoi: [96, 16, 104, 24],
    anchorUtc: "2026-04-03T12:00:00.000Z",
    requestedWindowDays: 1,
    notes: [
      "Repo-owned hotspot canary derived from the existing wildfire demo AOI.",
      "Use as the first live official parity sanity check before broader-world cases.",
    ],
  },
  {
    id: "indochina-hotspot-apr03-2026-72h-live",
    source_case_id: "indochina-hotspot-apr03-2026",
    label: "Indochina Hotspot 2026-04-03 72h Live",
    case_type: "AF_positive",
    case_semantics: "AF_canary",
    report_group: "ux_live_72h",
    time_semantics: "live_nrt",
    expected_outcome: {
      raw_points: "present",
      cluster_state: "desired_but_not_gold",
      scoring_role: "candidate_non_gold",
      summary: "Real 72h live-official replay for the Indochina AOI. Use for front-end 24h vs 72h evidence comparison, not for reviewed AF-gold scoring.",
    },
    primary_eval_metric: "provider_count_parity",
    acceptable_time_offset: {
      max_abs_min: 720,
    },
    sensor_priority: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"],
    aoi: [96, 16, 104, 24],
    anchorUtc: "2026-04-03T12:00:00.000Z",
    requestedWindowDays: 3,
    notes: [
      "Derived from the same real Indochina live source case as the 24h baseline, but executed with a real 72h live-official query window.",
      "Counts as a live replay branch for UX and time-window realism, not as a new reviewed AF-gold source incident.",
    ],
  },
  {
    id: "crown-fire-acton-apr03-2026",
    label: "Crown Fire Acton 2026-04-03",
    case_type: "AF_positive",
    case_semantics: "AF_canary",
    report_group: "primary_live_canary",
    time_semantics: "ambiguous_news",
    expected_outcome: {
      raw_points: "present",
      cluster_state: "desired_but_not_gold",
      scoring_role: "canary_non_gold",
      summary: "Named-fire canary seeded from user feedback; do not score as AF-positive gold without stronger reviewed truth.",
    },
    primary_eval_metric: "provider_count_parity",
    acceptable_time_offset: {
      max_abs_min: 720,
    },
    sensor_priority: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"],
    aoi: [-118.35, 34.35, -118.05, 34.62],
    anchorUtc: "2026-04-03T20:00:00.000Z",
    requestedWindowDays: 1,
    notes: [
      "Real-world Los Angeles County wildfire canary around Acton / Soledad Canyon corridor.",
      "Ambiguous-news semantics intentionally prevent this case from being treated as AF-positive gold truth.",
    ],
  },
  {
    id: "springs-fire-moreno-valley-apr08-2026",
    label: "Springs Fire Moreno Valley 2026-04-08",
    case_type: "AF_positive",
    case_semantics: "AF_canary",
    report_group: "primary_live_canary",
    time_semantics: "ambiguous_news",
    expected_outcome: {
      raw_points: "present",
      cluster_state: "desired_but_not_gold",
      scoring_role: "canary_non_gold",
      summary: "Live replay should surface raw official points if the window and AOI are correct, but this case is not a reviewed AF-positive gold label.",
    },
    primary_eval_metric: "provider_count_parity",
    acceptable_time_offset: {
      max_abs_min: 720,
    },
    sensor_priority: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"],
    aoi: [-117.45, 33.8, -117.05, 34.1],
    query_policy: {
      default_bbox_scale: 1,
      raw_count_zero_audit: {
        enabled: true,
        bbox_scale: 1.5,
        max_attempts: 1,
        scope: "case_local_only",
        trigger: "raw_count_zero",
        allowed_window_days: 1,
        keep_original_anchor: true,
      },
    },
    anchorUtc: "2026-04-08T20:00:00.000Z",
    requestedWindowDays: 1,
    notes: [
      "Real-world inland Southern California wildfire canary near Moreno Valley.",
      "Run5 miss audit found that a 1.5x query bbox recovers live official points without widening the time window.",
      "Use for live replay and local hotspot discovery comparison, not for optimistic AF-positive scoring.",
    ],
  },
  {
    id: "lirquen-chile-jan20-2026",
    label: "Lirquen Chile 2026-01-20",
    case_type: "AF_positive",
    case_semantics: "AF_canary",
    report_group: "extra_live_canary",
    time_semantics: "ambiguous_news",
    expected_outcome: {
      raw_points: "present",
      cluster_state: "desired_but_not_gold",
      scoring_role: "canary_non_gold",
      summary: "Cross-region positive canary for replay diversity; keep it out of AF-positive gold metrics until reviewed archive evidence exists.",
    },
    primary_eval_metric: "provider_count_parity",
    acceptable_time_offset: {
      max_abs_min: 720,
    },
    sensor_priority: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"],
    aoi: [-73.05, -36.88, -72.75, -36.6],
    anchorUtc: "2026-01-20T18:00:00.000Z",
    requestedWindowDays: 1,
    notes: [
      "Real-world Chile wildfire canary around the Concepcion / Penco / Lirquen area.",
      "Replay target is parity and local hotspot visibility, not unreviewed AF-positive gold scoring.",
    ],
  },
  {
    id: "central-pacific-empty-apr2026",
    label: "Central Pacific Empty Scene",
    case_type: "empty",
    case_semantics: "empty",
    report_group: "empty_gold",
    time_semantics: "live_nrt",
    expected_outcome: {
      raw_points: "absent",
      cluster_state: "absent",
      scoring_role: "negative_gold",
      summary: "Ocean-only empty scene; pipeline must not synthesize raw points or positive clusters.",
    },
    primary_eval_metric: "empty_scene_specificity",
    acceptable_time_offset: {
      max_abs_min: 180,
    },
    sensor_priority: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"],
    aoi: [-146.5, 5.0, -145.0, 6.5],
    anchorUtc: "2026-04-05T12:00:00.000Z",
    requestedWindowDays: 1,
    notes: [
      "Ocean-only empty scene used to verify the pipeline does not synthesize false raw points or clusters.",
    ],
  },
  {
    id: "greenland-ice-empty-apr2026",
    label: "Greenland Ice Empty Scene",
    case_type: "empty",
    case_semantics: "empty",
    report_group: "empty_gold",
    time_semantics: "live_nrt",
    expected_outcome: {
      raw_points: "absent",
      cluster_state: "absent",
      scoring_role: "negative_gold",
      summary: "High-latitude empty scene; protects against false positives over bright or cold terrain.",
    },
    primary_eval_metric: "empty_scene_specificity",
    acceptable_time_offset: {
      max_abs_min: 180,
    },
    sensor_priority: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"],
    aoi: [-42.6, 72.0, -41.6, 72.8],
    anchorUtc: "2026-04-05T12:00:00.000Z",
    requestedWindowDays: 1,
    notes: [
      "Ice-dominated empty scene used to guard against accidental false positives over high-albedo terrain.",
    ],
  },
  {
    id: "permian-basin-static-source-trap",
    label: "Permian Basin Static Source Trap",
    case_type: "static_trap",
    case_semantics: "trap",
    report_group: "trap_gold",
    time_semantics: "live_nrt",
    expected_outcome: {
      raw_points: "allowed_or_sparse",
      cluster_state: "suspicious_or_suppressed",
      scoring_role: "trap_gold",
      summary: "Raw official points may exist, but the system should annotate or suppress static-source-like positive clusters.",
    },
    primary_eval_metric: "static_source_false_positive_rate",
    acceptable_time_offset: {
      max_abs_min: 360,
    },
    sensor_priority: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"],
    aoi: [-104.05, 31.65, -103.65, 31.95],
    anchorUtc: "2026-04-05T12:00:00.000Z",
    requestedWindowDays: 1,
    suspiciousRegions: [
      {
        id: "permian-flare-core",
        label: "Known suspicious thermal source corridor",
        bbox: [-103.96, 31.72, -103.72, 31.9],
        reason: "persistent_flare_like_source",
      },
      {
        id: "permian-run5-static-cluster-a",
        label: "Run5 static hotspot candidate A",
        bbox: [-103.8535, 31.6802, -103.8488, 31.6828],
        reason: "persistent_flare_like_source",
      },
      {
        id: "permian-run5-static-cluster-b",
        label: "Run5 static hotspot candidate B",
        bbox: [-104.0295, 31.6535, -104.0235, 31.6588],
        reason: "persistent_flare_like_source",
      },
      {
        id: "permian-run5-static-cluster-c",
        label: "Run5 static hotspot candidate C",
        bbox: [-104.023, 31.9204, -104.0201, 31.9233],
        reason: "persistent_flare_like_source",
      },
    ],
    notes: [
      "Static-source trap seeded for persistent thermal activity in the Permian Basin.",
      "Run5 baseline exposed three additional low-FRP multi-sensor fixed hotspots; they are registered here as suspicious static-source candidates for replay suppression.",
      "Raw official points must be preserved, but cluster scoring should downgrade or flag suspicious activity.",
    ],
  },
];

export function createWildfireCaseDefinition(definition = {}) {
  const caseType = normalizeCaseType(definition.case_type || definition.type, definition);
  const timeSemantics = normalizeTimeSemantics(definition.time_semantics, caseType);
  const expectedOutcome = normalizeExpectedOutcome(definition.expected_outcome, caseType, timeSemantics);
  const sensorPriority = normalizeSensorPriority(definition);
  const reportGroup = definition.report_group ? String(definition.report_group) : null;
  const caseSemantics = normalizeCaseSemantics(definition.case_semantics, caseType, expectedOutcome);
  const queryPolicy = normalizeQueryPolicy(definition);

  return {
    id: String(definition.id || `${caseType}-case`),
    source_case_id: String(definition.source_case_id || definition.sourceCaseId || definition.id || `${caseType}-case`),
    label: String(definition.label || caseType),
    case_type: caseType,
    type: caseType,
    case_semantics: caseSemantics,
    time_semantics: timeSemantics,
    expected_outcome: expectedOutcome,
    primary_eval_metric: normalizePrimaryEvalMetric(definition.primary_eval_metric, caseType),
    acceptable_time_offset: normalizeAcceptableTimeOffset(definition.acceptable_time_offset, timeSemantics),
    sensor_priority: sensorPriority,
    sensors: sensorPriority,
    expectedPositive: deriveExpectedPositive(definition, caseType, expectedOutcome),
    aoi: Array.isArray(definition.aoi) ? definition.aoi.map((value) => Number(value)) : null,
    query_bbox_scale: Number(queryPolicy.default_bbox_scale) > 0 ? Number(queryPolicy.default_bbox_scale) : 1,
    query_policy: queryPolicy,
    anchorUtc: definition.anchorUtc || null,
    requestedWindowDays: Number(definition.requestedWindowDays) || 1,
    report_group: reportGroup,
    counts_for_reviewed_af_recall: deriveReviewedAfRecallEligibility(caseSemantics, expectedOutcome),
    counts_for_af_canary_hit_rate: deriveAfCanaryEligibility(caseSemantics, reportGroup),
    suspiciousRegions: Array.isArray(definition.suspiciousRegions)
      ? definition.suspiciousRegions.map((entry) => ({
          id: String(entry.id || "suspicious-region"),
          label: String(entry.label || "Suspicious static source"),
          bbox: Array.isArray(entry.bbox) ? entry.bbox.map((value) => Number(value)) : null,
          reason: String(entry.reason || "suspicious_static_source"),
        }))
      : [],
    archive_sources: normalizeArchiveSources(definition.archive_sources),
    archive_source: definition.archive_source ? String(definition.archive_source) : null,
    bundle_version: definition.bundle_version ? String(definition.bundle_version) : null,
    sensor_coverage: normalizeSensorCoverage(definition),
    notes: Array.isArray(definition.notes) ? definition.notes.map((item) => String(item)) : [],
    validationStatus: String(definition.validationStatus || defaultValidationStatus(caseType, timeSemantics)),
  };
}

export function buildWildfireCaseManifest(cases = defaultWildfireCaseManifest) {
  return (Array.isArray(cases) ? cases : defaultWildfireCaseManifest).map((entry) => createWildfireCaseDefinition(entry));
}
