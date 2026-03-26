const EARTH_SEARCH_V1 = "https://earth-search.aws.element84.com/v1/search";
const CMR_LANCEMODIS_SEARCH = "https://cmr.earthdata.nasa.gov/stac/LANCEMODIS/search";
const COPERNICUS_STAC_SEARCH = "https://stac.dataspace.copernicus.eu/v1/search";

const stacProviderCatalog = {
  version: "2026.03.24-local",
  defaultProviderId: "earth-search",
  providers: [
    {
      id: "earth-search",
      label: "Earth Search v1",
      searchUrl: EARTH_SEARCH_V1,
      description: "Element 84 维护的开放 STAC 检索入口，适合快速验证 bbox、时间窗口与 collection 的标准检索链路。",
      defaultLimit: 6,
      supportsPaging: true,
      collections: [
        {
          id: "sentinel-2-l2a",
          label: "Sentinel-2 L2A",
          description: "高频光学影像，适合检索近期可用场景。",
        },
        {
          id: "landsat-c2-l2",
          label: "Landsat Collection 2 L2",
          description: "覆盖稳定，可作为 Sentinel 检索为空时的补充。",
        },
      ],
    },
    {
      id: "cmr-lancemodis",
      label: "NASA CMR-STAC / LANCEMODIS",
      searchUrl: CMR_LANCEMODIS_SEARCH,
      description: "NASA 官方 CMR-STAC provider，更贴近 MODIS 近实时大气产品检索链路。",
      defaultLimit: 6,
      supportsPaging: true,
      collections: [
        {
          id: "MYD04_3K_6.1NRT",
          label: "MODIS/Aqua Aerosol 3km NRT",
          description: "适合局部异常快速浏览的近实时 AOD 产品。",
        },
        {
          id: "MYD04_L2_6.1NRT",
          label: "MODIS/Aqua Aerosol 10km NRT",
          description: "经典 MODIS 近实时气溶胶产品，可作为 NASA 官方检索入口。",
        },
        {
          id: "MYDAODHD_6.1NRT",
          label: "MODIS/Aqua Value-added AOD NRT",
          description: "面向 AOD 的值增近实时产品，适合后续反演链路衔接。",
        },
      ],
    },
    {
      id: "copernicus-stac",
      label: "Copernicus Data Space STAC",
      searchUrl: COPERNICUS_STAC_SEARCH,
      description: "Copernicus 官方 STAC 检索入口，用于补齐 Sentinel-2 高分辨率场景的数据发现能力。",
      defaultLimit: 6,
      supportsPaging: true,
      retryPolicy: {
        maxRetries: 2,
        retryDelayMs: 600,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      },
      collections: [
        {
          id: "sentinel-2-l2a",
          label: "Copernicus Sentinel-2 L2A",
          description: "适合高分辨率烟羽、沙尘和云边界场景的精细化检索。",
        },
        {
          id: "sentinel-2-l1c",
          label: "Copernicus Sentinel-2 L1C",
          description: "可作为 s2cloudless 与 Fmask 预处理链路的输入候选。",
        },
        {
          id: "sentinel-1-grd",
          label: "Copernicus Sentinel-1 GRD",
          description: "为后续多模态或光学受阻时的补充数据接入预留。",
        },
      ],
    },
  ],
};

function fail(message, code = "invalid_request") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDatetimeRange(rawStart, rawEnd) {
  if (!rawStart || !rawEnd) {
    fail("startDate and endDate are required.", "invalid_datetime");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawStart) || !/^\d{4}-\d{2}-\d{2}$/.test(rawEnd)) {
    fail("Dates must use YYYY-MM-DD.", "invalid_datetime");
  }

  if (rawStart > rawEnd) {
    fail("startDate cannot be later than endDate.", "invalid_datetime_range");
  }

  return `${rawStart}T00:00:00Z/${rawEnd}T23:59:59Z`;
}

function parseBbox(rawBbox) {
  if (!Array.isArray(rawBbox) || rawBbox.length !== 4) {
    fail("bbox must be a 4-value array.", "invalid_bbox");
  }

  const bbox = rawBbox.map((value) => Number(value));
  if (bbox.some((value) => !Number.isFinite(value))) {
    fail("bbox contains non-numeric values.", "invalid_bbox");
  }

  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    fail("bbox min values must be smaller than max values.", "invalid_bbox_range");
  }

  return bbox;
}

function getProviderConfig(providerId) {
  const provider = stacProviderCatalog.providers.find((item) => item.id === providerId);
  if (!provider) {
    fail(`Unknown provider: ${providerId}`, "unknown_provider");
  }
  return provider;
}

function validateCollections(provider, collections) {
  if (!Array.isArray(collections) || collections.length === 0) {
    fail("collections must not be empty.", "invalid_collections");
  }

  const allowed = new Set(provider.collections.map((item) => item.id));
  collections.forEach((collectionId) => {
    if (!allowed.has(collectionId)) {
      fail(
        `Provider ${provider.id} does not support collection ${collectionId}.`,
        "unsupported_collection"
      );
    }
  });

  return collections;
}

