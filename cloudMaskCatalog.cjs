const LAADS_DETAILS_URL = "https://ladsweb.modaps.eosdis.nasa.gov/api/v2/content/details";

const cloudMaskCatalog = {
  version: "2026.03.24-local",
  defaultProductId: "CLDMSK_L2_VIIRS_NOAA21",
  products: [
    {
      id: "CLDMSK_L2_VIIRS_NOAA21",
      label: "VIIRS/NOAA-21 Cloud Mask",
      sensor: "VIIRS",
      platform: "NOAA-21",
      fileType: "NetCDF",
      description: "更贴近当前场景默认底图来源的云掩膜产品，适合作为 VIIRS 场景的首选预处理入口。",
    },
    {
      id: "CLDMSK_L2_VIIRS_NOAA20",
      label: "VIIRS/NOAA-20 Cloud Mask",
      sensor: "VIIRS",
      platform: "NOAA-20",
      fileType: "NetCDF",
      description: "与 NOAA-20 真彩色影像链路配套，可作为 NOAA-21 不可用时的补充入口。",
    },
    {
      id: "CLDMSK_L2_VIIRS_SNPP",
      label: "VIIRS/SNPP Cloud Mask",
      sensor: "VIIRS",
      platform: "SNPP",
      fileType: "NetCDF",
      description: "适合较长时间跨度的云掩膜回溯检索。",
    },
    {
      id: "MYD35_L2",
      label: "MODIS/Aqua Cloud Mask",
      sensor: "MODIS",
      platform: "Aqua",
      fileType: "HDF",
      description: "与 Aqua 大气产品链路衔接更自然，适合当前 MODIS/Aqua AOD 相关场景。",
    },
    {
      id: "MOD35_L2",
      label: "MODIS/Terra Cloud Mask",
      sensor: "MODIS",
      platform: "Terra",
      fileType: "HDF",
      description: "适合作为 Terra 产品链路的备用云掩膜来源。",
    },
  ],
};

function fail(message, code = "invalid_request") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseDate(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    fail(`${field} 必须使用 YYYY-MM-DD。`, "invalid_datetime");
  }
  return value;
}

function parseBbox(rawBbox) {
  if (!Array.isArray(rawBbox) || rawBbox.length !== 4) {
    fail("bbox 必须是长度为 4 的数组。", "invalid_bbox");
  }

  const bbox = rawBbox.map((value) => Number(value));
  if (bbox.some((value) => !Number.isFinite(value))) {
    fail("bbox 中存在非法数值。", "invalid_bbox");
  }

  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    fail("bbox 范围不合法。", "invalid_bbox_range");
  }

  return bbox;
}

function getProductConfig(productId) {
  const product = cloudMaskCatalog.products.find((item) => item.id === productId);
  if (!product) {
    fail(`未知云掩膜 product: ${productId}`, "unknown_cloud_mask_product");
  }
  return product;
}

function bboxToLaadsRegion(bbox) {
  const [west, south, east, north] = parseBbox(bbox);
  return `[BBOX]W${west} N${north} E${east} S${south}`;
}

function normalizeCloudMaskPayload(payload = {}) {
  const product = getProductConfig(payload.productId || cloudMaskCatalog.defaultProductId);
  const bbox = parseBbox(payload.bbox);
  const startDate = parseDate(payload.startDate, "startDate");
  const endDate = parseDate(payload.endDate, "endDate");
  if (startDate > endDate) {
    fail("startDate 不能晚于 endDate。", "invalid_datetime_range");
  }

  const threshold = Math.max(0.1, Math.min(0.95, Number(payload.threshold) || 0.45));
  const limit = Math.max(1, Math.min(12, Number(payload.limit) || 6));

  return {
    productId: product.id,
    product,
    bbox,
    startDate,
    endDate,
    threshold,
    limit,
    region: bboxToLaadsRegion(bbox),
    temporalRange: `${startDate}..${endDate}`,
    sourceLabel: payload.sourceLabel || "未命名 ROI",
  };
}

function buildCloudMaskSearchUrl(request, pageLink = null) {
  if (pageLink) {
    return pageLink;
  }

  const params = new URLSearchParams({
    products: request.productId,
    temporalRanges: request.temporalRange,
    regions: request.region,
  });
  return `${LAADS_DETAILS_URL}?${params.toString()}`;
}

async function requestJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    fail(`云掩膜请求失败：${response.status}`, "cloud_mask_http_error");
  }
  return response.json();
}

function summarizeCloudMaskItem(item) {
  const sizeBytes = Number(item.size) || 0;
  const sizeMb = sizeBytes ? Math.round((sizeBytes / (1024 * 1024)) * 100) / 100 : null;
  const extension = String(item.name || "").split(".").pop()?.toLowerCase() || "";

  return {
    id: item.fileId ?? item.name,
    name: item.name,
    productId: item.products,
    datetime: item.start || null,
    dataDay: item.dataDay || null,
    sizeMb,
    fileType: extension || "unknown",
    status: item.status || null,
    downloadsLink: item.downloadsLink || null,
  };
}

async function searchCloudMaskFiles(fetchImpl, payload, options = {}) {
  const request = normalizeCloudMaskPayload(payload);
  const maxPages = Math.max(1, Math.min(3, Number(options.maxPages) || 2));
  const pages = [];

  let page = await requestJson(fetchImpl, buildCloudMaskSearchUrl(request));
  pages.push(page);

  let nextPageLink = page.nextPageLink || null;
  let pageCount = 1;
  while (nextPageLink && pageCount < maxPages) {
    page = await requestJson(fetchImpl, nextPageLink);
    pages.push(page);
    nextPageLink = page.nextPageLink || null;
    pageCount += 1;
  }

  const rawItems = pages.flatMap((entry) => entry.content || []);
  const items = rawItems
    .filter((item) => item.products === request.productId)
    .slice(0, request.limit)
    .map(summarizeCloudMaskItem);

  const estimatedCoverage = Math.min(0.98, 0.18 + items.length * 0.11);
  const confidence = Math.max(0.42, Math.min(0.95, 0.86 - request.threshold * 0.22 + items.length * 0.015));

  return {
    productId: request.productId,
    productLabel: request.product.label,
    request: {
      bbox: request.bbox,
      startDate: request.startDate,
      endDate: request.endDate,
      threshold: request.threshold,
      limit: request.limit,
      sourceLabel: request.sourceLabel,
    },
    itemCount: items.length,
    pagesFetched: pages.length,
    estimatedCoverage,
    confidence: Math.round(confidence * 100) / 100,
    items,
  };
}

module.exports = {
  buildCloudMaskSearchUrl,
  cloudMaskCatalog,
  normalizeCloudMaskPayload,
  searchCloudMaskFiles,
};
