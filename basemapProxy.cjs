const GIBS_WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

function fail(message, code = "invalid_request") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function parseBbox(rawBbox) {
  const parts = String(rawBbox)
    .split(",")
    .map((value) => Number(value.trim()));

  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    fail("bbox 参数必须是 4 个数值。", "invalid_bbox");
  }

  if (parts[0] >= parts[2] || parts[1] >= parts[3]) {
    fail("bbox 的最小值必须严格小于最大值。", "invalid_bbox_range");
  }

  return parts;
}

function normalizeProxyParams(searchParams) {
  const layer = searchParams.get("layer");
  const bbox = searchParams.get("bbox");
  const width = Number(searchParams.get("width"));
  const height = Number(searchParams.get("height"));
  const time = searchParams.get("time");
  const format = searchParams.get("format") || "image/jpeg";
  const transparent = parseBoolean(searchParams.get("transparent") || "false");

  if (!layer) {
    fail("缺少 layer 参数。", "layer_required");
  }

  if (!bbox) {
    fail("缺少 bbox 参数。", "bbox_required");
  }

  if (!Number.isInteger(width) || width <= 0) {
    fail("width 必须是正整数。", "invalid_width");
  }

  if (!Number.isInteger(height) || height <= 0) {
    fail("height 必须是正整数。", "invalid_height");
  }

  if (!time || !/^\d{4}-\d{2}-\d{2}$/.test(time)) {
    fail("time 必须是 YYYY-MM-DD。", "invalid_time");
  }

  return {
    layer,
    bbox: parseBbox(bbox),
    width,
    height,
    time,
    format,
    transparent,
  };
}

function buildUpstreamGibsUrl(params) {
  const query = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: params.layer,
    STYLES: "",
    FORMAT: params.format,
    TRANSPARENT: params.transparent ? "TRUE" : "FALSE",
    SRS: "EPSG:4326",
    WIDTH: String(params.width),
    HEIGHT: String(params.height),
    BBOX: params.bbox.join(","),
    TIME: params.time,
  });

  return `${GIBS_WMS_URL}?${query.toString()}`;
}

function cacheKeyForParams(params) {
  return [
    params.layer,
    params.time,
    params.width,
    params.height,
    params.format,
    params.transparent ? "1" : "0",
    params.bbox.join(","),
  ].join("|");
}

function createProxyCache(maxEntries = 48) {
  const entries = new Map();
  const stats = {
    maxEntries,
    hits: 0,
    misses: 0,
    writes: 0,
    lastKey: null,
    lastCacheStatus: "EMPTY",
    lastRequestAt: null,
  };

  return {
    read(key) {
      stats.lastKey = key;
      stats.lastRequestAt = new Date().toISOString();

      if (!entries.has(key)) {
        stats.misses += 1;
        stats.lastCacheStatus = "MISS";
        return null;
      }

      const cached = entries.get(key);
      entries.delete(key);
      entries.set(key, cached);
      stats.hits += 1;
      stats.lastCacheStatus = "HIT";
      return cached;
    },
    write(key, payload) {
      if (entries.has(key)) {
        entries.delete(key);
      }

      entries.set(key, payload);
      stats.writes += 1;

      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        entries.delete(oldestKey);
      }
    },
    snapshot() {
      return {
        ...stats,
        entries: entries.size,
        keys: [...entries.keys()].slice(-6).reverse(),
      };
    },
  };
}

function buildReadableProxyError(error, detail = null) {
  return {
    error: error.code || "proxy_failed",
    message: error.message,
    detail,
  };
}

module.exports = {
  GIBS_WMS_URL,
  buildReadableProxyError,
  buildUpstreamGibsUrl,
  cacheKeyForParams,
  createProxyCache,
  normalizeProxyParams,
};