function normalizeStacSearchPayload(payload = {}) {
  const provider = getProviderConfig(payload.providerId || stacProviderCatalog.defaultProviderId);
  const collections = validateCollections(provider, payload.collections);
  const bbox = parseBbox(payload.bbox);
  const datetime = parseDatetimeRange(payload.startDate, payload.endDate);
  const limit = Math.max(1, Math.min(20, Number(payload.limit) || provider.defaultLimit));

  return {
    providerId: provider.id,
    provider,
    collections,
    bbox,
    datetime,
    limit,
    sourceLabel: payload.sourceLabel || "未命名 ROI",
  };
}

function buildStacSearchBody(request) {
  return {
    bbox: request.bbox,
    datetime: request.datetime,
    limit: request.limit,
    collections: request.collections,
  };
}

async function requestJson(fetchImpl, url, options, retryPolicy = {}) {
  const retryableStatusCodes = retryPolicy.retryableStatusCodes || [];
  const maxRetries = Math.max(0, Number(retryPolicy.maxRetries) || 0);
  const retryDelayMs = Math.max(0, Number(retryPolicy.retryDelayMs) || 0);
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await fetchImpl(url, options);
      if (response.ok) {
        return response.json();
      }

      if (!retryableStatusCodes.includes(response.status) || attempt >= maxRetries) {
        fail(`STAC request failed with status ${response.status}.`, "stac_http_error");
      }
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
    }

    attempt += 1;
    if (retryDelayMs > 0) {
      await sleep(retryDelayMs * attempt);
    }
  }

  fail("STAC request failed.", "stac_http_error");
}

function nextPageLink(collection) {
  return collection.links?.find((link) => link.rel === "next" && link.href) || null;
}

async function fetchNextPage(fetchImpl, link, retryPolicy) {
  const method = (link.method || "GET").toUpperCase();
  const headers = {};
  let body;

  if (method !== "GET") {
    headers["Content-Type"] = link.type || "application/json";
    body = JSON.stringify(link.body || {});
  }

  return requestJson(
    fetchImpl,
    link.href,
    {
      method,
      headers,
      body,
    },
    retryPolicy
  );
}

async function searchStacItems(fetchImpl, payload, options = {}) {
  const request = normalizeStacSearchPayload(payload);
  const maxPages = Math.max(1, Math.min(5, options.maxPages || 3));
  const retryPolicy = request.provider.retryPolicy || {};
  const pages = [];

  let page = await requestJson(
    fetchImpl,
    request.provider.searchUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildStacSearchBody(request)),
    },
    retryPolicy
  );
  pages.push(page);

  let nextLink = nextPageLink(page);
  let pageCount = 1;

  while (nextLink && pageCount < maxPages) {
    page = await fetchNextPage(fetchImpl, nextLink, retryPolicy);
    pages.push(page);
    nextLink = nextPageLink(page);
    pageCount += 1;
  }

  const allowedCollections = new Set(request.collections);
  const rawFeatures = pages.flatMap((itemCollection) => itemCollection.features || []);
  const features = rawFeatures.filter((feature) => allowedCollections.has(feature.collection));

  return {
    providerId: request.providerId,
    providerLabel: request.provider.label,
    request: {
      bbox: request.bbox,
      datetime: request.datetime,
      collections: request.collections,
      limit: request.limit,
      sourceLabel: request.sourceLabel,
    },
    itemCount: features.length,
    filteredOutCount: rawFeatures.length - features.length,
    pagesFetched: pages.length,
    features,
  };
}

function summarizeFeature(feature) {
  const assetEntries = Object.entries(feature.assets || {});
  const primaryAsset =
    assetEntries.find(([, asset]) => {
      const type = String(asset?.type || "").toLowerCase();
      const roles = Array.isArray(asset?.roles) ? asset.roles.join(",").toLowerCase() : "";
      return (
        type.includes("geotiff") ||
        type.includes("image/tiff") ||
        roles.includes("data") ||
        roles.includes("analytic")
      );
    }) || assetEntries[0] || null;

  return {
    id: feature.id,
    collection: feature.collection,
    datetime: feature.properties?.datetime || feature.properties?.start_datetime || null,
    cloudCover:
      feature.properties?.["eo:cloud_cover"] ??
      feature.properties?.["s2:cloud_shadow_percentage"] ??
      null,
    assets: Object.keys(feature.assets || {}).length,
    assetKeys: assetEntries.slice(0, 5).map(([key]) => key),
    primaryAssetUrl: primaryAsset?.[1]?.href || null,
  };
}

module.exports = {
  buildStacSearchBody,
  normalizeStacSearchPayload,
  searchStacItems,
  stacProviderCatalog,
  summarizeFeature,
};
