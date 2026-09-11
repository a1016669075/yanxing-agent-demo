import { buildWildfireQueryPlan, normalizeWildfireRequestedDayRange, normalizeWildfireTemporalPolicy, wildfireDefaultSensors, wildfireWindowLabel } from "../config.mjs";
import { clusterHotspotsTimeAware } from "../clustering/timeAwareClustering.mjs";
import { runWildfireDiscovery } from "../discovery/hotspotDiscovery.mjs";
import {
  buildEvidenceFromFirmsPayload,
} from "./firmsAreaIngestion.mjs";
import { buildFireOverlayPresentation, summarizeFireOverlay } from "../presenter/fireOverlayPresenter.mjs";
import { clusterFireDetectionsLegacy } from "../legacy/fireDetectionsFlatLegacy.mjs";
import { normalizeWildfireRequest } from "../request/normalizeRequest.mjs";

export const wildfireProviderCatalog = {
  firms: {
    id: "firms",
    label: "NASA FIRMS Area API",
    provider: "NASA FIRMS",
    products: ["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"],
    defaultProducts: [...wildfireDefaultSensors],
    defaultWindowDays: 1,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeBBox(bbox = null) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }
  const normalized = bbox.map((value) => Number(value));
  return normalized.every((value) => Number.isFinite(value)) ? normalized : null;
}

function sameBBox(left = null, right = null) {
  const a = normalizeBBox(left);
  const b = normalizeBBox(right);
  return Boolean(a && b && a.every((value, index) => Math.abs(value - b[index]) < 0.000001));
}

async function fetchStaticDemoSnapshot(scenario, request, profile, { signal } = {}) {
  if (scenario?.id !== "wildfire-firms-demo") {
    return null;
  }

  const response = await fetch(
    new URL("../../../assets/firms/wildfire-firms-demo.json", import.meta.url),
    { signal }
  );
  if (!response.ok) {
    return null;
  }

  const snapshot = await response.json();
  if (!sameBBox(request?.bbox, snapshot?.bbox) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot?.snapshotDate || "")) {
    return null;
  }

  const lastDay = new Date(`${snapshot.snapshotDate}T00:00:00.000Z`).getTime();
  const firstDay = lastDay - (profile.dayRange - 1) * 24 * 60 * 60 * 1000;
  const rows = (Array.isArray(snapshot.rows) ? snapshot.rows : []).filter((row) => {
    const rowDay = new Date(`${row.acq_date}T00:00:00.000Z`).getTime();
    return profile.products.includes(row.product) && rowDay >= firstDay && rowDay <= lastDay;
  });
  const segments = profile.products.map((product) => ({
    sliceId: `pages-snapshot-${profile.dayRange}d-${product}`,
    label: `${profile.windowLabel} GitHub Pages snapshot`,
    product,
    apiDayRange: Math.min(profile.dayRange, 5),
    requestedWindowDays: profile.dayRange,
    date: snapshot.snapshotDate,
    rows: rows.filter((row) => row.product === product),
  }));

  return {
    provider: "firms",
    mode: profile.mode,
    dayRange: profile.dayRange,
    date: snapshot.snapshotDate,
    bbox: snapshot.bbox,
    products: profile.products,
    segments,
    rows,
    sourceMode: "local_cache",
    cache: {
      kind: "github_pages_snapshot",
      snapshotDate: snapshot.snapshotDate,
      generatedAt: snapshot.generatedAt || null,
    },
    fallbackReason: "static_host_no_firms_api",
  };
}

export function normalizeWildfireProviderConfig(config = {}) {
  const source = config && typeof config === "object" ? config : {};
  const defaultProducts = wildfireProviderCatalog.firms.defaultProducts;
  const selectedProducts = Array.isArray(source.products) && source.products.length ? source.products : defaultProducts;
  const dayRange = normalizeWildfireRequestedDayRange(source.dayRange);
  const temporalState = normalizeWildfireTemporalPolicy(source.temporal_state || source.temporalPolicy || {});
  return {
    provider: source.provider || "firms",
    mode: source.mode === "standard" ? "standard" : "nrt",
    dayRange,
    products: [...new Set(selectedProducts)],
    includeLowConfidence: Boolean(source.includeLowConfidence),
    useWmsTimeOverlay: Boolean(source.useWmsTimeOverlay),
    minimumConfidenceLevel: source.includeLowConfidence ? "low" : "nominal",
    windowLabel: wildfireWindowLabel(dayRange),
    temporal_state: temporalState,
    queryPlan: buildWildfireQueryPlan(dayRange, source.date || null),
  };
}

