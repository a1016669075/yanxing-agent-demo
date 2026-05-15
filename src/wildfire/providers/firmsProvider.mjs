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
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return {
        available: false,
        providerId: "firms",
        reason: payload.error || "firms_request_failed",
        detail: payload.message || "",
        config: profile,
        detections: [],
        rawDetections: [],
        clusters: [],
        rois: [],
        summary: summarizeFireOverlay([], [], { rawArchive: [] }),
      };
    }

    const payload = await response.json();
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
