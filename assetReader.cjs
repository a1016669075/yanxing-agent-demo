function fail(message, code = "invalid_request") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    if (!["http:", "https:"].includes(url.protocol)) {
      fail("资产地址必须是 http 或 https。", "invalid_asset_url");
    }
    return url;
  } catch {
    fail("资产地址不是合法 URL。", "invalid_asset_url");
  }
}

function parseBbox(rawBbox) {
  if (!Array.isArray(rawBbox) || rawBbox.length !== 4) {
    fail("window.bbox 必须是长度为 4 的数组。", "invalid_window_bbox");
  }

  const bbox = rawBbox.map((value) => Number(value));
  if (bbox.some((value) => !Number.isFinite(value))) {
    fail("window.bbox 中存在非法数值。", "invalid_window_bbox");
  }

  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    fail("window.bbox 范围不合法。", "invalid_window_bbox");
  }

  return bbox;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(4096, Math.round(parsed)));
}

function normalizeAssetInspectPayload(payload = {}) {
  const assetUrl = parseUrl(payload.assetUrl).toString();
  const bbox = parseBbox(payload.window?.bbox || payload.bbox);
  const width = parsePositiveInt(payload.window?.width, 512);
  const height = parsePositiveInt(payload.window?.height, 512);

  return {
    assetUrl,
    sourceLabel: payload.sourceLabel || "未命名资产",
    sourceType: payload.sourceType || "manual",
    window: {
      bbox,
      width,
      height,
      crs: "EPSG:4326",
    },
  };
}

function inferAssetKind(assetUrl, contentType = "") {
  const lowerUrl = assetUrl.toLowerCase();
  const lowerType = String(contentType || "").toLowerCase();

  if (
    lowerUrl.endsWith(".tif") ||
    lowerUrl.endsWith(".tiff") ||
    lowerType.includes("geotiff") ||
    lowerType.includes("image/tiff")
  ) {
    return {
      kind: "cog_candidate",
      formatLabel: "GeoTIFF / COG 候选",
    };
  }

  if (
    lowerUrl.endsWith(".hdf") ||
    lowerUrl.endsWith(".h5") ||
    lowerUrl.endsWith(".nc") ||
    lowerType.includes("application/x-hdf")
  ) {
    return {
      kind: "swath_archive",
      formatLabel: "HDF / NetCDF 归档文件",
    };
  }

  if (lowerType.startsWith("image/")) {
    return {
      kind: "preview_image",
      formatLabel: "预览图像",
    };
  }

  return {
    kind: "generic_http_asset",
    formatLabel: "通用 HTTP 资产",
  };
}

function readHeaderNumber(headers, key) {
  const raw = headers?.get?.(key);
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function probeAssetAccess(fetchImpl, assetUrl) {
  let headResponse = null;
  let getResponse = null;

  try {
    headResponse = await fetchImpl(assetUrl, {
      method: "HEAD",
      redirect: "follow",
    });
  } catch {
    headResponse = null;
  }

  const headOk = Boolean(headResponse?.ok);
  const headStatus = headResponse?.status ?? null;
  const contentType = headResponse?.headers?.get?.("content-type") || null;
  const contentLength = readHeaderNumber(headResponse?.headers, "content-length");
  const acceptRangesHeader = headResponse?.headers?.get?.("accept-ranges") || "";
  let supportsHttpRange = /\bbytes\b/i.test(acceptRangesHeader);
  let rangeProbeStatus = null;

  if (!supportsHttpRange) {
    try {
      getResponse = await fetchImpl(assetUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          Range: "bytes=0-0",
        },
      });
      rangeProbeStatus = getResponse.status;
      supportsHttpRange =
        getResponse.status === 206 ||
        /\bbytes\b/i.test(getResponse.headers?.get?.("accept-ranges") || "") ||
        Boolean(getResponse.headers?.get?.("content-range"));
      if (getResponse.body?.cancel) {
        await getResponse.body.cancel();
      }
    } catch {
      getResponse = null;
    }
  }

  return {
    accessible: headOk || Boolean(getResponse?.ok),
    headStatus,
    rangeProbeStatus,
    contentType: contentType || getResponse?.headers?.get?.("content-type") || null,
    contentLength,
    supportsHttpRange,
  };
}

function buildAssetReadPlan(request, probe) {
  const assetMeta = inferAssetKind(request.assetUrl, probe.contentType);

  if (!probe.accessible) {
    return {
      ...assetMeta,
      reader: "unavailable",
      supportsWindowRead: false,
      suggestedNextStep: "先检查 URL 是否可访问，再决定是直读还是落盘。",
    };
  }

  if (assetMeta.kind === "cog_candidate" && probe.supportsHttpRange) {
    return {
      ...assetMeta,
      reader: "remote-cog-window",
      supportsWindowRead: true,
      suggestedNextStep: "可继续接入 rasterio/GDAL 的远端窗口读取。",
    };
  }

  if (assetMeta.kind === "swath_archive") {
    return {
      ...assetMeta,
      reader: "download-then-gdal-subdataset",
      supportsWindowRead: false,
      suggestedNextStep: "先下载到本地，再按 HDF 子数据集或 NetCDF 变量进入 GDAL 读取。",
    };
  }

  if (assetMeta.kind === "preview_image") {
    return {
      ...assetMeta,
      reader: "browser-preview-only",
      supportsWindowRead: false,
      suggestedNextStep: "当前更适合用于可视化底图，不适合作为定量窗口读取资产。",
    };
  }

  return {
    ...assetMeta,
    reader: probe.supportsHttpRange ? "generic-http-range" : "download-then-inspect",
    supportsWindowRead: probe.supportsHttpRange,
    suggestedNextStep: probe.supportsHttpRange
      ? "可进一步验证是否为真正可窗口化读取的栅格资产。"
      : "建议先下载到本地，再判断能否进入后续 patch 读取流程。",
  };
}

async function inspectAsset(fetchImpl, payload) {
  const request = normalizeAssetInspectPayload(payload);
  const probe = await probeAssetAccess(fetchImpl, request.assetUrl);
  const readPlan = buildAssetReadPlan(request, probe);

  return {
    request,
    probe,
    readPlan,
    windowContract: {
      schemaVersion: "asset-window-v1",
      assetUrl: request.assetUrl,
      sourceLabel: request.sourceLabel,
      sourceType: request.sourceType,
      window: request.window,
      reader: readPlan.reader,
      supportsWindowRead: readPlan.supportsWindowRead,
    },
  };
}

module.exports = {
  buildAssetReadPlan,
  inferAssetKind,
  inspectAsset,
  normalizeAssetInspectPayload,
  probeAssetAccess,
};