export async function fetchFirmsStatus({ signal } = {}) {
  if (typeof fetch !== "function") {
    return {
      available: false,
      reason: "fetch_unavailable",
    };
  }

  try {
    const response = await fetch("/api/firms-status", { signal });
    if (!response.ok) {
      return {
        available: false,
        reason: "firms_status_unavailable",
      };
    }
    return response.json();
  } catch {
    return {
      available: false,
      reason: "firms_status_unreachable",
    };
  }
}

export async function fetchFirmsFireOverlay(
  scenario,
  observation,
  config = {},
  { signal } = {}
) {
  const profile = normalizeWildfireProviderConfig(config);
  const request = normalizeWildfireRequest(scenario, observation, profile);
  const bbox = normalizeBBox(request?.bbox);
  if (!bbox || typeof fetch !== "function") {
    return {
      available: false,
      providerId: "firms",
      reason: "invalid_bbox_or_fetch_unavailable",
      config: profile,
      detections: [],
      rawDetections: [],
      clusters: [],
      rois: [],
      summary: summarizeFireOverlay([], [], { rawArchive: [] }),
    };
  }

  const startedAt = Date.now();
  let payload = null;
  let failureReason = "firms_request_failed";
  let failureDetail = "";

  try {
    const response = await fetch("/api/firms-area", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bbox,
        dayRange: profile.dayRange,
        products: profile.products,
        mode: profile.mode,
        date: request.anchorDate,
      }),
      signal,
    });
    if (response.ok) {
      payload = await response.json();
    } else {
      const errorPayload = await response.json().catch(() => ({}));
      failureReason = errorPayload.error || failureReason;
      failureDetail = errorPayload.message || "";
    }
  } catch (error) {
    failureDetail = String(error?.message || error);
  }

  if (!payload) {
    payload = await fetchStaticDemoSnapshot(scenario, request, profile, { signal }).catch(() => null);
  }

  if (!payload) {
    return {
      available: false,
      providerId: "firms",
      reason: failureReason,
      detail: failureDetail,
      config: profile,
      detections: [],
      rawDetections: [],
      clusters: [],
      rois: [],
      summary: summarizeFireOverlay([], [], { rawArchive: [] }),
    };
  }

  try {
    const sourceMode = payload.sourceMode || "live_official";
    const ingestion = buildEvidenceFromFirmsPayload(payload, request);
    const discovery = runWildfireDiscovery(ingestion.detectionArchive, {
      bbox,
      temporalState: ingestion.temporalState,
    });
    const clusters = clusterHotspotsTimeAware(discovery, {
      bbox,
      temporalState: ingestion.temporalState,
    });
    const legacyClusters = clusterFireDetectionsLegacy(
      ingestion.detectionArchive.map((item) => ({
        ...item,
        acqTimeUtc: item.acquisition_start_utc || item.acqTimeUtc,
      })),
      { bbox }
    );
    const overlay = buildFireOverlayPresentation({
      request,
      ingestion,
      clusters,
      legacyClusters,
      latencyMs: Date.now() - startedAt,
      maxRois: scenario?.analysisProfile?.maxRois || 6,
    });

    return {
      ...overlay,
      available: true,
      providerId: "firms",
      config: {
        ...profile,
        windowLabel: profile.windowLabel,
        queryPlanLabel: request?.queryPlan?.label || null,
        sourceMode,
      },
      bbox: clone(bbox),
      queryMode: payload.mode || profile.mode,
      sourceMode,
      cache: payload.cache || null,
      fallbackReason: payload.fallbackReason || null,
      description:
        `${overlay.description}${
          sourceMode === "local_cache" ? " FIRMS rows were loaded from local daily cache because live API was unavailable." : ""
        }${
          profile.dayRange === 7
            ? " 7d request is stitched from legal FIRMS Area API slices instead of flattening a single pseudo-7d product."
            : ""
        }`,
    };
  } catch (error) {
    return {
      available: false,
      providerId: "firms",
      reason: "firms_request_failed",
      detail: String(error?.message || error),
      config: profile,
      detections: [],
      rawDetections: [],
      clusters: [],
      rois: [],
      summary: summarizeFireOverlay([], [], { rawArchive: [] }),
    };
  }
}
