const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const {
  buildReadableProxyError,
  buildUpstreamGibsUrl,
  cacheKeyForParams,
  createProxyCache,
  normalizeProxyParams,
} = require("./basemapProxy.cjs");
const {
  normalizeStacSearchPayload,
  searchStacItems,
  stacProviderCatalog,
  summarizeFeature,
} = require("./stacSearch.cjs");
const {
  buildLaadsDownloadPlan,
  laadsProductCatalog,
  normalizeLaadsSearchPayload,
  searchLaadsContent,
} = require("./laadsSearch.cjs");
const { inspectAsset, normalizeAssetInspectPayload } = require("./assetReader.cjs");
const {
  cloudMaskCatalog,
  normalizeCloudMaskPayload,
  searchCloudMaskFiles,
} = require("./cloudMaskCatalog.cjs");

const port = Number(process.env.PORT || 4173);
const root = __dirname;
const modelPython =
  process.env.RS_MODEL_PYTHON || "C:\\Users\\max\\.conda\\envs\\torch-gpu\\python.exe";
const modelScript = path.join(root, "ml", "infer_scene.py");
const modelCheckpoint = path.join(root, "ml", "checkpoints", "aod_inversion_unet.pt");
const gibsProxyCache = createProxyCache(64);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function send(res, statusCode, contentType, body) {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  send(res, statusCode, "application/json; charset=utf-8", JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function runModel(args) {
  return new Promise((resolve, reject) => {
    execFile(
      modelPython,
      [modelScript, ...args],
      {
        cwd: root,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/stac-catalog") {
    sendJson(res, 200, stacProviderCatalog);
    return;
  }

  if (url.pathname === "/api/stac-search") {
    let payload;
    try {
      payload = await readJsonBody(req);
      normalizeStacSearchPayload(payload);
    } catch (error) {
      sendJson(res, 400, {
        error: error.code || "invalid_stac_request",
        message: error.message,
      });
      return;
    }

    try {
      const result = await searchStacItems(fetch, payload, { maxPages: 3 });
      sendJson(res, 200, {
        ...result,
        features: result.features.map((feature) => ({
          ...summarizeFeature(feature),
          bbox: feature.bbox || null,
        })),
      });
      return;
    } catch (error) {
      sendJson(res, 502, {
        error: error.code || "stac_search_failed",
        message: error.message,
      });
      return;
    }
  }

  if (url.pathname === "/api/laads-catalog") {
    sendJson(res, 200, laadsProductCatalog);
    return;
  }

  if (url.pathname === "/api/laads-search") {
    let payload;
    try {
      payload = await readJsonBody(req);
      normalizeLaadsSearchPayload(payload);
    } catch (error) {
      sendJson(res, 400, {
        error: error.code || "invalid_laads_request",
        message: error.message,
      });
      return;
    }

    try {
      const result = await searchLaadsContent(fetch, payload, { maxPages: 2 });
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 502, {
        error: error.code || "laads_search_failed",
        message: error.message,
      });
      return;
    }
  }

  if (url.pathname === "/api/laads-download-plan") {
    let payload;
    try {
      payload = await readJsonBody(req);
      const plan = buildLaadsDownloadPlan(payload);
      sendJson(res, 200, plan);
      return;
    } catch (error) {
      sendJson(res, 400, {
        error: error.code || "invalid_download_plan",
        message: error.message,
      });
      return;
    }
  }

  if (url.pathname === "/api/cloud-mask-catalog") {
    sendJson(res, 200, cloudMaskCatalog);
    return;
  }

  if (url.pathname === "/api/cloud-mask-search") {
    let payload;
    try {
      payload = await readJsonBody(req);
      normalizeCloudMaskPayload(payload);
    } catch (error) {
      sendJson(res, 400, {
        error: error.code || "invalid_cloud_mask_request",
        message: error.message,
      });
      return;
    }

    try {
      const result = await searchCloudMaskFiles(fetch, payload, { maxPages: 2 });
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 502, {
        error: error.code || "cloud_mask_search_failed",
        message: error.message,
      });
      return;
    }
  }

  if (url.pathname === "/api/asset-inspect") {
    let payload;
    try {
      payload = await readJsonBody(req);
      normalizeAssetInspectPayload(payload);
    } catch (error) {
      sendJson(res, 400, {
        error: error.code || "invalid_asset_request",
        message: error.message,
      });
      return;
    }

    try {
      const result = await inspectAsset(fetch, payload);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 502, {
        error: error.code || "asset_inspect_failed",
        message: error.message,
      });
      return;
    }
  }

  if (url.pathname === "/api/gibs-status") {
    sendJson(res, 200, {
      available: true,
      mode: "local_proxy",
      upstream: "NASA GIBS WMS",
      ...gibsProxyCache.snapshot(),
    });
    return;
  }

  if (url.pathname === "/api/gibs-proxy") {
    let params;

    try {
      params = normalizeProxyParams(url.searchParams);
    } catch (error) {
      sendJson(res, 400, buildReadableProxyError(error));
      return;
    }

    const cacheKey = cacheKeyForParams(params);
    const cached = gibsProxyCache.read(cacheKey);

    if (cached) {
      res.writeHead(200, {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=3600",
        "X-GIBS-Proxy-Cache": "HIT",
      });
      res.end(cached.body);
      return;
    }

    try {
      const upstreamUrl = buildUpstreamGibsUrl(params);
      const upstreamResponse = await fetch(upstreamUrl);

      if (!upstreamResponse.ok) {
        sendJson(
          res,
          upstreamResponse.status,
          buildReadableProxyError(
            { code: "gibs_upstream_error", message: `GIBS 返回 ${upstreamResponse.status}` },
            upstreamUrl
          )
        );
        return;
      }

      const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      gibsProxyCache.write(cacheKey, { body, contentType });

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "X-GIBS-Proxy-Cache": "MISS",
      });
      res.end(body);
      return;
    } catch (error) {
      sendJson(res, 502, buildReadableProxyError(error, "本地代理访问 GIBS 失败"));
      return;
    }
  }

  if (url.pathname === "/api/model-status") {
    try {
      if (!fs.existsSync(modelScript)) {
        sendJson(res, 200, {
          available: false,
          reason: "model_script_missing",
        });
        return;
      }

      if (!fs.existsSync(modelCheckpoint)) {
        sendJson(res, 200, {
          available: false,
          reason: "checkpoint_missing",
          checkpoint: modelCheckpoint,
        });
        return;
      }

      const output = await runModel(["--status"]);
      sendJson(res, 200, JSON.parse(output));
      return;
    } catch (error) {
      sendJson(res, 500, {
        available: false,
        reason: "status_failed",
        detail: String(error.message || error),
      });
      return;
    }
  }

  if (url.pathname === "/api/model-infer") {
    const scene = url.searchParams.get("scene");
    const date = url.searchParams.get("date");

    if (!scene || !date) {
      sendJson(res, 400, {
        error: "scene_and_date_required",
      });
      return;
    }

    try {
      const output = await runModel(["--scene", scene, "--date", date]);
      sendJson(res, 200, JSON.parse(output));
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "model_inference_failed",
        detail: String(error.message || error),
      });
      return;
    }
  }

  sendJson(res, 404, { error: "not_found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    send(res, 403, "text/plain; charset=utf-8", "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        send(res, 404, "text/plain; charset=utf-8", "Not Found");
        return;
      }
      send(res, 500, "text/plain; charset=utf-8", "Server Error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const type = mimeTypes[extension] || "application/octet-stream";
    send(res, 200, type, data);
  });
});

server.listen(port, () => {
  console.log(`Demo server running at http://localhost:${port}`);
});
