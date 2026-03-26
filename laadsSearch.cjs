const LAADS_DETAILS_URL = "https://ladsweb.modaps.eosdis.nasa.gov/api/v2/content/details";

const laadsProductCatalog = {
  version: "2026.03.24-local",
  defaultProductId: "MYD04_3K",
  authMode: "earthdata_bearer_token",
  products: [
    {
      id: "MYD04_3K",
      label: "MODIS/Aqua Aerosol 3km",
      sensor: "MODIS",
      platform: "Aqua",
      cadenceLabel: "近实时日级文件",
      description: "优先打通 MODIS/Aqua 3km 气溶胶产品的官方检索与下载计划生成链路。",
      requiresToken: true,
    },
    {
      id: "MYD04_L2",
      label: "MODIS/Aqua Aerosol 10km",
      sensor: "MODIS",
      platform: "Aqua",
      cadenceLabel: "近实时日级文件",
      description: "经典 MODIS/Aqua 气溶胶产品，可作为 3km 产品的补充检索入口。",
      requiresToken: true,
    },
    {
      id: "MYDAODHD",
      label: "MODIS/Aqua Value-added AOD",
      sensor: "MODIS",
      platform: "Aqua",
      cadenceLabel: "近实时日级文件",
      description: "面向 AOD 分析的值增产品，便于与后续异常反演链路衔接。",
      requiresToken: true,
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
    fail("bbox 的最小值必须严格小于最大值。", "invalid_bbox_range");
  }

  return bbox;
}

function getProductConfig(productId) {
  const product = laadsProductCatalog.products.find((item) => item.id === productId);
  if (!product) {
    fail(`未知 LAADS product: ${productId}`, "unknown_product");
  }
  return product;
}

function bboxToLaadsRegion(bbox) {
  const [west, south, east, north] = parseBbox(bbox);
  return `[BBOX]W${west} N${north} E${east} S${south}`;
}

function normalizeLaadsSearchPayload(payload = {}) {
  const product = getProductConfig(payload.productId || laadsProductCatalog.defaultProductId);
  const bbox = parseBbox(payload.bbox);
  const startDate = parseDate(payload.startDate, "startDate");
  const endDate = parseDate(payload.endDate, "endDate");

  if (startDate > endDate) {
    fail("startDate 不能晚于 endDate。", "invalid_datetime_range");
  }

  const limit = Math.max(1, Math.min(30, Number(payload.limit) || 6));

  return {
    productId: product.id,
    product,
    bbox,
    region: bboxToLaadsRegion(bbox),
    startDate,
    endDate,
    temporalRange: `${startDate}..${endDate}`,
    limit,
    sourceLabel: payload.sourceLabel || "未命名 ROI",
  };
}

function buildLaadsSearchUrl(request, pageLink = null) {
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

async function requestLaadsJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    fail(`LAADS 请求失败：${response.status}`, "laads_http_error");
  }

  return response.json();
}

function summarizeLaadsItem(item) {
  const sizeBytes = Number(item.size) || 0;
  const sizeMb = sizeBytes ? Math.round((sizeBytes / (1024 * 1024)) * 100) / 100 : null;
  const extension = String(item.name || "").split(".").pop()?.toLowerCase() || "";

  return {
    id: item.fileId ?? item.name,
    name: item.name,
    productId: item.products,
    dataDay: item.dataDay || null,
    datetime: item.start || null,
    status: item.status || null,
    sizeBytes,
    sizeMb,
    fileType: extension || "unknown",
    downloadsLink: item.downloadsLink || null,
    detailLink: item.self || null,
  };
}

async function searchLaadsContent(fetchImpl, payload, options = {}) {
  const request = normalizeLaadsSearchPayload(payload);
  const maxPages = Math.max(1, Math.min(4, Number(options.maxPages) || 2));
  const pages = [];

  let page = await requestLaadsJson(fetchImpl, buildLaadsSearchUrl(request));
  pages.push(page);

  let nextPageLink = page.nextPageLink || null;
  let pageCount = 1;

  while (nextPageLink && pageCount < maxPages) {
    page = await requestLaadsJson(fetchImpl, nextPageLink);
    pages.push(page);
    nextPageLink = page.nextPageLink || null;
    pageCount += 1;
  }

  const rawItems = pages.flatMap((entry) => entry.content || []);
  const filteredItems = rawItems.filter((item) => item.products === request.productId);
  const items = filteredItems.slice(0, request.limit).map(summarizeLaadsItem);

  return {
    productId: request.productId,
    productLabel: request.product.label,
    request: {
      bbox: request.bbox,
      region: request.region,
      startDate: request.startDate,
      endDate: request.endDate,
      temporalRange: request.temporalRange,
      limit: request.limit,
      sourceLabel: request.sourceLabel,
    },
    itemCount: items.length,
    filteredOutCount: rawItems.length - filteredItems.length,
    pagesFetched: pages.length,
    nextPageAvailable: Boolean(nextPageLink),
    items,
  };
}

function sanitizeTargetDir(targetDir) {
  return String(targetDir || "./data/laads").replace(/[\\/]+$/, "");
}

function buildLaadsDownloadPlan(payload = {}) {
  const product = getProductConfig(payload.productId || laadsProductCatalog.defaultProductId);
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    fail("下载计划至少需要 1 个文件。", "empty_download_plan");
  }

  const tokenPlaceholder = payload.tokenPlaceholder || "<EARTHDATA_TOKEN>";
  const targetDirectory = `${sanitizeTargetDir(payload.targetDirectory)}/${product.id}`;
  const normalizedItems = items.map((item, index) => {
    if (!item?.downloadsLink || !item?.name) {
      fail(`第 ${index + 1} 个文件缺少 name 或 downloadsLink。`, "invalid_download_item");
    }

    return {
      name: item.name,
      downloadsLink: item.downloadsLink,
      sizeBytes: Number(item.sizeBytes) || 0,
    };
  });

  const totalSizeBytes = normalizedItems.reduce((sum, item) => sum + item.sizeBytes, 0);
  const totalSizeMb = Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100;

  const powerShellScript = [
    '$headers = @{ Authorization = "Bearer ' + tokenPlaceholder + '" }',
    `New-Item -ItemType Directory -Force -Path "${targetDirectory}" | Out-Null`,
    ...normalizedItems.map(
      (item) =>
        `Invoke-WebRequest -Uri "${item.downloadsLink}" -Headers $headers -OutFile "${targetDirectory}/${item.name}"`
    ),
  ].join("\n");

  const shellScript = [
    `mkdir -p "${targetDirectory}"`,
    ...normalizedItems.map(
      (item) =>
        `curl -L -H "Authorization: Bearer ${tokenPlaceholder}" "${item.downloadsLink}" -o "${targetDirectory}/${item.name}"`
    ),
  ].join("\n");

  return {
    authMode: laadsProductCatalog.authMode,
    productId: product.id,
    productLabel: product.label,
    targetDirectory,
    fileCount: normalizedItems.length,
    totalSizeBytes,
    totalSizeMb,
    powerShellScript,
    shellScript,
    files: normalizedItems,
  };
}

module.exports = {
  bboxToLaadsRegion,
  buildLaadsDownloadPlan,
  buildLaadsSearchUrl,
  laadsProductCatalog,
  normalizeLaadsSearchPayload,
  searchLaadsContent,
  summarizeLaadsItem,
};
